/**
 * Score MGI Image via Roboflow - Device-Centric Version
 *
 * Accepts image_id and image_url, calls Roboflow workflow, stores MGI score in device_images
 * Triggers automatic cascade: velocity → speed → rollup → snapshots → alerts
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ROBOFLOW_API_URL = 'https://serverless.roboflow.com/invivo/workflows/custom-workflow';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

interface ScoreRequest {
  image_id: string;
  image_url: string;
}

interface RoboflowResult {
  MGI: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
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

    console.log('[MGI Scoring] Processing image:', image_id);
    console.log('[MGI Scoring] Image URL:', image_url);

    // Mark scoring as in-progress
    await supabaseClient
      .from('device_images')
      .update({ mgi_scoring_status: 'in_progress' })
      .eq('image_id', image_id);

    // Call Roboflow API with CORRECT parameters
    const roboflowPayload = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: { type: 'url', value: image_url },
        param2: 'MGI'  // Correct parameter name and value
      }
    };

    console.log('[MGI Scoring] Calling Roboflow API...');

    const roboflowResponse = await fetch(ROBOFLOW_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roboflowPayload),
    });

    if (!roboflowResponse.ok) {
      const errorText = await roboflowResponse.text();
      throw new Error(`Roboflow API error: ${roboflowResponse.status} - ${errorText}`);
    }

    const roboflowData = await roboflowResponse.json();
    console.log('[MGI Scoring] Roboflow response:', JSON.stringify(roboflowData));

    // Parse response: {"outputs": [{"MGI": "0.15"}], "profiler_trace": []}
    let mgiScore: number | null = null;

    // Handle new format with outputs wrapper
    const outputs = roboflowData.outputs || roboflowData;

    if (Array.isArray(outputs) && outputs.length > 0) {
      const firstResult = outputs[0] as RoboflowResult;
      if (firstResult.MGI !== undefined) {
        mgiScore = parseFloat(firstResult.MGI);
      }
    }

    if (mgiScore === null || isNaN(mgiScore) || mgiScore < 0 || mgiScore > 1) {
      console.error('[MGI Scoring] Invalid MGI score:', mgiScore);

      // Log error for monitoring
      await supabaseClient.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'score_mgi_image',
        function_name: 'roboflow_score',
        payload: { image_id, image_url, roboflow_response: roboflowData },
        error_message: `Invalid MGI score: ${mgiScore}`,
        error_details: {},
      });

      // Mark as failed
      await supabaseClient
        .from('device_images')
        .update({
          mgi_scoring_status: 'failed',
          roboflow_response: roboflowData
        })
        .eq('image_id', image_id);

      throw new Error(`Invalid MGI score: ${mgiScore}`);
    }

    console.log('[MGI Scoring] Parsed MGI score:', mgiScore);

    // Update device_images - cascade triggers automatically!
    // This will trigger:
    // 1. calculate_and_rollup_mgi() - calculates velocity, speed, rolls up to devices
    // 2. Snapshot regeneration (if trigger exists)
    // 3. Alert threshold checks (if trigger exists)
    const { error: updateError } = await supabaseClient
      .from('device_images')
      .update({
        mgi_score: mgiScore,
        scored_at: new Date().toISOString(),
        mgi_scoring_status: 'complete',
        roboflow_response: roboflowData
      })
      .eq('image_id', image_id);

    if (updateError) {
      throw updateError;
    }

    console.log('[MGI Scoring] Successfully scored image:', image_id, 'Score:', mgiScore);

    return new Response(
      JSON.stringify({
        success: true,
        image_id,
        mgi_score: mgiScore
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[MGI Scoring] Error:', error);

    // Mark as failed
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const body = await req.json();
      await supabaseClient
        .from('device_images')
        .update({
          mgi_scoring_status: 'failed',
          roboflow_response: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
        .eq('image_id', body.image_id);
    } catch (e) {
      console.error('[MGI Scoring] Failed to update error status:', e);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
