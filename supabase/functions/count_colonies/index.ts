import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROBOFLOW_FIND_MOLDS_URL = 'https://serverless.roboflow.com/invivo/workflows/find-molds';
const ROBOFLOW_API_KEY = 'VD3fJI17y2IgnbOhYmvu';

interface CountRequest {
  image_id: string;
  image_url: string;
}

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
    console.error('[Colony Count] Parse error:', e);
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
      console.error('[Colony Count] Annotated upload error:', uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('device-images')
      .getPublicUrl(filePath);

    return urlData?.publicUrl || null;
  } catch (e) {
    console.error('[Colony Count] Annotated upload exception:', e);
    return null;
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
      },
    };

    const response = await fetch(ROBOFLOW_FIND_MOLDS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Roboflow find-molds API error: ${response.status} - ${errText}`);
    }

    const rawData = await response.json();
    console.log('[Colony Count] Raw response received');

    const fmOutputs = rawData?.outputs || rawData;
    const parsed = parseFindMoldsResponse(fmOutputs);

    console.log(`[Colony Count] count=${parsed.colonyCount}, detections=${parsed.detections.length}, avgConf=${parsed.avgConfidence.toFixed(3)}`);

    let annotatedImageUrl: string | null = null;
    if (parsed.annotatedImageBase64) {
      annotatedImageUrl = await uploadAnnotatedImage(supabase, image_id, parsed.annotatedImageBase64);
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
      .eq('image_id', image_id);

    if (updateError) throw updateError;

    const { data: imageRecord } = await supabase
      .from('device_images')
      .select('device_id, captured_at, company_id')
      .eq('image_id', image_id)
      .maybeSingle();

    if (imageRecord?.device_id && parsed.detections.length > 0) {
      try {
        const rows = parsed.detections.map((d) => ({
          detection_id: d.detection_id || null,
          image_id,
          device_id: imageRecord.device_id,
          company_id: imageRecord.company_id,
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          area: d.width * d.height,
          confidence: d.confidence,
          class: d.class || 'mold',
          captured_at: imageRecord.captured_at,
        }));

        const { error: insertErr } = await supabase
          .from('colony_detection_details')
          .insert(rows);

        if (insertErr) {
          console.error('[Colony Count] Detection insert error:', insertErr.message);
        } else {
          const { data: matchResult, error: matchErr } = await supabase.rpc(
            'fn_match_colony_tracks',
            {
              p_image_id: image_id,
              p_device_id: imageRecord.device_id,
              p_company_id: imageRecord.company_id,
            }
          );
          if (matchErr) {
            console.error('[Colony Count] Track matching error:', matchErr.message);
          } else {
            console.log('[Colony Count] Track result:', JSON.stringify(matchResult));
          }
        }
      } catch (e) {
        console.error('[Colony Count] Detection/tracking error (non-fatal):', e);
      }
    }

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
        colony_count: parsed.colonyCount,
        detection_count: parsed.detections.length,
        avg_confidence: parsed.avgConfidence,
        annotated_image_url: annotatedImageUrl,
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
