import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface TimeoutResult {
  device_id: string;
  image_id: string;
  image_name: string;
  timed_out: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Monitor] Starting image timeout check...');

    // Step 1: Timeout stale images based on next_wake schedule
    const { data: timedOutImages, error: timeoutError } = await supabase
      .rpc('timeout_stale_images');

    if (timeoutError) {
      console.error('[Monitor] Error timing out images:', timeoutError);
      throw timeoutError;
    }

    const results: TimeoutResult[] = timedOutImages || [];
    console.log(`[Monitor] Found ${results.length} images to timeout`);

    // Step 2: Queue retry commands and create history events
    const processedImages: string[] = [];
    const failedImages: string[] = [];

    for (const result of results) {
      try {
        console.log(`[Monitor] Processing timeout for image: ${result.image_name}`);

        // Queue retry command
        const { data: commandId, error: queueError } = await supabase
          .rpc('queue_image_retry', {
            p_device_id: result.device_id,
            p_image_id: result.image_id,
            p_image_name: result.image_name,
          });

        if (queueError) {
          console.error(`[Monitor] Error queuing retry for ${result.image_name}:`, queueError);
          failedImages.push(result.image_name);
          continue;
        }

        console.log(`[Monitor] Queued retry command: ${commandId}`);

        // Create device history event
        await supabase.from('device_history').insert({
          device_id: result.device_id,
          event_type: 'image_transfer_timeout',
          event_category: 'image_capture',
          severity: 'warning',
          description: `Image transfer timeout: ${result.image_name}. Retry queued for next wake window.`,
          event_data: {
            image_id: result.image_id,
            image_name: result.image_name,
            command_id: commandId,
            timeout_reason: 'Not completed before next wake window',
          },
        });

        // Optional: Create device alert for admin attention
        const { data: imageData } = await supabase
          .from('device_images')
          .select('retry_count, max_retries')
          .eq('image_id', result.image_id)
          .single();

        if (imageData && imageData.retry_count >= imageData.max_retries - 1) {
          // Last retry attempt - create alert
          await supabase.from('device_alerts').insert({
            device_id: result.device_id,
            alert_type: 'image_transfer_failure',
            severity: 'high',
            title: `Image Transfer Failing: ${result.image_name}`,
            message: `Image has failed ${imageData.retry_count + 1} times. Final retry attempt scheduled.`,
            alert_data: {
              image_id: result.image_id,
              image_name: result.image_name,
              retry_count: imageData.retry_count,
            },
          });
        }

        processedImages.push(result.image_name);
      } catch (error) {
        console.error(`[Monitor] Error processing ${result.image_name}:`, error);
        failedImages.push(result.image_name);
      }
    }

    // Step 3: Cleanup expired commands
    const { error: cleanupError } = await supabase
      .from('device_commands')
      .update({ status: 'cancelled' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    if (cleanupError) {
      console.error('[Monitor] Error cleaning up expired commands:', cleanupError);
    }

    const response = {
      success: true,
      summary: {
        images_timed_out: results.length,
        retries_queued: processedImages.length,
        failed_to_queue: failedImages.length,
      },
      processed_images: processedImages,
      failed_images: failedImages,
      timestamp: new Date().toISOString(),
    };

    console.log('[Monitor] Completed:', response.summary);

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Monitor] Fatal error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString(),
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
