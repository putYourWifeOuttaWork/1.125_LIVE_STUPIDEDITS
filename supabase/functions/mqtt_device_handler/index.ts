/**
 * Phase 3 - MQTT Device Handler (Complete Replacement)
 * 
 * Modular architecture integrating with Phase 2.5 SQL handlers
 * Handles all inbound MQTT messages and outbound ACK responses
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import * as mqtt from 'npm:mqtt@5.3.4';

import { loadConfig } from './config.ts';
import { resolveDeviceLineage, getOrCreateSiteSession } from './resolver.ts';
import { handleHelloStatus, handleMetadata, handleChunk } from './ingest.ts';
import { finalizeImage } from './finalize.ts';
import { cleanupStaleBuffers, getBufferStats, isComplete } from './idempotency.ts';
import type { DeviceStatusMessage, ImageMetadata, ImageChunk } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Global MQTT client
let mqttClient: mqtt.MqttClient | null = null;

/**
 * Initialize MQTT connection and subscribe to topics
 */
function connectToMQTT(config: any, supabase: any): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`mqtts://${config.mqtt.host}:${config.mqtt.port}`, {
      username: config.mqtt.username,
      password: config.mqtt.password,
      protocol: 'mqtts',
      rejectUnauthorized: false,
    });

    client.on('connect', () => {
      console.log('[MQTT] Connected to broker:', config.mqtt.host);

      // Subscribe to device status messages (HELLO)
      client.subscribe('device/+/status', (err) => {
        if (err) {
          console.error('[MQTT] Subscription error (status):', err);
        } else {
          console.log('[MQTT] Subscribed to: device/+/status');
        }
      });

      // Subscribe to device data messages (metadata + chunks)
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
  });
}

/**
 * Main MQTT message router
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
    console.log(`[MQTT] Message on ${topic}:`, JSON.stringify(payload).substring(0, 200));

    // Route based on topic pattern
    if (topic.includes('/status')) {
      // Device HELLO status message
      await handleHelloStatus(supabase, client, payload as DeviceStatusMessage);
    } else if (topic.includes('/data')) {
      // Device data message (metadata or chunk)
      const deviceMac = topic.split('/')[1];
      
      // Resolve lineage
      const lineage = await resolveDeviceLineage(supabase, deviceMac);
      if (!lineage) {
        console.warn('[MQTT] Cannot resolve lineage for:', deviceMac);
        return;
      }

      // Check if device is active and assigned
      if (!lineage.is_active || lineage.provisioning_status === 'pending_mapping') {
        console.warn('[MQTT] Device not active or pending mapping:', deviceMac);
        return;
      }

      // Distinguish metadata from chunk by presence of chunk_id
      if (payload.chunk_id !== undefined) {
        // Chunk message
        await handleChunk(supabase, client, payload as ImageChunk);
        
        // Check if complete and trigger finalization
        if (isComplete(deviceMac, payload.image_name)) {
          console.log('[MQTT] All chunks received, finalizing:', payload.image_name);
          await finalizeImage(
            supabase,
            client,
            deviceMac,
            payload.image_name,
            lineage,
            config.storage.bucket
          );
        }
      } else if (payload.total_chunks_count !== undefined) {
        // Metadata message
        const metadata = payload as ImageMetadata;
        
        // Get or create site session for today
        const capturedDate = new Date(metadata.capture_timestamp);
        const sessionDate = capturedDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        const sessionInfo = await getOrCreateSiteSession(
          supabase,
          lineage.site_id,
          sessionDate,
          lineage.timezone
        );
        
        if (!sessionInfo) {
          console.error('[MQTT] Could not get/create session for:', lineage.site_id, sessionDate);
          return;
        }

        console.log('[MQTT] Using session:', sessionInfo.session_id, 'submission:', sessionInfo.device_submission_id);
        
        await handleMetadata(supabase, client, metadata, lineage, sessionInfo);
      }
    }
  } catch (error) {
    console.error('[MQTT] Exception in message handler:', error);
  }
}

/**
 * Periodic cleanup task
 */
function startCleanupTimer(config: any): void {
  setInterval(() => {
    const cleaned = cleanupStaleBuffers(config.timeouts.bufferCleanupMinutes);
    if (cleaned > 0) {
      console.log('[Cleanup] Removed', cleaned, 'stale buffers');
    }
    
    const stats = getBufferStats();
    console.log('[Stats] Active buffers:', stats.total);
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
    const config = loadConfig();

    // Initialize Supabase client
    const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

    // Initialize MQTT connection if not already connected
    if (!mqttClient) {
      console.log('[Init] Initializing MQTT connection...');
      mqttClient = await connectToMQTT(config, supabase);
      
      // Start cleanup timer
      startCleanupTimer(config);
    }

    const stats = getBufferStats();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'MQTT Device Handler V3 is running',
        connected: mqttClient?.connected || false,
        active_buffers: stats.total,
        version: '3.0.0',
        phase: 'Phase 3 - Full Integration',
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
