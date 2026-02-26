import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ROBOFLOW_MGI_URL = 'https://serverless.roboflow.com/invivo/workflows/custom-workflow';
const ROBOFLOW_SPORECOUNT_URL = 'https://serverless.roboflow.com/invivo/workflows/sporecount';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

interface ScoreRequest {
  image_id: string;
  image_url: string;
}

interface RoboflowResult {
  MGI: string;
}

function parseSporeCountResponse(raw: unknown): number {
  try {
    if (!Array.isArray(raw) || raw.length === 0) return 0;
    const first = raw[0];
    const colonyField = first?.colony_count;
    if (colonyField === undefined || colonyField === null) return 0;

    if (typeof colonyField === 'number') return Math.max(0, Math.round(colonyField));

    const str = String(colonyField);
    const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1].trim() : str.trim();
    const parsed = JSON.parse(jsonStr);
    const count = typeof parsed === 'object' && parsed !== null
      ? parsed.colony_count
      : parsed;
    const num = parseInt(String(count), 10);
    return isNaN(num) || num < 0 ? 0 : num;
  } catch {
    return 0;
  }
}

interface PlausibilityResult {
  plausible: boolean;
  confidence: number;
  adjusted_score: number | null;
  flag_reasons: string[];
  method: string;
  context_scores: number[];
  median: number | null;
  mad: number | null;
  modified_z_score: number | null;
  growth_rate_per_hour: number | null;
  thresholds_used: Record<string, unknown>;
  context_image_ids: string[];
}

function determinePriority(result: PlausibilityResult): string {
  const zScore = Math.abs(result.modified_z_score ?? 0);
  if (zScore > 7 || (result.growth_rate_per_hour ?? 0) > 0.05) return 'critical';
  if (zScore > 5 || (result.growth_rate_per_hour ?? 0) > 0.03) return 'high';
  return 'normal';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let imageId: string | undefined;

  try {
    const body: ScoreRequest = await req.json();
    const { image_id, image_url } = body;
    imageId = image_id;

    if (!image_id || !image_url) {
      throw new Error('Missing required fields: image_id, image_url');
    }

    console.log('[MGI Scoring] Processing image:', image_id);

    await supabaseClient
      .from('device_images')
      .update({ mgi_scoring_status: 'in_progress' })
      .eq('image_id', image_id);

    const mgiPayload = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: { type: 'url', value: image_url },
        param2: 'MGI',
      },
    };

    const sporecountPayload = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: { type: 'url', value: image_url },
        colony_count: 0,
      },
    };

    console.log('[MGI Scoring] Calling Roboflow MGI + Sporecount in parallel...');

    const [mgiResponse, sporecountResponse] = await Promise.all([
      fetch(ROBOFLOW_MGI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mgiPayload),
      }),
      fetch(ROBOFLOW_SPORECOUNT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sporecountPayload),
      }).catch((e: Error) => {
        console.error('[MGI Scoring] Sporecount API fetch error:', e.message);
        return null;
      }),
    ]);

    if (!mgiResponse.ok) {
      const errorText = await mgiResponse.text();
      throw new Error(`Roboflow MGI API error: ${mgiResponse.status} - ${errorText}`);
    }

    const roboflowData = await mgiResponse.json();
    console.log('[MGI Scoring] MGI response:', JSON.stringify(roboflowData));

    let mgiScore: number | null = null;
    let colonyCount = 0;

    const outputs = roboflowData.outputs || roboflowData;
    if (Array.isArray(outputs) && outputs.length > 0) {
      const firstResult = outputs[0] as RoboflowResult;
      if (firstResult.MGI !== undefined) {
        mgiScore = parseFloat(firstResult.MGI);
      }
    }

    if (sporecountResponse && sporecountResponse.ok) {
      try {
        const sporecountData = await sporecountResponse.json();
        console.log('[MGI Scoring] Sporecount response:', JSON.stringify(sporecountData));
        const sporecountOutputs = sporecountData.outputs || sporecountData;
        colonyCount = parseSporeCountResponse(sporecountOutputs);
      } catch (e) {
        console.error('[MGI Scoring] Sporecount response parse error:', e);
      }
    } else if (sporecountResponse) {
      console.error('[MGI Scoring] Sporecount API error:', sporecountResponse.status);
    }

    console.log('[MGI Scoring] Colony count:', colonyCount);

    if (mgiScore === null || isNaN(mgiScore) || mgiScore < 0 || mgiScore > 1) {
      console.error('[MGI Scoring] Invalid MGI score:', mgiScore);

      await supabaseClient.from('async_error_logs').insert({
        table_name: 'device_images',
        trigger_name: 'score_mgi_image',
        function_name: 'roboflow_score',
        payload: { image_id, image_url, roboflow_response: roboflowData },
        error_message: `Invalid MGI score: ${mgiScore}`,
        error_details: {},
      });

      await supabaseClient
        .from('device_images')
        .update({ mgi_scoring_status: 'failed', roboflow_response: roboflowData })
        .eq('image_id', image_id);

      throw new Error(`Invalid MGI score: ${mgiScore}`);
    }

    console.log('[MGI Scoring] Parsed MGI score:', mgiScore);

    const { data: imageRecord } = await supabaseClient
      .from('device_images')
      .select('device_id, captured_at, company_id, program_id, site_id, site_device_session_id')
      .eq('image_id', image_id)
      .maybeSingle();

    if (!imageRecord?.device_id) {
      throw new Error('Image record not found or missing device_id');
    }

    const scoredAt = new Date().toISOString();
    const capturedAt = imageRecord.captured_at || scoredAt;

    // --- QA PLAUSIBILITY GATE ---
    let isPlausible = true;
    let qaResult: PlausibilityResult | null = null;

    try {
      const { data: plausibilityData, error: plausibilityError } = await supabaseClient.rpc(
        'fn_check_mgi_plausibility',
        {
          p_device_id: imageRecord.device_id,
          p_proposed_score: mgiScore,
          p_captured_at: capturedAt,
        }
      );

      if (plausibilityError) {
        console.error('[MGI Scoring] Plausibility check error:', plausibilityError.message);
      } else if (plausibilityData) {
        qaResult = plausibilityData as PlausibilityResult;
        isPlausible = qaResult.plausible;
        console.log('[MGI Scoring] Plausibility result:', JSON.stringify({
          plausible: isPlausible,
          confidence: qaResult.confidence,
          flag_reasons: qaResult.flag_reasons,
        }));
      }
    } catch (e) {
      console.error('[MGI Scoring] Plausibility check exception (proceeding as plausible):', e);
    }

    if (isPlausible) {
      // --- PLAUSIBLE: write score as-is, proceed with alerts ---
      const updatePayload: Record<string, unknown> = {
        mgi_score: mgiScore,
        scored_at: scoredAt,
        mgi_scoring_status: 'complete',
        roboflow_response: roboflowData,
        mgi_qa_status: 'accepted',
        mgi_confidence: qaResult?.confidence ?? 1.0,
        colony_count: colonyCount,
      };

      const { error: updateError } = await supabaseClient
        .from('device_images')
        .update(updatePayload)
        .eq('image_id', image_id);

      if (updateError) throw updateError;

      console.log('[MGI Scoring] Score accepted, running alert checks...');

      const mgiAlertChecks = [
        { fn: 'check_absolute_thresholds', params: { p_device_id: imageRecord.device_id, p_temperature: null, p_humidity: null, p_mgi: mgiScore, p_measurement_timestamp: scoredAt } },
        { fn: 'check_mgi_velocity', params: { p_device_id: imageRecord.device_id, p_current_mgi: mgiScore, p_measurement_timestamp: scoredAt } },
        { fn: 'check_mgi_program_speed', params: { p_device_id: imageRecord.device_id, p_current_mgi: mgiScore, p_measurement_timestamp: scoredAt } },
      ];

      for (const check of mgiAlertChecks) {
        try {
          const { data: alerts, error: alertErr } = await supabaseClient.rpc(check.fn, check.params);
          if (alertErr) {
            console.error(`[MGI Scoring] ${check.fn} error:`, alertErr.message);
          } else {
            const parsed = Array.isArray(alerts) ? alerts : (alerts ? JSON.parse(alerts) : []);
            if (parsed.length > 0) {
              console.log(`[MGI Scoring] ${check.fn}: ${parsed.length} alert(s) triggered`);
            }
          }
        } catch (e) {
          console.error(`[MGI Scoring] ${check.fn} exception:`, e);
        }
      }

      // --- TREND CONFIRMATION: check if this accepted score resolves pending reviews ---
      let trendResolved: Record<string, unknown> | null = null;
      try {
        const { data: trendData, error: trendErr } = await supabaseClient.rpc(
          'fn_check_trend_confirmation',
          { p_device_id: imageRecord.device_id }
        );
        if (trendErr) {
          console.error('[MGI Scoring] Trend confirmation error:', trendErr.message);
        } else if (trendData && (trendData as Record<string, unknown>).resolved) {
          trendResolved = trendData as Record<string, unknown>;
          console.log('[MGI Scoring] Trend confirmation resolved', trendResolved.resolved, 'pending review(s)');
        }
      } catch (e) {
        console.error('[MGI Scoring] Trend confirmation exception:', e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          image_id,
          mgi_score: mgiScore,
          colony_count: colonyCount,
          qa_status: 'accepted',
          trend_confirmation: trendResolved,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- NOT PLAUSIBLE: auto-correct, queue for review, SKIP alerts ---
    const adjustedScore = qaResult!.adjusted_score ?? 0;
    const priority = determinePriority(qaResult!);

    console.log('[MGI Scoring] Score flagged as outlier. Original:', mgiScore, 'Adjusted:', adjustedScore, 'Priority:', priority);

    const flaggedPayload: Record<string, unknown> = {
      mgi_score: adjustedScore,
      mgi_original_score: mgiScore,
      mgi_adjusted_score: adjustedScore,
      scored_at: scoredAt,
      mgi_scoring_status: 'complete',
      roboflow_response: roboflowData,
      mgi_qa_status: 'pending_review',
      mgi_confidence: qaResult!.confidence,
      mgi_qa_method: qaResult!.method,
      mgi_qa_details: qaResult as unknown as Record<string, unknown>,
      colony_count: colonyCount,
    };

    const { error: updateError } = await supabaseClient
      .from('device_images')
      .update(flaggedPayload)
      .eq('image_id', image_id);

    if (updateError) throw updateError;

    // Insert into review queue
    const { data: reviewRecord, error: reviewError } = await supabaseClient
      .from('mgi_review_queue')
      .insert({
        image_id,
        device_id: imageRecord.device_id,
        company_id: imageRecord.company_id,
        program_id: imageRecord.program_id,
        site_id: imageRecord.site_id,
        session_id: imageRecord.site_device_session_id,
        original_score: mgiScore,
        adjusted_score: adjustedScore,
        qa_method: qaResult!.method,
        qa_details: qaResult as unknown as Record<string, unknown>,
        neighbor_image_ids: qaResult!.context_image_ids || [],
        thresholds_used: qaResult!.thresholds_used,
        status: 'pending',
        priority,
      })
      .select('review_id')
      .maybeSingle();

    if (reviewError) {
      console.error('[MGI Scoring] Failed to create review queue entry:', reviewError.message);
    }

    // Insert admin notification
    if (reviewRecord?.review_id) {
      const { data: deviceInfo } = await supabaseClient
        .from('devices')
        .select('device_code')
        .eq('device_id', imageRecord.device_id)
        .maybeSingle();

      const deviceCode = deviceInfo?.device_code || imageRecord.device_id;
      const medianStr = qaResult!.median !== null ? `${(qaResult!.median * 100).toFixed(1)}%` : 'N/A';

      const { error: notifError } = await supabaseClient
        .from('admin_notifications')
        .insert({
          notification_type: 'mgi_review_required',
          reference_id: reviewRecord.review_id,
          reference_type: 'mgi_review_queue',
          title: `MGI Outlier: Device ${deviceCode} scored ${(mgiScore * 100).toFixed(1)}% (context median: ${medianStr})`,
          body: `Auto-corrected to ${(adjustedScore * 100).toFixed(1)}%. Detection: ${qaResult!.method}. Flagged reasons: ${qaResult!.flag_reasons?.join(', ') || 'unknown'}.`,
          severity: priority === 'critical' ? 'critical' : priority === 'high' ? 'warning' : 'info',
          company_id: imageRecord.company_id,
          site_id: imageRecord.site_id,
          status: 'pending',
        });

      if (notifError) {
        console.error('[MGI Scoring] Failed to create admin notification:', notifError.message);
      } else {
        console.log('[MGI Scoring] Admin notification created for review:', reviewRecord.review_id);

        // Invoke notify_admin_review edge function asynchronously
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          fetch(`${supabaseUrl}/functions/v1/notify_admin_review`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ review_id: reviewRecord.review_id }),
          }).catch(e => console.error('[MGI Scoring] notify_admin_review dispatch error:', e));
        } catch (e) {
          console.error('[MGI Scoring] Failed to dispatch notify_admin_review:', e);
        }
      }
    }

    console.log('[MGI Scoring] Image flagged for review. Alerts SKIPPED.');

    return new Response(
      JSON.stringify({
        success: true,
        image_id,
        mgi_score: adjustedScore,
        mgi_original_score: mgiScore,
        colony_count: colonyCount,
        qa_status: 'pending_review',
        review_id: reviewRecord?.review_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[MGI Scoring] Error:', error);

    if (imageId) {
      try {
        await supabaseClient
          .from('device_images')
          .update({
            mgi_scoring_status: 'failed',
            roboflow_response: { error: error instanceof Error ? error.message : 'Unknown error' },
          })
          .eq('image_id', imageId);
      } catch (e) {
        console.error('[MGI Scoring] Failed to update error status:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
