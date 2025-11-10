/**
 * Phase 3 - Configuration Management
 * 
 * Load and validate environment configuration
 */

import type { EdgeConfig } from './types.ts';

export function loadConfig(): EdgeConfig {
  const config: EdgeConfig = {
    mqtt: {
      host: Deno.env.get('MQTT_HOST') || '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud',
      port: parseInt(Deno.env.get('MQTT_PORT') || '8883'),
      username: Deno.env.get('MQTT_USERNAME') || 'BrainlyTesting',
      password: Deno.env.get('MQTT_PASSWORD') || 'BrainlyTest@1234',
    },
    supabase: {
      url: Deno.env.get('SUPABASE_URL')!,
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    storage: {
      bucket: Deno.env.get('STORAGE_BUCKET') || 'petri-images',
    },
    timeouts: {
      bufferCleanupMinutes: parseInt(Deno.env.get('BUFFER_CLEANUP_MINUTES') || '30'),
      chunkAssemblyMinutes: parseInt(Deno.env.get('CHUNK_ASSEMBLY_MINUTES') || '15'),
    },
    features: {
      alertsEnabled: Deno.env.get('ALERTS_ENABLED') !== 'false', // default true
    },
  };

  // Validate required config
  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  console.log('[Config] Loaded configuration:', {
    mqtt: `${config.mqtt.host}:${config.mqtt.port}`,
    storage: config.storage.bucket,
    features: config.features,
  });

  return config;
}
