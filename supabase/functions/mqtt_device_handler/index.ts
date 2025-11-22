/**
 * Phase 3 - MQTT Device Handler (HTTP Webhook Mode)
 *
 * HTTP webhook receiver that processes MQTT messages forwarded from local MQTT service
 * Simplified routing - SQL handlers do the heavy lifting
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

import { loadConfig } from './config.ts';
import { handleHelloStatus, handleMetadata, handleChunk, handleTelemetryOnly } from './ingest.ts';
import { finalizeImage } from './finalize.ts';
import { isComplete, cleanupStaleBuffers } from './idempotency.ts';
import type { ImageMetadata, ImageChunk } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Global state
let supabaseClient: any = null;
let configGlobal: any = null;

/**
 * Process MQTT message received via HTTP webhook
 */
async function handleMqttMessage(
  topic: string,
  payload: any,
  client: any,
  supabase: any,
  config: any
): Promise<void> {
  try {
    const deviceMac = topic.split('/')[1];

    console.log(`[MQTT] ${topic.includes('/status') ? 'HELLO' : 'DATA'} from ${deviceMac}`);

    // Route based on topic
    if (topic.includes('/status')) {
      // HELLO status message
      await handleHelloStatus(supabase, client, payload);
    } else if (topic.includes('/data')) {
      // Data message - distinguish metadata, chunk, or telemetry-only

      // TELEMETRY-ONLY: No image_name, no chunk_id, but has sensor data
      if (!payload.image_name && payload.chunk_id === undefined &&
          (payload.temperature !== undefined || payload.humidity !== undefined)) {
        await handleTelemetryOnly(supabase, client, payload);
      } else if (payload.chunk_id !== undefined) {
        // CHUNK message
        await handleChunk(supabase, client, payload as ImageChunk);

        // Check if all chunks received - only if we have metadata
        const chunkPayload = payload as ImageChunk;
        if (chunkPayload.image_name) {
          // Get buffer to check if metadata exists
          const { getBuffer } = await import('./idempotency.ts');
          const buffer = await getBuffer(supabase, deviceMac, chunkPayload.image_name);

          if (buffer && buffer.totalChunks > 0) {
            // We have metadata, check completion
            const complete = await isComplete(supabase, deviceMac, chunkPayload.image_name, buffer.totalChunks);

            if (complete) {
              console.log('[MQTT] All chunks received, finalizing:', chunkPayload.image_name);
              await finalizeImage(
                supabase,
                client,
                deviceMac,
                chunkPayload.image_name,
                buffer.totalChunks,
                config.storage.bucket
              );
            }
          } else {
            console.log('[MQTT] Chunk received but no metadata yet for:', chunkPayload.image_name);
          }
        }
      } else {
        // METADATA message
        await handleMetadata(supabase, client, payload as ImageMetadata);

        // Check if all chunks already received (out-of-order arrival)
        const metadataPayload = payload as ImageMetadata;
        if (metadataPayload.image_name && metadataPayload.total_chunks_count) {
          const complete = await isComplete(supabase, deviceMac, metadataPayload.image_name, metadataPayload.total_chunks_count);

          if (complete) {
            console.log('[MQTT] All chunks already received, finalizing:', metadataPayload.image_name);
            await finalizeImage(
              supabase,
              client,
              deviceMac,
              metadataPayload.image_name,
              metadataPayload.total_chunks_count,
              config.storage.bucket
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[MQTT] Exception in message handler:', err);
  }
}

/**
 * Periodic cleanup task
 */
function startCleanupTimer(supabase: any): void {
  setInterval(async () => {
    const cleaned = await cleanupStaleBuffers(supabase);
    if (cleaned > 0) {
      console.log('[Cleanup] Removed', cleaned, 'stale chunks');
    }
  }, 60 * 1000); // Every minute
}

/**
 * Main Deno serve handler
 * Accepts HTTP POST requests with MQTT message data
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Load configuration
    if (!configGlobal) {
      configGlobal = loadConfig();
    }

    // Initialize Supabase client
    if (!supabaseClient) {
      supabaseClient = createClient(configGlobal.supabase.url, configGlobal.supabase.serviceKey);
    }

    // Handle POST requests with MQTT message data
    if (req.method === 'POST') {
      const body = await req.json();
      const { topic, payload } = body;

      if (!topic || !payload) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Missing topic or payload',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      console.log(`[HTTP] Received ${topic}`);

      // Process the message (no MQTT client needed)
      await handleMqttMessage(topic, payload, null as any, supabaseClient, configGlobal);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Message processed',
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Health check response for GET requests
    return new Response(
      JSON.stringify({
        success: true,
        message: 'MQTT Device Handler V3 (HTTP Webhook Mode)',
        mode: 'HTTP POST webhook (no persistent MQTT connection)',
        version: '3.3.0',
        phase: 'Phase 3 - HTTP Webhook Integration',
        usage: 'POST with {topic: string, payload: object}',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Error] Handler error:', error);
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
