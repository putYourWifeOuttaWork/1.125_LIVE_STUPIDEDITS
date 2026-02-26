import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROBOFLOW_FIND_MOLDS_URL = 'https://serverless.roboflow.com/invivo/workflows/find-molds';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

interface FindMoldsDetection {
  width: number;
  height: number;
  x: number;
  y: number;
  confidence: number;
  class_id: number;
  class: string;
  detection_id: string;
  parent_id: string;
}

function parseFindMoldsResponse(raw: unknown): {
  colonyCount: number;
  detections: FindMoldsDetection[];
  imageWidth: number;
  imageHeight: number;
  avgConfidence: number;
  annotatedImageBase64: string | null;
} {
  const result = {
    colonyCount: 0,
    detections: [] as FindMoldsDetection[],
    imageWidth: 0,
    imageHeight: 0,
    avgConfidence: 0,
    annotatedImageBase64: null as string | null,
  };

  try {
    const outputs = Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.outputs;
    const data = Array.isArray(outputs) ? outputs[0] : outputs;
    if (!data) return result;

    const d = data as Record<string, unknown>;

    if (typeof d.output_colony_count === 'number') {
      result.colonyCount = Math.max(0, Math.round(d.output_colony_count));
    }

    if (d.output_image && typeof d.output_image === 'object') {
      const img = d.output_image as Record<string, unknown>;
      if (img.type === 'base64' && typeof img.value === 'string') {
        result.annotatedImageBase64 = img.value;
      } else if (typeof img.value === 'string' && img.value.startsWith('http')) {
        result.annotatedImageBase64 = img.value;
      }
    }

    const preds = d.predictions as Record<string, unknown> | undefined;
    if (preds) {
      const imgMeta = preds.image as { width: number; height: number } | undefined;
      if (imgMeta) {
        result.imageWidth = imgMeta.width || 0;
        result.imageHeight = imgMeta.height || 0;
      }

      const predList = preds.predictions as FindMoldsDetection[] | undefined;
      if (Array.isArray(predList)) {
        result.detections = predList;
        if (predList.length > 0) {
          const totalConf = predList.reduce((sum, p) => sum + (p.confidence || 0), 0);
          result.avgConfidence = totalConf / predList.length;
        }
      }
    }
  } catch (e) {
    console.error('[Backfill FM] Parse error:', e);
  }

  return result;
}

async function uploadAnnotatedImage(
  supabase: ReturnType<typeof createClient>,
  imageId: string,
  base64OrUrl: string
): Promise<string | null> {
  try {
    if (base64OrUrl.startsWith('http')) {
      return base64OrUrl;
    }

    const cleanBase64 = base64OrUrl.replace(/^data:image\/\w+;base64,/, '');
    const binaryStr = atob(cleanBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const filePath = `annotated/${imageId}_annotated.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('device-images')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Backfill FM] Upload error:', uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('device-images')
      .getPublicUrl(filePath);

    return urlData?.publicUrl || null;
  } catch (e) {
    console.error('[Backfill FM] Upload exception:', e);
    return null;
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

    console.log(`[Backfill FM] Processing ${imageIds.length} images`);

    const { data: images, error: fetchError } = await supabase
      .from('device_images')
      .select('image_id, device_id, company_id, image_url, captured_at, site_id')
      .in('image_id', imageIds)
      .not('image_url', 'is', null)
      .order('device_id')
      .order('captured_at', { ascending: true });

    if (fetchError) throw fetchError;

    const rows = images ?? [];
    let successes = 0;
    let failures = 0;
    const failedIds: string[] = [];
    const results: { image_id: string; colony_count: number; detection_count: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const payload = {
          api_key: ROBOFLOW_API_KEY,
          inputs: {
            image: { type: 'url', value: row.image_url },
          },
        };

        const response = await fetch(ROBOFLOW_FIND_MOLDS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Roboflow ${response.status}: ${errText}`);
        }

        const rawData = await response.json();
        const fmOutputs = rawData?.outputs || rawData;
        const parsed = parseFindMoldsResponse(fmOutputs);

        let annotatedImageUrl: string | null = null;
        if (parsed.annotatedImageBase64) {
          annotatedImageUrl = await uploadAnnotatedImage(supabase, row.image_id, parsed.annotatedImageBase64);
        }

        const updateFields: Record<string, unknown> = {
          colony_count: parsed.colonyCount,
          find_molds_response: rawData,
          colony_detections: parsed.detections,
          avg_colony_confidence: parsed.avgConfidence || null,
          colony_image_width: parsed.imageWidth || null,
          colony_image_height: parsed.imageHeight || null,
        };
        if (annotatedImageUrl) {
          updateFields.annotated_image_url = annotatedImageUrl;
        }

        const { error: updateError } = await supabase
          .from('device_images')
          .update(updateFields)
          .eq('image_id', row.image_id);

        if (updateError) throw updateError;

        if (row.device_id && parsed.detections.length > 0) {
          try {
            const detRows = parsed.detections.map((d) => ({
              detection_id: d.detection_id || null,
              image_id: row.image_id,
              device_id: row.device_id,
              company_id: row.company_id,
              x: d.x,
              y: d.y,
              width: d.width,
              height: d.height,
              area: d.width * d.height,
              confidence: d.confidence,
              class: d.class || 'mold',
              captured_at: row.captured_at,
            }));

            const { error: insertErr } = await supabase
              .from('colony_detection_details')
              .insert(detRows);

            if (insertErr) {
              console.error(`[Backfill FM] Detection insert error for ${row.image_id}:`, insertErr.message);
            } else {
              const { error: matchErr } = await supabase.rpc(
                'fn_match_colony_tracks',
                {
                  p_image_id: row.image_id,
                  p_device_id: row.device_id,
                  p_company_id: row.company_id,
                }
              );
              if (matchErr) {
                console.error(`[Backfill FM] Track match error for ${row.image_id}:`, matchErr.message);
              }
            }
          } catch (e) {
            console.error(`[Backfill FM] Detection/tracking error (non-fatal) for ${row.image_id}:`, e);
          }
        }

        successes++;
        results.push({
          image_id: row.image_id,
          colony_count: parsed.colonyCount,
          detection_count: parsed.detections.length,
        });
        console.log(`[Backfill FM] ${i + 1}/${rows.length} OK count=${parsed.colonyCount} detections=${parsed.detections.length}`);
      } catch (err) {
        failures++;
        failedIds.push(row.image_id);
        console.error(`[Backfill FM] ${i + 1}/${rows.length} FAILED: ${err}`);
      }
    }

    const deviceIds = [...new Set(rows.map((r: { device_id: string }) => r.device_id))];

    if (deviceIds.length > 0) {
      try {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.rpc('_backfill_colony_velocity', {
          p_device_ids: deviceIds,
          p_cutoff: cutoff,
        });
      } catch (e) {
        console.error('[Backfill FM] Velocity backfill error (non-fatal):', e);
      }

      for (const deviceId of deviceIds) {
        try {
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
        } catch (e) {
          console.error(`[Backfill FM] Device rollup error for ${deviceId}:`, e);
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
    console.error('[Backfill FM] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
