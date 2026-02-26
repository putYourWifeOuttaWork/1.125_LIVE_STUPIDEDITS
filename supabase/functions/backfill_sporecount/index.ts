import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ROBOFLOW_SPORECOUNT_URL = 'https://serverless.roboflow.com/invivo/workflows/sporecount';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

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

interface BackfillRequest {
  image_ids: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const body: BackfillRequest = await req.json().catch(() => ({ image_ids: [] }));
    const imageIds = body.image_ids ?? [];

    if (imageIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'image_ids array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Backfill] Processing ${imageIds.length} images`);

    const { data: images, error: fetchError } = await supabase
      .from('device_images')
      .select('image_id, device_id, image_url, captured_at')
      .in('image_id', imageIds)
      .not('image_url', 'is', null)
      .order('device_id')
      .order('captured_at', { ascending: true });

    if (fetchError) throw fetchError;

    const rows = images ?? [];
    let successes = 0;
    let failures = 0;
    const failedIds: string[] = [];
    const results: { image_id: string; colony_count: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const payload = {
          api_key: ROBOFLOW_API_KEY,
          inputs: {
            image: { type: 'url', value: row.image_url },
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
          throw new Error(`Roboflow ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const outputs = data.outputs || data;
        const colonyCount = parseSporeCountResponse(outputs);

        const { error: updateError } = await supabase
          .from('device_images')
          .update({ colony_count: colonyCount })
          .eq('image_id', row.image_id);

        if (updateError) throw updateError;

        successes++;
        results.push({ image_id: row.image_id, colony_count: colonyCount });
        console.log(`[Backfill] ${i + 1}/${rows.length} OK colony_count=${colonyCount}`);
      } catch (err) {
        failures++;
        failedIds.push(row.image_id);
        console.error(`[Backfill] ${i + 1}/${rows.length} FAILED: ${err}`);
      }
    }

    const deviceIds = [...new Set(rows.map((r: { device_id: string }) => r.device_id))];

    if (deviceIds.length > 0) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.rpc('_backfill_colony_velocity', {
        p_device_ids: deviceIds,
        p_cutoff: cutoff,
      });

      for (const deviceId of deviceIds) {
        const { data: latest } = await supabase
          .from('device_images')
          .select('colony_count, captured_at')
          .eq('device_id', deviceId)
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
            .eq('device_id', deviceId);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: rows.length,
        successes,
        failures,
        failed_image_ids: failedIds,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
