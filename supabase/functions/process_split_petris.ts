// Supabase Edge Function to handle image splitting for petri observations
// This is a placeholder/skeleton implementation that would interface with your Python app

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

// Create a Supabase client with the Admin key (since we need full access)
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const pythonAppUrl = Deno.env.get("PYTHON_APP_URL") || "https://your-python-app-url.com/process-split";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Interface for response from Python app
interface PythonAppResponse {
  success: boolean;
  left_image_url?: string;
  right_image_url?: string;
  error?: string;
}

// Process petri observations that need to be split
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
    });
  }

  try {
    // Only allow POST method
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const requestData = await req.json();
    const observationId = requestData.observationId;
    
    if (!observationId) {
      return new Response(JSON.stringify({ error: "Missing observation ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    console.log(`Processing split for observation ID: ${observationId}`);
    
    // Get the main observation and related split observations
    const { data: mainObservation, error: mainError } = await supabase
      .from("petri_observations")
      .select("*")
      .eq("observation_id", observationId)
      .eq("is_split_source", true)
      .single();
      
    if (mainError || !mainObservation) {
      console.error("Error fetching main observation:", mainError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: mainError?.message || "Main observation not found" 
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // Check if this observation has already been processed
    if (mainObservation.split_processed) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "This observation has already been processed" 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // Get the left/right observations
    const { data: splitObservations, error: splitError } = await supabase
      .from("petri_observations")
      .select("*")
      .eq("main_petri_id", observationId);
      
    if (splitError) {
      console.error("Error fetching split observations:", splitError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: splitError.message 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    // Verify we have both left and right observations
    if (!splitObservations || splitObservations.length < 2) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Could not find both left and right split observations" 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // In a real implementation, you would now call your Python app to process the image
    // Here we'll just simulate that with a console log
    console.log("Would call Python app with main observation:", {
      observation_id: mainObservation.observation_id,
      image_url: mainObservation.image_url,
      left_observation_id: splitObservations.find(o => o.phase_observation_settings?.position === 'left')?.observation_id,
      right_observation_id: splitObservations.find(o => o.phase_observation_settings?.position === 'right')?.observation_id
    });
    
    // In a real implementation, you would make an HTTP request to your Python app
    // const pythonResponse = await fetch(pythonAppUrl, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     main_observation_id: mainObservation.observation_id,
    //     main_image_url: mainObservation.image_url,
    //     left_observation_id: splitObservations.find(o => o.phase_observation_settings?.position === 'left')?.observation_id,
    //     right_observation_id: splitObservations.find(o => o.phase_observation_settings?.position === 'right')?.observation_id,
    //   })
    // });
    
    // const pythonResult: PythonAppResponse = await pythonResponse.json();
    
    // For testing purposes, simulate a successful response
    const pythonResult: PythonAppResponse = {
      success: true,
      left_image_url: mainObservation.image_url + "?left=true",
      right_image_url: mainObservation.image_url + "?right=true"
    };
    
    // If Python app processing was successful, update the database
    if (pythonResult.success && pythonResult.left_image_url && pythonResult.right_image_url) {
      // Call the RPC function to complete the split processing
      const { data: completeResult, error: completeError } = await supabase.rpc(
        "complete_petri_split_processing",
        {
          p_main_petri_id: mainObservation.observation_id,
          p_left_image_url: pythonResult.left_image_url,
          p_right_image_url: pythonResult.right_image_url
        }
      );
      
      if (completeError) {
        console.error("Error completing petri split processing:", completeError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: completeError.message 
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: "Split processing completed successfully",
          result: completeResult
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: pythonResult.error || "Unknown error in Python app" 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Unexpected error occurred" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});