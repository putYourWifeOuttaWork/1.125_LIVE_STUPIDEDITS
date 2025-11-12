/**
 * Score MGI Image via Roboflow
 *
 * Accepts image URL, calls Roboflow workflow, stores MGI score
 * Used by device_images completion trigger
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ROBOFLOW_API_URL = 'https://serverless.roboflow.com/invivo/workflows/custom-workflow';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

interface RoboflowRequest {
  api_key: string;
  inputs: {
    image: {
      type: string;
      value: string;
    };
    param: string;
  };
}

interface RoboflowResponse {
  outputs?: {
    mgi_score?: number;
    confidence?: number;
  }[];
  error?: string;
}

interface ScoreRequest {
  image_id: string;
  image_url: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ScoreRequest = await req.json();
    const { image_id, image_url } = body;

    if (!image_id || !image_url) {
      throw new Error('Missing required fields: image_id, image_url');
    }

    console.log('[MGI Scoring] Processing image:', image_id, 'URL:', image_url);

    // Call Roboflow API
    const roboflowPayload: RoboflowRequest = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: {
          type: 'url',
          value: image_url,
        },
        param: '1-100% only',
      },
    };

    console.log('[MGI Scoring] Calling Roboflow API...');

    const roboflowResponse = await fetch(ROBOFLOW_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(roboflowPayload),
    });

    if (!roboflowResponse.ok) {
      const errorText = await roboflowResponse.text();
      throw new Error(`Roboflow API error: ${roboflowResponse.status} - ${errorText}`);
    }

    const roboflowData: RoboflowResponse = await roboflowResponse.json();

    console.log('[MGI Scoring] Roboflow response:', JSON.stringify(roboflowData));

    // Extract MGI score from response
    // Adjust parsing based on actual Roboflow response structure
    let mgiScore: number | null = null;
    let confidence: number | null = null;

    if (roboflowData.outputs && roboflowData.outputs.length > 0) {
      const output = roboflowData.outputs[0];
      mgiScore = output.mgi_score ?? null;
      confidence = output.confidence ?? null;
    } else if (roboflowData.error) {
      throw new Error(`Roboflow error: ${roboflowData.error}`);
    }

    if (mgiScore === null) {
      console.warn('[MGI Scoring] No MGI score returned from Roboflow');

      // Log to async_error_logs for monitoring
      await supabaseClient.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'score_mgi_image',
        function_name: 'roboflow_score',
        payload: { image_id, image_url, roboflow_response: roboflowData },
        error_message: 'No MGI score in Roboflow response',
        error_details: {},
      });

      return new Response(
        JSON.stringify({
          success: false,
          message: 'No MGI score returned from Roboflow',
          image_id,
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Normalize score to 0.0-1.0 if needed
    // Assuming Roboflow returns 1-100 based on "param": "1-100% only"
    const normalizedScore = mgiScore / 100;

    console.log('[MGI Scoring] Normalized MGI score:', normalizedScore, 'Confidence:', confidence);

    // Get observation_id from device_images
    const { data: imageData, error: imageError } = await supabaseClient
      .from('device_images')
      .select('observation_id')
      .eq('image_id', image_id)
      .single();

    if (imageError || !imageData?.observation_id) {
      throw new Error(`No observation found for image_id: ${image_id}`);
    }

    const observationId = imageData.observation_id;

    // Update petri_observations with MGI score
    const { error: updateError } = await supabaseClient
      .from('petri_observations')
      .update({
        mgi_score: normalizedScore,
        mgi_confidence: confidence,
        mgi_scored_at: new Date().toISOString(),
      })
      .eq('observation_id', observationId);

    if (updateError) {
      throw updateError;
    }

    console.log('[MGI Scoring] Successfully updated observation:', observationId, 'with score:', normalizedScore);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'MGI score saved successfully',
        image_id,
        observation_id: observationId,
        mgi_score: normalizedScore,
        confidence,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[MGI Scoring] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
