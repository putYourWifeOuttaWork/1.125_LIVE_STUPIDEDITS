/**
 * Phase 3 - MQTT Device Handler (SQL-Compliant)
 *
 * WebSocket MQTT integration with Phase 2.5 SQL handlers
 * Simplified routing - SQL handlers do the heavy lifting
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import * as mqtt from 'npm:mqtt@5.3.4';

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

// Global MQTT client
let mqttClient: mqtt.MqttClient | null = null;
let supabaseClient: any = null;
let configGlobal: any = null;

/**
 * Initialize WebSocket MQTT connection
 */
function connectToMQTT(config: any, supabase: any): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    // WebSocket MQTT (wss://) instead of TCP (mqtts://)
    const wsUrl = `wss://${config.mqtt.host}:443/mqtt`;
    console.log('[MQTT] Connecting to WebSocket:', wsUrl);

    const client = mqtt.connect(wsUrl, {
      username: config.mqtt.username,
      password: config.mqtt.password,
      protocol: 'wss',
      reconnectPeriod: 5000,
    });

    client.on('connect', () => {
      console.log('[MQTT] Connected to broker via WebSocket');

      // Subscribe to device status (HELLO)
      client.subscribe('device/+/status', (err) => {
        if (err) {
          console.error('[MQTT] Subscription error (status):', err);
        } else {
          console.log('[MQTT] Subscribed to: device/+/status');
        }
      });

      // Subscribe to device data (metadata + chunks)
      client.subscribe('ESP32CAM/+/data', (err) => {
        if (err) {
          console.error('[MQTT] Subscription error (data):', err);
        } else {
          console.log('[MQTT] Subscribed to: ESP32CAM/+/data');
        }
      });

      resolve(client);
    });

    client.on('error', (error) => {
      console.error('[MQTT] Connection error:', error);
      reject(error);
    });

    client.on('message', async (topic: string, message: Buffer) => {
      try {
        await handleMqttMessage(topic, message, client, supabase, config);
      } catch (error) {
        console.error('[MQTT] Message processing error:', error);
      }
    });

    client.on('close', () => {
      console.log('[MQTT] Connection closed');
    });

    client.on('offline', () => {
      console.log('[MQTT] Client offline');
    });
  });
}

/**
 * Simplified MQTT message router
 */
async function handleMqttMessage(
  topic: string,
  message: Buffer,
  client: mqtt.MqttClient,
  supabase: any,
  config: any
): Promise<void> {
  try {
    const payload = JSON.parse(message.toString());
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

        // Check if all chunks received
        const metadata = payload as ImageChunk;
        if (metadata.image_name) {
          // Get total chunks from metadata (stored in buffer during handleMetadata)
          // For now, we'll check completion after each chunk
          const totalChunks = 100; // Placeholder - actual value from metadata
          const complete = await isComplete(supabase, deviceMac, metadata.image_name, totalChunks);

          if (complete) {
            console.log('[MQTT] All chunks received, finalizing:', metadata.image_name);
            await finalizeImage(
              supabase,
              client,
              deviceMac,
              metadata.image_name,
              totalChunks,
              config.storage.bucket
            );
          }
        }
      } else {
        // METADATA message
        await handleMetadata(supabase, client, payload as ImageMetadata);
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

    // Initialize MQTT connection
    if (!mqttClient || !mqttClient.connected) {
      console.log('[Init] Initializing WebSocket MQTT connection...');
      mqttClient = await connectToMQTT(configGlobal, supabaseClient);

      // Start cleanup timer
      startCleanupTimer(supabaseClient);
    }

    // Health check response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'MQTT Device Handler V3 (SQL-Compliant) is running',
        connected: mqttClient?.connected || false,
        transport: 'WebSocket (wss://)',
        version: '3.2.0',
        phase: 'Phase 3 - SQL Handler Integration Complete + Phase 1 Telemetry',
        telemetry_only_supported: true,
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
