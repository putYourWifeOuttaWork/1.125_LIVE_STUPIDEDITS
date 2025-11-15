import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import express from 'express';
import dotenv from 'dotenv';
import { CommandQueueProcessor } from './commandQueueProcessor.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MQTT_HOST = process.env.MQTT_HOST || '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '8883');
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'BrainlyTesting';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'BrainlyTest@1234';

const imageBuffers = new Map();

function getImageKey(deviceId, imageName) {
  return `${deviceId}|${imageName}`;
}

async function generateDeviceCode(hardwareVersion = 'ESP32-S3') {
  const prefix = hardwareVersion.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const { count } = await supabase
    .from('devices')
    .select('device_id', { count: 'exact', head: true })
    .ilike('device_code', `DEVICE-${prefix}-%`);
  const sequence = String((count || 0) + 1).padStart(3, '0');
  return `DEVICE-${prefix}-${sequence}`;
}

async function autoProvisionDevice(deviceMac) {
  console.log(`[AUTO-PROVISION] Attempting to provision new device: ${deviceMac}`);

  try {
    const deviceCode = await generateDeviceCode('ESP32-S3');

    const { data: newDevice, error: insertError } = await supabase
      .from('devices')
      .insert({
        device_mac: deviceMac,
        device_code: deviceCode,
        device_name: null,
        hardware_version: 'ESP32-S3',
        provisioning_status: 'pending_mapping',
        provisioned_at: new Date().toISOString(),
        is_active: false,
        notes: 'Auto-provisioned via MQTT connection',
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[ERROR] Failed to auto-provision device:`, insertError);
      return null;
    }

    console.log(`[SUCCESS] Auto-provisioned device ${deviceMac} with code ${deviceCode} and ID ${newDevice.device_id}`);
    return newDevice;
  } catch (error) {
    console.error(`[ERROR] Auto-provision exception:`, error);
    return null;
  }
}

async function sendPendingCommands(device, client) {
  // Query pending commands for this device
  const { data: commands, error } = await supabase
    .from('device_commands')
    .select('*')
    .eq('device_id', device.device_id)
    .eq('status', 'pending')
    .order('issued_at', { ascending: true })
    .limit(5); // Process up to 5 commands per wake

  if (error) {
    console.error(`[CMD] Error fetching commands:`, error);
    return;
  }

  if (!commands || commands.length === 0) {
    console.log(`[CMD] No pending commands for device ${device.device_code || device.device_mac}`);
    return;
  }

  console.log(`[CMD] Found ${commands.length} pending commands for ${device.device_code || device.device_mac}`);

  for (const command of commands) {
    try {
      let message = {};

      switch (command.command_type) {
        case 'ping':
          message = {
            device_id: device.device_code || device.device_id,
            ping: true,
            timestamp: command.command_payload?.timestamp || new Date().toISOString()
          };
          break;

        case 'capture_image':
          message = {
            device_id: device.device_code || device.device_id,
            capture_image: true
          };
          break;

        case 'set_wake_schedule':
          message = {
            device_id: device.device_code || device.device_id,
            set_wake_schedule: command.command_payload?.wake_schedule_cron
          };
          break;

        case 'send_image':
          message = {
            device_id: device.device_code || device.device_id,
            send_image: command.command_payload?.image_name
          };
          break;

        default:
          console.log(`[CMD] Unknown command type: ${command.command_type}`);
          continue;
      }

      // Publish command to device
      const topic = `device/${device.device_code || device.device_id}/cmd`;
      client.publish(topic, JSON.stringify(message));
      console.log(`[CMD] Sent ${command.command_type} to ${device.device_code || device.device_mac} on ${topic}`);

      // Update command status
      await supabase
        .from('device_commands')
        .update({
          status: 'sent',
          delivered_at: new Date().toISOString()
        })
        .eq('command_id', command.command_id);

    } catch (cmdError) {
      console.error(`[CMD] Error sending command ${command.command_id}:`, cmdError);
      await supabase
        .from('device_commands')
        .update({
          status: 'failed',
          retry_count: (command.retry_count || 0) + 1
        })
        .eq('command_id', command.command_id);
    }
  }
}

async function handleStatusMessage(payload, client) {
  const deviceMac = payload.device_mac || payload.device_id;
  console.log(`[STATUS] Device ${payload.device_id} (MAC: ${deviceMac}) is alive, pending images: ${payload.pendingImg || payload.pending_count || 0}`);

  let { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', deviceMac)
    .maybeSingle();

  if (!device && !deviceError) {
    console.log(`[AUTO-PROVISION] Device ${deviceMac} not found, attempting auto-provision...`);
    device = await autoProvisionDevice(deviceMac);

    if (!device) {
      console.error(`[ERROR] Failed to auto-provision device ${payload.device_id}`);
      return null;
    }
  }

  if (deviceError || !device) {
    console.error(`[ERROR] Device ${payload.device_id} lookup failed:`, deviceError);
    return null;
  }

  await supabase
    .from('devices')
    .update({
      last_seen_at: new Date().toISOString(),
      is_active: true,
    })
    .eq('device_id', device.device_id);

  console.log(`[STATUS] Device ${device.device_code || device.device_mac} updated (status: ${device.provisioning_status})`);

  // Send any pending commands to the device
  await sendPendingCommands(device, client);

  return { device, pendingCount: payload.pendingImg || 0 };
}

async function handleMetadataMessage(payload, client) {
  const deviceMac = payload.device_mac || payload.device_id;
  console.log(`[METADATA] Received for image ${payload.image_name} from ${payload.device_id} (MAC: ${deviceMac})`);

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', deviceMac)
    .maybeSingle();

  if (deviceError) {
    console.error(`[ERROR] Device lookup error:`, deviceError);
    return;
  }

  if (!device) {
    console.error(`[ERROR] Device ${payload.device_id} not found`);
    return;
  }

  const imageKey = getImageKey(payload.device_id, payload.image_name);

  // Build metadata object with all sensor data
  const metadataObj = {
    location: payload.location || 'Unknown',
    temperature: payload.temperature,
    humidity: payload.humidity,
    pressure: payload.pressure,
    gas_resistance: payload.gas_resistance,
    error: payload.error || 0,
  };

  console.log(`[METADATA] Inserting image record with metadata:`, JSON.stringify(metadataObj));

  const { data: imageRecord, error: imageError } = await supabase
    .from('device_images')
    .insert({
      device_id: device.device_id,
      image_name: payload.image_name,
      image_size: payload.image_size || 0,
      captured_at: payload.capture_timestamp,
      total_chunks: payload.total_chunks_count,
      received_chunks: 0,
      status: 'receiving',
      error_code: payload.error || 0,
      metadata: metadataObj,
    })
    .select()
    .single();

  if (imageError) {
    console.error(`[ERROR] Failed to create image record:`, imageError);
    console.error(`[ERROR] Payload was:`, JSON.stringify(payload));
    return;
  }

  console.log(`[SUCCESS] Created image record ${imageRecord.image_id}`);

  // Create telemetry record if we have sensor data
  if (payload.temperature !== undefined) {
    const { error: telemetryError } = await supabase.from('device_telemetry').insert({
      device_id: device.device_id,
      captured_at: payload.capture_timestamp,
      temperature: payload.temperature,
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      battery_voltage: device.battery_voltage,
    });

    if (telemetryError) {
      console.error(`[ERROR] Failed to create telemetry record:`, telemetryError);
    } else {
      console.log(`[SUCCESS] Created telemetry record for device ${device.device_code}`);
    }
  }

  // Store in memory buffer for chunk reassembly
  imageBuffers.set(imageKey, {
    metadata: payload,
    chunks: new Map(),
    totalChunks: payload.total_chunks_count,
    imageRecord,
    device,
  });

  console.log(`[METADATA] Ready to receive ${payload.total_chunks_count} chunks for ${payload.image_name}`);
}

async function handleChunkMessage(payload, client) {
  const imageKey = getImageKey(payload.device_id, payload.image_name);
  const buffer = imageBuffers.get(imageKey);

  if (!buffer) {
    console.error(`[ERROR] No metadata found for ${payload.image_name}`);
    console.error(`[ERROR] Available keys:`, Array.from(imageBuffers.keys()));
    return;
  }

  // Convert payload to Uint8Array
  const chunkBytes = new Uint8Array(payload.payload);
  buffer.chunks.set(payload.chunk_id, chunkBytes);

  const receivedCount = buffer.chunks.size;
  const progress = ((receivedCount / buffer.totalChunks) * 100).toFixed(1);
  console.log(`[CHUNK] Received chunk ${payload.chunk_id + 1}/${buffer.totalChunks} for ${payload.image_name} (${receivedCount} total, ${progress}% complete)`);

  // Update progress in database
  const { error: updateError } = await supabase
    .from('device_images')
    .update({
      received_chunks: receivedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('image_id', buffer.imageRecord.image_id);

  if (updateError) {
    console.error(`[ERROR] Failed to update chunk count:`, updateError);
  }

  // Check if all chunks received
  if (receivedCount === buffer.totalChunks) {
    console.log(`[COMPLETE] All ${buffer.totalChunks} chunks received for ${payload.image_name}`);
    await reassembleAndUploadImage(payload.device_id, payload.image_name, buffer, client);
  }
}

async function reassembleAndUploadImage(deviceId, imageName, buffer, client) {
  try {
    console.log(`[REASSEMBLE] Starting reassembly for ${imageName}`);

    // Check for missing chunks
    const missingChunks = [];
    for (let i = 0; i < buffer.totalChunks; i++) {
      if (!buffer.chunks.has(i)) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      console.log(`[MISSING] Requesting ${missingChunks.length} missing chunks: [${missingChunks.join(', ')}]`);
      const missingRequest = {
        device_id: deviceId,
        image_name: imageName,
        missing_chunks: missingChunks,
      };
      client.publish(`device/${deviceId}/ack`, JSON.stringify(missingRequest));

      // Update status to show we're waiting for retransmission
      await supabase
        .from('device_images')
        .update({
          status: 'receiving',
          retry_count: (buffer.imageRecord.retry_count || 0) + 1,
        })
        .eq('image_id', buffer.imageRecord.image_id);

      return;
    }

    // Sort chunks in correct order
    console.log(`[REASSEMBLE] All chunks present, sorting and merging...`);
    const sortedChunks = [];
    for (let i = 0; i < buffer.totalChunks; i++) {
      const chunk = buffer.chunks.get(i);
      if (chunk) {
        sortedChunks.push(chunk);
      }
    }

    // Merge all chunks into single image
    const totalLength = sortedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`[REASSEMBLE] Merging ${sortedChunks.length} chunks, total size: ${totalLength} bytes`);

    const mergedImage = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of sortedChunks) {
      mergedImage.set(chunk, offset);
      offset += chunk.length;
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const deviceCode = buffer.device?.device_code || deviceId;
    const fileName = `${deviceCode}/${timestamp}_${imageName}`;

    console.log(`[UPLOAD] Uploading to storage: ${fileName}`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('petri-images')
      .upload(fileName, mergedImage, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error(`[ERROR] Failed to upload image:`, uploadError);
      await supabase
        .from('device_images')
        .update({
          status: 'failed',
          error_code: 1,
        })
        .eq('image_id', buffer.imageRecord.image_id);
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('petri-images')
      .getPublicUrl(fileName);

    console.log(`[SUCCESS] Image uploaded successfully: ${urlData.publicUrl}`);

    // Update image record with completion status
    const { error: updateError } = await supabase
      .from('device_images')
      .update({
        status: 'complete',
        image_url: urlData.publicUrl,
        received_at: new Date().toISOString(),
      })
      .eq('image_id', buffer.imageRecord.image_id);

    if (updateError) {
      console.error(`[ERROR] Failed to update image record:`, updateError);
    }

    // Create submission and observation if device is mapped
    await createSubmissionAndObservation(buffer, urlData.publicUrl);

    // Send acknowledgment to device
    const nextWakeTime = calculateNextWakeTime();
    const ackMessage = {
      device_id: deviceId,
      image_name: imageName,
      ACK_OK: {
        next_wake_time: nextWakeTime,
        status: 'success',
        image_url: urlData.publicUrl,
      },
    };

    client.publish(`device/${deviceId}/ack`, JSON.stringify(ackMessage));
    console.log(`[ACK] Sent ACK_OK to ${deviceId} with next wake: ${nextWakeTime}`);

    // Clean up buffer
    imageBuffers.delete(getImageKey(deviceId, imageName));
    console.log(`[CLEANUP] Removed buffer for ${imageName}`);

  } catch (error) {
    console.error(`[ERROR] Failed to reassemble image:`, error);
    console.error(`[ERROR] Stack trace:`, error.stack);

    await supabase
      .from('device_images')
      .update({
        status: 'failed',
        error_code: 2,
      })
      .eq('image_id', buffer.imageRecord.image_id);
  }
}

async function createSubmissionAndObservation(buffer, imageUrl) {
  try {
    console.log(`[SUBMISSION] Checking if device is mapped to site...`);

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('device_id, device_code, site_id, program_id')
      .eq('device_id', buffer.imageRecord.device_id)
      .single();

    if (deviceError) {
      console.error(`[ERROR] Failed to fetch device for submission:`, deviceError);
      return;
    }

    if (!device || !device.site_id) {
      console.log(`[INFO] Device ${device?.device_code || buffer.imageRecord.device_id} not mapped to site - image stored without submission`);
      return;
    }

    console.log(`[SUBMISSION] Device mapped to site ${device.site_id}, creating submission...`);

    // Create submission with device metadata
    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .insert({
        site_id: device.site_id,
        program_id: device.program_id,
        created_by_device_id: device.device_id,
        is_device_generated: true,
        temperature: buffer.metadata?.temperature || 72,
        humidity: buffer.metadata?.humidity || 50,
        airflow: 'moderate',
        odor_distance: '0-5 ft',
        weather: 'Clear',
        notes: `Auto-generated from ${device.device_code} at ${buffer.metadata?.capture_timestamp || new Date().toISOString()}`,
      })
      .select()
      .single();

    if (submissionError) {
      console.error(`[ERROR] Failed to create submission:`, submissionError);
      return;
    }

    console.log(`[SUCCESS] Created submission ${submission.submission_id}`);

    // Create petri observation linked to submission
    const { data: observation, error: observationError } = await supabase
      .from('petri_observations')
      .insert({
        submission_id: submission.submission_id,
        site_id: device.site_id,
        program_id: device.program_id,
        petri_code: 'AUTO',
        image_url: imageUrl,
        fungicide_used: 'None',
        surrounding_water_schedule: 'None',
        is_device_generated: true,
        device_capture_metadata: buffer.metadata,
      })
      .select()
      .single();

    if (observationError) {
      console.error(`[ERROR] Failed to create observation:`, observationError);
      return;
    }

    console.log(`[SUCCESS] Created observation ${observation.observation_id}`);

    // Link image record to submission and observation
    const { error: linkError } = await supabase
      .from('device_images')
      .update({
        submission_id: submission.submission_id,
        observation_id: observation.observation_id,
        observation_type: 'petri',
      })
      .eq('image_id', buffer.imageRecord.image_id);

    if (linkError) {
      console.error(`[ERROR] Failed to link image to submission:`, linkError);
    } else {
      console.log(`[SUCCESS] Linked image ${buffer.imageRecord.image_id} to submission and observation`);
    }

  } catch (error) {
    console.error(`[ERROR] Failed to create submission/observation:`, error);
    console.error(`[ERROR] Stack trace:`, error.stack);
  }
}

function calculateNextWakeTime() {
  const now = new Date();
  now.setHours(now.getHours() + 12);
  return now.toISOString();
}

function connectToMQTT() {
  return new Promise((resolve, reject) => {
    console.log(`[MQTT] Connecting to ${MQTT_HOST}:${MQTT_PORT}...`);

    const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      protocol: 'mqtts',
      rejectUnauthorized: false,
      keepalive: 60,
      reconnectPeriod: 5000,
    });

    client.on('connect', () => {
      console.log('[MQTT] ✅ Connected to HiveMQ Cloud');

      client.subscribe('ESP32CAM/+/data', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (ESP32CAM):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to ESP32CAM/+/data');
        }
      });

      client.subscribe('device/+/status', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (device):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to device/+/status');
        }
      });

      client.subscribe('device/+/ack', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (device/ack):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to device/+/ack');
        }
      });

      resolve(client);
    });

    client.on('error', (error) => {
      console.error('[MQTT] ❌ Connection error:', error);
      reject(error);
    });

    client.on('reconnect', () => {
      console.log('[MQTT] 🔄 Reconnecting...');
    });

    client.on('offline', () => {
      console.log('[MQTT] ⚠️  Client offline');
    });

    client.on('message', async (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        console.log(`[MQTT] 📨 Message on ${topic}:`, JSON.stringify(payload).substring(0, 200));

        // Forward to edge function with timeout
        // NOTE: Edge Function can't send MQTT commands back (receives via HTTP webhook)
        // Local processing below handles actual device communication
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

          const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/mqtt_device_handler`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ topic, payload }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (edgeResponse.ok) {
            const result = await edgeResponse.json();
            console.log(`[EDGE] ✅ Processed:`, result.message || 'success');
          } else {
            console.error(`[EDGE] ❌ Error ${edgeResponse.status}`);
          }
        } catch (edgeError) {
          if (edgeError.name === 'AbortError') {
            console.error('[EDGE] ⏱️  Timeout (5s) - continuing with local processing');
          } else {
            console.error('[EDGE] ❌', edgeError.message);
          }
        }

        // Process locally (full protocol implementation - sends MQTT commands to devices)
        if (topic.includes('/ack') && commandQueueProcessor) {
          // Handle command acknowledgment
          const deviceMac = topic.split('/')[1];
          await commandQueueProcessor.handleCommandAck(deviceMac, payload);
        } else if (topic.includes('/status')) {
          const result = await handleStatusMessage(payload, client);
          if (result && result.pendingCount > 0) {
            const captureCmd = {
              device_id: payload.device_id,
              capture_image: true,
            };
            client.publish(`device/${payload.device_id}/cmd`, JSON.stringify(captureCmd));
            console.log(`[CMD] Sent capture command to ${payload.device_id}`);
          }
        } else if (topic.includes('/data')) {
          if (payload.total_chunks_count !== undefined && payload.chunk_id === undefined) {
            await handleMetadataMessage(payload, client);
          } else if (payload.chunk_id !== undefined) {
            await handleChunkMessage(payload, client);
          }
        }
      } catch (error) {
        console.error('[MQTT] ❌ Message processing error:', error);
      }
    });
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

let mqttClient = null;
let commandQueueProcessor = null;
let connectionStatus = {
  connected: false,
  lastError: null,
  startedAt: new Date().toISOString(),
  messagesReceived: 0,
  devicesProvisioned: 0,
};

app.get('/health', (req, res) => {
  res.json({
    status: mqttClient?.connected ? 'healthy' : 'disconnected',
    mqtt: {
      connected: mqttClient?.connected || false,
      host: MQTT_HOST,
      port: MQTT_PORT,
    },
    supabase: {
      url: supabaseUrl,
      configured: !!supabaseUrl && !!supabaseServiceKey,
    },
    commandQueue: {
      running: commandQueueProcessor?.isRunning || false,
      pollInterval: commandQueueProcessor?.pollInterval || 0,
    },
    stats: connectionStatus,
    uptime: process.uptime(),
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'MQTT Device Handler',
    version: '1.0.0',
    status: mqttClient?.connected ? 'running' : 'disconnected',
    endpoints: {
      health: '/health',
      docs: '/docs',
    },
  });
});

app.get('/docs', (req, res) => {
  res.json({
    service: 'MQTT Device Handler for BrainlyTree IoT Devices',
    description: 'Persistent MQTT connection handler for ESP32-CAM device auto-provisioning',
    features: [
      'Auto-provisions new devices on first connection',
      'Receives and reassembles chunked images',
      'Creates submissions and observations automatically',
      'Tracks device telemetry and battery status',
      'Handles device commands and wake schedules',
    ],
    topics: {
      subscribed: [
        'device/+/status - Device heartbeat and status updates',
        'ESP32CAM/+/data - Image metadata and chunks',
      ],
      published: [
        'device/{MAC}/cmd - Device commands (capture, wake schedule)',
        'device/{MAC}/ack - Acknowledgments and missing chunk requests',
      ],
    },
    database_tables: [
      'devices - Auto-provisioned device registry',
      'device_images - Image reception tracking',
      'device_telemetry - Environmental sensor data',
      'submissions - Auto-generated submissions',
      'petri_observations - Device-captured observations',
    ],
  });
});

async function startService() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   MQTT Device Handler - Production Service           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('[CONFIG] Supabase URL:', supabaseUrl);
    console.log('[CONFIG] MQTT Host:', MQTT_HOST);
    console.log('[CONFIG] MQTT Port:', MQTT_PORT);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    mqttClient = await connectToMQTT();
    connectionStatus.connected = true;
    connectionStatus.lastError = null;

    // Initialize and start command queue processor
    console.log('[COMMAND_QUEUE] Initializing command queue processor...');
    commandQueueProcessor = new CommandQueueProcessor(supabase, mqttClient, {
      pollInterval: 5000, // 5 seconds
      maxRetries: 3,
      retryDelay: 30000, // 30 seconds
    });
    commandQueueProcessor.start();
    console.log('[COMMAND_QUEUE] ✅ Command queue processor started');

    // Listen for device provisioning status changes
    console.log('[REALTIME] Setting up device provisioning listener...');
    supabase
      .channel('device-provisioning-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
          filter: 'provisioning_status=eq.active',
        },
        async (payload) => {
          const device = payload.new;
          console.log(`[PROVISIONING] Device ${device.device_name || device.device_mac} activated!`);

          // Check if device was just mapped (status changed to active)
          if (payload.old.provisioning_status !== 'active' && device.site_id && device.program_id) {
            console.log(`[PROVISIONING] Sending welcome command to newly-mapped device ${device.device_id}`);

            // Get wake schedule from site
            const { data: site } = await supabase
              .from('sites')
              .select('wake_schedule_cron')
              .eq('site_id', device.site_id)
              .maybeSingle();

            const wakeSchedule = site?.wake_schedule_cron || '0 8,16 * * *'; // Default: 8am and 4pm

            // Send welcome command with site context
            await commandQueueProcessor.sendWelcomeCommand(
              device.device_id,
              device.site_id,
              device.program_id,
              wakeSchedule
            );
          }
        }
      )
      .subscribe();
    console.log('[REALTIME] ✅ Device provisioning listener active');

    app.listen(PORT, () => {
      console.log(`\n[HTTP] ✅ Health check server running on port ${PORT}`);
      console.log(`[HTTP] Health endpoint: http://localhost:${PORT}/health`);
      console.log(`[HTTP] Docs endpoint: http://localhost:${PORT}/docs`);
      console.log('\n[SERVICE] 🚀 MQTT Device Handler is ready!\n');
    });
  } catch (error) {
    console.error('[ERROR] ❌ Failed to start service:', error);
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Received SIGTERM, closing connections...');
  if (commandQueueProcessor) {
    commandQueueProcessor.stop();
  }
  if (mqttClient) {
    mqttClient.end();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Received SIGINT, closing connections...');
  if (commandQueueProcessor) {
    commandQueueProcessor.stop();
  }
  if (mqttClient) {
    mqttClient.end();
  }
  process.exit(0);
});

startService();
