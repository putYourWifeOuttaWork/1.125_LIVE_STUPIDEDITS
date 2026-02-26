import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROBOFLOW_SPORECOUNT_URL = 'https://serverless.roboflow.com/invivo/workflows/sporecount';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

interface CountRequest {
  image_id: string;
  image_url: string;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const body: CountRequest = await req.json();
    const { image_id, image_url } = body;

    if (!image_id || !image_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: image_id, image_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Colony Count] Processing image:', image_id);

    const payload = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: { type: 'url', value: image_url },
        colony_count: 0,
      },
    };

    const response = await fetch(ROBOFLOW_SPORECOUNT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Roboflow sporecount API error: ${response.status} - ${errText}`);
    }

    const rawData = await response.json();
    console.log('[Colony Count] Raw Roboflow response:', JSON.stringify(rawData));

    const outputs = rawData.outputs || rawData;
    const colonyCount = parseSporeCountResponse(outputs);

    console.log('[Colony Count] Parsed colony_count:', colonyCount, 'from outputs:', JSON.stringify(outputs));

    const { error: updateError } = await supabase
      .from('device_images')
      .update({
        colony_count: colonyCount,
        sporecount_response: rawData,
      })
      .eq('image_id', image_id);

    if (updateError) throw updateError;

    const { data: imageRecord } = await supabase
      .from('device_images')
      .select('device_id, captured_at')
      .eq('image_id', image_id)
      .maybeSingle();

    if (imageRecord?.device_id) {
      try {
        await supabase.rpc('_backfill_colony_velocity', {
          p_device_ids: [imageRecord.device_id],
          p_cutoff: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (e) {
        console.error('[Colony Count] Velocity backfill error (non-fatal):', e);
      }

      const { data: latest } = await supabase
        .from('device_images')
        .select('colony_count, captured_at')
        .eq('device_id', imageRecord.device_id)
        .not('colony_count', 'is', null)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        await supabase
          .from('devices')
          .update({
            latest_colony_count: latest.colony_count,
            latest_colony_count_at: latest.captured_at,
          })
          .eq('device_id', imageRecord.device_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        image_id,
        colony_count: colonyCount,
        raw_response: rawData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Colony Count] Error:', error);
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
