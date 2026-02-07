import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import express from 'express';
import dotenv from 'dotenv';
import { CommandQueueProcessor } from './commandQueueProcessor.js';
import {
  storeChunk,
  isComplete,
  getMissingChunks,
  assembleImageFromPostgres,
  clearChunkBuffer,
  cleanupStaleBuffers,
  getReceivedChunkCount,
} from './chunkStore.js';
import {
  resolveDeviceLineage,
  invalidateLineageCache,
  findActiveSession,
  logMqttMessage,
  logAckToAudit,
  celsiusToFahrenheit,
  normalizeMacAddress,
  normalizeMetadataPayload,
  formatTimeForDevice,
  getImageKey,
  generateDeviceCode,
} from './deviceContext.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MQTT_HOST = process.env.MQTT_HOST || '1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '8883');
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'BrainlyTesting';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'BrainlyTest@1234';

const STORAGE_BUCKET = 'device-images';

const imageBuffers = new Map();
const deviceSessions = new Map();
const completedImages = new Set();
const missingChunkTimers = new Map();
const COMPLETED_IMAGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const MISSING_CHUNK_CHECK_DELAY_MS = 15000;

function getOrCreateSession(deviceMac, deviceId, pendingCount) {
  let session = deviceSessions.get(deviceMac);
  if (!session) {
    session = {
      deviceMac,
      deviceId,
      state: 'hello_received',
      initialPendingCount: pendingCount,
      pendingDrained: 0,
      currentImageName: null,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      lastCaptureSentAt: null,
    };
    deviceSessions.set(deviceMac, session);
  }
  session.lastActivityAt = new Date();
  return session;
}

function cleanupSession(deviceMac) {
  deviceSessions.delete(deviceMac);
}

setInterval(() => {
  const now = Date.now();
  for (const [mac, session] of deviceSessions.entries()) {
    if (now - session.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
      console.log(`[SESSION] Timeout - cleaning up stale session for ${mac}`);
      deviceSessions.delete(mac);
    }
  }
}, 60 * 1000);

setInterval(async () => {
  const cleaned = await cleanupStaleBuffers(supabase);
  if (cleaned > 0) {
    console.log(`[CLEANUP] Removed ${cleaned} stale chunk buffer rows`);
  }
}, 60 * 1000);

async function autoProvisionDevice(deviceMac) {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error(`[ERROR] Invalid MAC address: ${deviceMac}`);
    return null;
  }

  console.log(`[AUTO-PROVISION] Attempting to provision new device: ${deviceMac} (normalized: ${normalizedMac})`);

  try {
    const deviceCode = await generateDeviceCode(supabase, 'ESP32-S3');

    const { data: newDevice, error: insertError } = await supabase
      .from('devices')
      .insert({
        device_mac: normalizedMac,
        device_code: deviceCode,
        device_name: null,
        hardware_version: 'ESP32-S3',
        provisioning_status: 'pending_mapping',
        provisioned_at: new Date().toISOString(),
        is_active: false,
        device_type: 'physical',
        notes: 'Auto-provisioned via MQTT connection',
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[ERROR] Failed to auto-provision device:`, insertError);
      return null;
    }

    console.log(`[SUCCESS] Auto-provisioned device ${normalizedMac} with code ${deviceCode} and ID ${newDevice.device_id}`);
    invalidateLineageCache(normalizedMac);
    return newDevice;
  } catch (error) {
    console.error(`[ERROR] Auto-provision exception:`, error);
    return null;
  }
}

async function sendPendingCommands(device, client) {
  const sentTypes = new Set();

  const { data: commands, error } = await supabase
    .from('device_commands')
    .select('*')
    .eq('device_id', device.device_id)
    .eq('status', 'pending')
    .order('issued_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error(`[CMD] Error fetching commands:`, error);
    return sentTypes;
  }

  if (!commands || commands.length === 0) {
    console.log(`[CMD] No pending commands for device ${device.device_code || device.device_mac}`);
    return sentTypes;
  }

  console.log(`[CMD] Found ${commands.length} pending commands for ${device.device_code || device.device_mac}`);

  for (const command of commands) {
    try {
      if (command.command_type === 'capture_image' && sentTypes.has('capture_image')) {
        console.log(`[CMD] Skipping duplicate capture_image command ${command.command_id} - already sent one this cycle`);
        await supabase
          .from('device_commands')
          .update({ status: 'superseded', delivered_at: new Date().toISOString() })
          .eq('command_id', command.command_id);
        continue;
      }

      let message = {};

      switch (command.command_type) {
        case 'ping':
          message = {
            device_id: device.device_mac,
            ping: true,
            timestamp: command.command_payload?.timestamp || new Date().toISOString()
          };
          break;

        case 'capture_image':
          message = {
            device_id: device.device_mac,
            capture_image: true
          };
          break;

        case 'set_wake_schedule': {
          const nextWake = await calculateNextWakeTime(device.device_id);
          message = {
            device_id: device.device_mac,
            next_wake: nextWake
          };
          break;
        }

        case 'send_image':
          message = {
            device_id: device.device_mac,
            send_image: command.command_payload?.image_name
          };
          break;

        default:
          console.log(`[CMD] Unknown command type: ${command.command_type}`);
          continue;
      }

      const topic = `ESP32CAM/${device.device_mac}/cmd`;
      client.publish(topic, JSON.stringify(message));
      console.log(`[CMD] Sent ${command.command_type} to ${device.device_code || device.device_mac} on ${topic}`);
      sentTypes.add(command.command_type);

      await logMqttMessage(supabase, device.device_mac, 'outbound', topic, message, `cmd_${command.command_type}`);

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

  return sentTypes;
}

async function processPendingList(device, pendingList, lineage) {
  if (!pendingList || !Array.isArray(pendingList) || pendingList.length === 0) {
    return;
  }

  console.log(`[PENDING_LIST] Processing ${pendingList.length} pending images for device ${device.device_code || device.device_mac}`);

  const companyId = lineage?.company_id || device.company_id;
  const programId = lineage?.program_id || device.program_id;
  const siteId = lineage?.site_id || device.site_id;

  for (const imageName of pendingList) {
    try {
      const { data: existing, error: checkError } = await supabase
        .from('device_images')
        .select('image_id, status')
        .eq('device_id', device.device_id)
        .eq('image_name', imageName)
        .maybeSingle();

      if (checkError) {
        console.error(`[PENDING_LIST] Error checking image ${imageName}:`, checkError);
        continue;
      }

      if (existing) {
        if (existing.status === 'complete') {
          console.log(`[PENDING_LIST] Image ${imageName} marked complete but device says pending - resetting to pending for re-reception`);
          await supabase
            .from('device_images')
            .update({
              status: 'pending',
              received_chunks: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('image_id', existing.image_id);

          await clearChunkBuffer(supabase, device.device_mac, imageName);
          const imageKey = getImageKey(device.device_mac, imageName);
          completedImages.delete(imageKey);
          imageBuffers.delete(imageKey);
        } else {
          console.log(`[PENDING_LIST] Image ${imageName} exists with status ${existing.status} - will be resumed`);
        }
        continue;
      }

      const { data: newImage, error: insertError } = await supabase
        .from('device_images')
        .insert({
          device_id: device.device_id,
          company_id: companyId,
          program_id: programId,
          site_id: siteId,
          image_name: imageName,
          captured_at: new Date().toISOString(),
          status: 'pending',
          total_chunks: 0,
          received_chunks: 0,
          metadata: {
            source: 'pending_list',
            reported_at: new Date().toISOString()
          }
        })
        .select('image_id')
        .single();

      if (insertError) {
        console.error(`[PENDING_LIST] Error creating pending image ${imageName}:`, insertError);
        continue;
      }

      console.log(`[PENDING_LIST] Created pending image record: ${imageName} (${newImage.image_id})`);
    } catch (err) {
      console.error(`[PENDING_LIST] Exception processing ${imageName}:`, err);
    }
  }

  console.log(`[PENDING_LIST] Completed processing pending images`);
}

async function handleStatusMessage(payload, client) {
  const deviceMac = payload.device_mac || payload.device_id;
  const normalizedMac = normalizeMacAddress(deviceMac);

  if (!normalizedMac) {
    console.error(`[ERROR] Invalid MAC address in status message: ${deviceMac}`);
    return null;
  }

  console.log(`[STATUS] Device ${normalizedMac} is alive, pending images: ${payload.pendingImg || payload.pending_count || 0}`);

  await logMqttMessage(supabase, normalizedMac, 'inbound', `ESP32CAM/${normalizedMac}/status`, payload, 'hello');

  const lineage = await resolveDeviceLineage(supabase, normalizedMac);

  let { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', normalizedMac)
    .maybeSingle();

  if (!device && !deviceError) {
    console.log(`[AUTO-PROVISION] Device ${normalizedMac} not found, attempting auto-provision...`);
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
      firmware_version: payload.firmware_version || device.firmware_version,
      battery_voltage: payload.battery_voltage || device.battery_voltage,
      wifi_rssi: payload.wifi_rssi || device.wifi_rssi,
    })
    .eq('device_id', device.device_id);

  console.log(`[STATUS] Device ${device.device_code || device.device_mac} updated (status: ${device.provisioning_status})`);

  let sentCommandTypes = new Set();
  try {
    sentCommandTypes = await sendPendingCommands(device, client) || new Set();
  } catch (pendingError) {
    console.error(`[ERROR] sendPendingCommands failed but continuing:`, pendingError);
  }

  const pendingList = payload.pending_list || [];
  if (pendingList.length > 0) {
    try {
      await processPendingList(device, pendingList, lineage);
    } catch (pendingListError) {
      console.error(`[ERROR] processPendingList failed but continuing:`, pendingListError);
    }
  }

  const pendingCount = payload.pendingImg || payload.pending_count || 0;
  const cmdTopic = `ESP32CAM/${normalizedMac}/cmd`;

  const session = getOrCreateSession(normalizedMac, device.device_id, pendingCount);

  try {
    if (pendingCount > 0) {
      console.log(`[STATUS] Device reports ${pendingCount} pending images - sending send_all_pending`);
      session.state = 'draining_pending';
      session.initialPendingCount = pendingCount;
      session.pendingDrained = 0;

      const drainCmd = {
        device_id: normalizedMac,
        send_all_pending: true,
      };
      client.publish(cmdTopic, JSON.stringify(drainCmd));
      await logMqttMessage(supabase, normalizedMac, 'outbound', cmdTopic, drainCmd, 'cmd_send_all_pending');
      console.log(`[CMD] Sent send_all_pending to ${normalizedMac} (${pendingCount} pending images to drain)`);
    } else if (sentCommandTypes.has('capture_image')) {
      console.log(`[STATUS] capture_image already sent via pending commands queue - skipping duplicate`);
      session.state = 'capture_sent';
      session.lastCaptureSentAt = Date.now();
    } else if (session.lastCaptureSentAt && (Date.now() - session.lastCaptureSentAt) < 30000) {
      console.log(`[STATUS] capture_image sent ${Math.round((Date.now() - session.lastCaptureSentAt) / 1000)}s ago - skipping duplicate`);
    } else {
      console.log(`[STATUS] Device has no pending images - sending capture_image`);
      session.state = 'capture_sent';
      session.lastCaptureSentAt = Date.now();

      await supabase
        .from('device_commands')
        .update({ status: 'superseded', delivered_at: new Date().toISOString() })
        .eq('device_id', device.device_id)
        .eq('command_type', 'capture_image')
        .eq('status', 'pending');

      const captureCmd = {
        device_id: normalizedMac,
        capture_image: true,
      };
      client.publish(cmdTopic, JSON.stringify(captureCmd));
      await logMqttMessage(supabase, normalizedMac, 'outbound', cmdTopic, captureCmd, 'cmd_capture_image');
      console.log(`[CMD] Sent capture_image to ${normalizedMac}`);
    }
  } catch (cmdError) {
    console.error(`[ERROR] Failed to send command to ${normalizedMac}:`, cmdError);
  }

  return { device, pendingCount };
}

async function handleMetadataMessage(payload, client) {
  const normalizedPayload = normalizeMetadataPayload(payload);

  console.log(`[METADATA] Normalized payload - timestamp: ${normalizedPayload.capture_timestamp}, chunks: ${normalizedPayload.total_chunks_count}, temp: ${normalizedPayload.temperature}C`);

  const deviceMac = normalizedPayload.device_mac || normalizedPayload.device_id;
  const normalizedMac = normalizeMacAddress(deviceMac);

  if (!normalizedMac) {
    console.error(`[ERROR] Invalid MAC address in metadata: ${deviceMac}`);
    return;
  }

  console.log(`[METADATA] Received for image ${normalizedPayload.image_name} from ${normalizedPayload.device_id} (MAC: ${normalizedMac})`);

  await logMqttMessage(supabase, normalizedMac, 'inbound', `ESP32CAM/${normalizedMac}/data`, normalizedPayload, 'metadata', null, null, normalizedPayload.image_name);

  const lineage = await resolveDeviceLineage(supabase, normalizedMac);

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', normalizedMac)
    .maybeSingle();

  if (deviceError) {
    console.error(`[ERROR] Device lookup error:`, deviceError);
    return;
  }

  if (!device) {
    console.error(`[ERROR] Device ${normalizedPayload.device_id} not found`);
    return;
  }

  const imageKey = getImageKey(normalizedMac, normalizedPayload.image_name);

  const existingBuffer = imageBuffers.get(imageKey);
  if (existingBuffer && !existingBuffer.completed && existingBuffer.chunks.size > 0) {
    const sameCapture =
      existingBuffer.totalChunks === normalizedPayload.total_chunks_count &&
      existingBuffer.metadata?.capture_timestamp === normalizedPayload.capture_timestamp;

    if (sameCapture) {
      console.log(`[METADATA] Duplicate metadata for ${normalizedPayload.image_name} (${existingBuffer.chunks.size} chunks in buffer) - ignoring to preserve reception progress`);
      const session = deviceSessions.get(normalizedMac);
      if (session) session.lastActivityAt = new Date();
      return;
    }

    console.log(`[METADATA] New capture params for ${normalizedPayload.image_name} (chunks: ${existingBuffer.totalChunks} -> ${normalizedPayload.total_chunks_count}) - clearing old buffer`);
    await clearChunkBuffer(supabase, normalizedMac, normalizedPayload.image_name);
    clearMissingChunkTimer(imageKey);
  }

  const tempF = celsiusToFahrenheit(normalizedPayload.temperature);

  const telemetryData = {
    captured_at: normalizedPayload.capture_timestamp,
    total_chunks: normalizedPayload.total_chunks_count,
    image_size: normalizedPayload.image_size,
    max_chunk_size: normalizedPayload.max_chunk_size,
    temperature: tempF,
    humidity: normalizedPayload.humidity,
    pressure: normalizedPayload.pressure,
    gas_resistance: normalizedPayload.gas_resistance,
    location: normalizedPayload.location,
    error_code: normalizedPayload.error,
  };

  const companyId = lineage?.company_id || device.company_id;
  const programId = lineage?.program_id || device.program_id;
  const siteId = lineage?.site_id || device.site_id;
  const sessionId = lineage?.site_id ? await findActiveSession(supabase, lineage.site_id) : null;

  imageBuffers.set(imageKey, {
    metadata: normalizedPayload,
    chunks: new Map(),
    totalChunks: normalizedPayload.total_chunks_count,
    imageRecord: null,
    device,
    lineage,
    payloadId: null,
    sessionId,
    completed: false,
  });

  const { data: existingImage, error: existingError } = await supabase
    .from('device_images')
    .select('image_id, status, received_chunks, total_chunks')
    .eq('device_id', device.device_id)
    .eq('image_name', normalizedPayload.image_name)
    .maybeSingle();

  if (existingError) {
    console.error(`[ERROR] Failed to check for existing image:`, existingError);
  }

  if (existingImage && existingImage.status === 'complete') {
    console.log(`[METADATA] Image ${normalizedPayload.image_name} was complete but device is re-sending - resetting for upsert re-reception`);

    await clearChunkBuffer(supabase, normalizedMac, normalizedPayload.image_name);
    completedImages.delete(imageKey);

    await supabase.rpc('fn_log_duplicate_image', {
      p_device_id: device.device_id,
      p_image_name: normalizedPayload.image_name,
      p_duplicate_metadata: {
        captured_at: normalizedPayload.capture_timestamp,
        total_chunks: normalizedPayload.total_chunks_count,
        image_size: normalizedPayload.image_size,
        temperature: normalizedPayload.temperature,
        note: 'Reset for re-reception - device insists image is pending',
      },
    }).catch(err => console.warn('[METADATA] Failed to log duplicate:', err));
  }

  let imageRecord;
  let payloadId = null;

  try {
    const { data: result, error: rpcError } = await supabase.rpc('fn_wake_ingestion_handler', {
      p_device_id: device.device_id,
      p_captured_at: normalizedPayload.capture_timestamp || new Date().toISOString(),
      p_image_name: normalizedPayload.image_name,
      p_telemetry_data: telemetryData,
      p_existing_image_id: (existingImage && existingImage.status !== 'complete') ? existingImage.image_id : null,
    });

    if (rpcError || !result || !result.success) {
      console.error(`[METADATA] Wake ingestion RPC failed:`, rpcError || result?.message);
      console.log(`[METADATA] Falling back to direct insert...`);

      if (!existingImage || existingImage.status === 'complete') {
        const { data: newImage, error: insertError } = await supabase
          .from('device_images')
          .insert({
            device_id: device.device_id,
            company_id: companyId,
            program_id: programId,
            site_id: siteId,
            site_device_session_id: sessionId,
            image_name: normalizedPayload.image_name,
            image_size: normalizedPayload.image_size || 0,
            captured_at: normalizedPayload.capture_timestamp || new Date().toISOString(),
            total_chunks: normalizedPayload.total_chunks_count,
            received_chunks: 0,
            status: 'receiving',
            error_code: normalizedPayload.error || 0,
            metadata: {
              location: normalizedPayload.location || 'Unknown',
              temperature: normalizedPayload.temperature,
              temperature_celsius: normalizedPayload.temperature,
              temperature_fahrenheit: tempF,
              humidity: normalizedPayload.humidity,
              pressure: normalizedPayload.pressure,
              gas_resistance: normalizedPayload.gas_resistance,
              error: normalizedPayload.error || 0,
            },
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[ERROR] Failed to create image record:`, insertError);
          return;
        }

        imageRecord = newImage;
        console.log(`[SUCCESS] Created new image record ${imageRecord.image_id} (fallback)`);
      } else {
        const { data: updatedImage, error: updateError } = await supabase
          .from('device_images')
          .update({
            captured_at: normalizedPayload.capture_timestamp,
            image_size: normalizedPayload.image_size || existingImage.image_size,
            total_chunks: normalizedPayload.total_chunks_count,
            received_chunks: 0,
            status: 'receiving',
            company_id: companyId,
            program_id: programId,
            site_id: siteId,
            site_device_session_id: sessionId,
            metadata: {
              location: normalizedPayload.location || 'Unknown',
              temperature: normalizedPayload.temperature,
              temperature_celsius: normalizedPayload.temperature,
              temperature_fahrenheit: tempF,
              humidity: normalizedPayload.humidity,
              pressure: normalizedPayload.pressure,
              gas_resistance: normalizedPayload.gas_resistance,
              error: normalizedPayload.error || 0,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('image_id', existingImage.image_id)
          .select()
          .single();

        if (updateError) {
          console.error(`[ERROR] Failed to update image record:`, updateError);
          return;
        }

        imageRecord = updatedImage;
        console.log(`[SUCCESS] Updated image record ${imageRecord.image_id} for resume (fallback)`);
      }
    } else {
      console.log(`[METADATA] Wake ingestion RPC success:`, {
        payload_id: result.payload_id,
        image_id: result.image_id,
        session_id: result.session_id,
        wake_index: result.wake_index,
        is_resume: result.is_resume,
      });

      payloadId = result.payload_id;

      const { data: imgRecord } = await supabase
        .from('device_images')
        .select('*')
        .eq('image_id', result.image_id)
        .maybeSingle();

      imageRecord = imgRecord || { image_id: result.image_id };

      if (result.payload_id && result.image_id) {
        await supabase
          .from('device_wake_payloads')
          .update({
            image_id: result.image_id,
            image_status: 'receiving',
            wake_type: 'image_wake',
            chunk_count: normalizedPayload.total_chunks_count,
            chunks_received: 0,
          })
          .eq('payload_id', result.payload_id);
      }
    }
  } catch (rpcErr) {
    console.error(`[METADATA] Exception during wake ingestion:`, rpcErr);
    return;
  }

  const buffer = imageBuffers.get(imageKey);
  if (buffer) {
    buffer.imageRecord = imageRecord;
    buffer.payloadId = payloadId;
  }

  if (normalizedPayload.temperature !== undefined) {
    const telemetryInsert = {
      device_id: device.device_id,
      company_id: companyId,
      program_id: programId,
      site_id: siteId,
      site_device_session_id: sessionId,
      wake_payload_id: payloadId,
      captured_at: normalizedPayload.capture_timestamp || new Date().toISOString(),
      temperature: tempF,
      humidity: normalizedPayload.humidity,
      pressure: normalizedPayload.pressure,
      gas_resistance: normalizedPayload.gas_resistance,
      battery_voltage: device.battery_voltage,
    };

    const { error: telemetryError } = await supabase.from('device_telemetry').insert(telemetryInsert);

    if (telemetryError) {
      console.error(`[ERROR] Failed to create telemetry record:`, telemetryError);
    } else {
      console.log(`[SUCCESS] Created telemetry record for device ${device.device_code} (temp: ${normalizedPayload.temperature}C -> ${tempF}F)`);
    }
  }

  console.log(`[METADATA] Ready to receive ${normalizedPayload.total_chunks_count} chunks for ${normalizedPayload.image_name}`);

  const session = deviceSessions.get(normalizedMac);
  if (session) {
    session.currentImageName = normalizedPayload.image_name;
    session.lastActivityAt = new Date();
  }

  const shouldSendImage = session?.state === 'draining_pending';

  if (shouldSendImage) {
    const sendImageCmd = {
      device_id: normalizedMac,
      send_image: normalizedPayload.image_name
    };
    client.publish(`ESP32CAM/${normalizedMac}/cmd`, JSON.stringify(sendImageCmd));
    await logMqttMessage(supabase, normalizedMac, 'outbound', `ESP32CAM/${normalizedMac}/cmd`, sendImageCmd, 'cmd_send_image', null, payloadId, normalizedPayload.image_name);
    console.log(`[CMD] Sent send_image command for ${normalizedPayload.image_name} to ${normalizedMac} (draining pending)`);
  } else {
    console.log(`[METADATA] Device is actively transmitting after capture - skipping send_image to avoid restart loop`);
  }

  const pgComplete = await isComplete(supabase, normalizedMac, normalizedPayload.image_name, normalizedPayload.total_chunks_count);
  if (pgComplete) {
    console.log(`[METADATA] All chunks already in Postgres for ${normalizedPayload.image_name} - triggering reassembly`);
    await finalizeAndUploadImage(normalizedMac, normalizedPayload.image_name, buffer, client);
  }
}

function clearMissingChunkTimer(imageKey) {
  const existing = missingChunkTimers.get(imageKey);
  if (existing) {
    clearTimeout(existing);
    missingChunkTimers.delete(imageKey);
  }
}

function resetMissingChunkTimer(imageKey, normalizedMac, imageName, buffer, client) {
  clearMissingChunkTimer(imageKey);

  const timer = setTimeout(async () => {
    missingChunkTimers.delete(imageKey);

    if (completedImages.has(imageKey) || (buffer && buffer.completed)) {
      return;
    }

    const totalChunks = buffer?.totalChunks || 0;
    if (totalChunks === 0) return;

    const missing = await getMissingChunks(supabase, normalizedMac, imageName, totalChunks);
    if (missing.length === 0) {
      console.log(`[RECOVERY] No missing chunks for ${imageName} - triggering finalization`);
      await finalizeAndUploadImage(normalizedMac, imageName, buffer, client);
      return;
    }

    console.log(`[RECOVERY] ${missing.length} missing chunks for ${imageName} after ${MISSING_CHUNK_CHECK_DELAY_MS / 1000}s idle: [${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}]`);

    const session = deviceSessions.get(normalizedMac);
    if (session) {
      const missingRequest = {
        device_id: normalizedMac,
        image_name: imageName,
        missing_chunks: missing,
      };
      client.publish(`ESP32CAM/${normalizedMac}/cmd`, JSON.stringify(missingRequest));
      await logMqttMessage(supabase, normalizedMac, 'outbound', `ESP32CAM/${normalizedMac}/cmd`, missingRequest, 'missing_chunks_recovery', null, null, imageName);
      console.log(`[RECOVERY] Sent missing_chunks request for ${imageName} (${missing.length} chunks)`);
    } else {
      console.log(`[RECOVERY] Device ${normalizedMac} session expired - marking image as incomplete`);
      if (buffer?.imageRecord?.image_id) {
        await supabase
          .from('device_images')
          .update({
            status: 'incomplete',
            error_code: 3,
            metadata: {
              ...(buffer.imageRecord.metadata || {}),
              missing_chunks: missing,
              incomplete_reason: 'device_disconnected_before_all_chunks_received',
            },
          })
          .eq('image_id', buffer.imageRecord.image_id);
      }
    }
  }, MISSING_CHUNK_CHECK_DELAY_MS);

  missingChunkTimers.set(imageKey, timer);
}

async function handleChunkMessage(payload, client) {
  const deviceMac = payload.device_mac || payload.device_id;
  const normalizedMac = normalizeMacAddress(deviceMac) || deviceMac;
  const imageKey = getImageKey(normalizedMac, payload.image_name);

  if (completedImages.has(imageKey)) {
    return;
  }

  const buffer = imageBuffers.get(imageKey);

  if (buffer && buffer.completed) {
    return;
  }

  try {
    const chunkBytes = Buffer.from(payload.payload, 'base64');

    if (chunkBytes.length === 0) {
      console.error(`[ERROR] Chunk ${payload.chunk_id} has zero length after decoding`);
      return;
    }

    if (payload.chunk_id === 0) {
      const jpegHeader = chunkBytes.slice(0, 3);
      if (jpegHeader[0] === 0xFF && jpegHeader[1] === 0xD8 && jpegHeader[2] === 0xFF) {
        console.log(`[CHUNK] Valid JPEG header detected in first chunk`);
      } else {
        console.warn(`[CHUNK] Warning: First chunk may not have valid JPEG header`);
      }
    }

    console.log(`[CHUNK] Decoded chunk ${payload.chunk_id}: ${chunkBytes.length} bytes`);

    const isNew = await storeChunk(supabase, normalizedMac, payload.image_name, payload.chunk_id, chunkBytes);

    if (buffer) {
      buffer.chunks.set(payload.chunk_id, chunkBytes);
    }

    if (!isNew) {
      console.log(`[CHUNK] Duplicate chunk ${payload.chunk_id} for ${payload.image_name} - already in Postgres`);
      return;
    }

    const pgCount = await getReceivedChunkCount(supabase, normalizedMac, payload.image_name);
    const totalChunks = buffer?.totalChunks || 0;
    const progress = totalChunks > 0 ? ((pgCount / totalChunks) * 100).toFixed(1) : '?';
    console.log(`[CHUNK] Received chunk ${payload.chunk_id + 1}/${totalChunks || '?'} for ${payload.image_name} (${pgCount} in Postgres, ${progress}% complete)`);

    if (buffer?.imageRecord?.image_id) {
      await supabase
        .from('device_images')
        .update({
          received_chunks: pgCount,
          updated_at: new Date().toISOString(),
        })
        .eq('image_id', buffer.imageRecord.image_id);
    }

    if (buffer?.payloadId) {
      await supabase
        .from('device_wake_payloads')
        .update({ chunks_received: pgCount })
        .eq('payload_id', buffer.payloadId);
    }

    if (totalChunks > 0 && pgCount >= totalChunks) {
      console.log(`[COMPLETE] All ${totalChunks} chunks received for ${payload.image_name} (verified via Postgres)`);
      clearMissingChunkTimer(imageKey);
      await finalizeAndUploadImage(normalizedMac, payload.image_name, buffer, client);
    } else if (totalChunks > 0 && pgCount < totalChunks) {
      resetMissingChunkTimer(imageKey, normalizedMac, payload.image_name, buffer, client);
    } else if (!buffer && totalChunks === 0) {
      console.log(`[CHUNK] No metadata buffer yet for ${payload.image_name} - chunk ${payload.chunk_id} stored in Postgres, will assemble when metadata arrives`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to process chunk ${payload.chunk_id}:`, error.message);

    const retryRequest = {
      device_id: normalizedMac,
      image_name: payload.image_name,
      missing_chunks: [payload.chunk_id],
    };
    client.publish(`ESP32CAM/${normalizedMac}/cmd`, JSON.stringify(retryRequest));
    await logMqttMessage(supabase, normalizedMac, 'outbound', `ESP32CAM/${normalizedMac}/cmd`, retryRequest, 'missing_chunks', null, null, payload.image_name);
  }
}

async function finalizeAndUploadImage(normalizedMac, imageName, buffer, client) {
  try {
    const imageKey = getImageKey(normalizedMac, imageName);
    if (completedImages.has(imageKey) || (buffer && buffer.completed)) {
      console.log(`[FINALIZE] Skipping already-completed image ${imageName}`);
      return;
    }

    if (buffer?.imageRecord?.image_id) {
      const { data: imgCheck } = await supabase
        .from('device_images')
        .select('status')
        .eq('image_id', buffer.imageRecord.image_id)
        .maybeSingle();
      if (imgCheck?.status === 'complete') {
        console.log(`[FINALIZE] Image ${imageName} already complete in DB - skipping`);
        if (buffer) buffer.completed = true;
        completedImages.add(imageKey);
        return;
      }
    }

    const totalChunks = buffer?.totalChunks || 0;
    if (totalChunks === 0) {
      console.error(`[FINALIZE] Cannot finalize ${imageName} - totalChunks unknown`);
      return;
    }

    console.log(`[FINALIZE] Starting finalization for ${imageName}`);

    const missing = await getMissingChunks(supabase, normalizedMac, imageName, totalChunks);
    if (missing.length > 0) {
      console.log(`[MISSING] Requesting ${missing.length} missing chunks: [${missing.join(', ')}]`);
      const missingRequest = {
        device_id: normalizedMac,
        image_name: imageName,
        missing_chunks: missing,
      };
      client.publish(`ESP32CAM/${normalizedMac}/cmd`, JSON.stringify(missingRequest));
      await logMqttMessage(supabase, normalizedMac, 'outbound', `ESP32CAM/${normalizedMac}/cmd`, missingRequest, 'missing_chunks', null, null, imageName);
      await logAckToAudit(supabase, normalizedMac, imageName, 'MISSING_CHUNKS', `ESP32CAM/${normalizedMac}/cmd`, missingRequest, true);

      if (buffer?.imageRecord?.image_id) {
        await supabase
          .from('device_images')
          .update({
            status: 'receiving',
            retry_count: (buffer.imageRecord.retry_count || 0) + 1,
          })
          .eq('image_id', buffer.imageRecord.image_id);
      }

      return;
    }

    console.log(`[FINALIZE] All chunks present, assembling from Postgres...`);
    const mergedImage = await assembleImageFromPostgres(supabase, normalizedMac, imageName, totalChunks);

    if (!mergedImage) {
      console.error(`[ERROR] Failed to assemble image from Postgres`);
      return;
    }

    const jpegStart = mergedImage.slice(0, 3);
    const jpegEnd = mergedImage.slice(-2);

    if (jpegStart[0] === 0xFF && jpegStart[1] === 0xD8 && jpegStart[2] === 0xFF) {
      console.log(`[FINALIZE] Valid JPEG start marker (FF D8 FF)`);
    } else {
      console.error(`[FINALIZE] Invalid JPEG start marker: ${Array.from(jpegStart).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    if (jpegEnd[0] === 0xFF && jpegEnd[1] === 0xD9) {
      console.log(`[FINALIZE] Valid JPEG end marker (FF D9)`);
    } else {
      console.warn(`[FINALIZE] Warning: JPEG end marker may be invalid: ${Array.from(jpegEnd).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    console.log(`[FINALIZE] Image size: ${mergedImage.length} bytes (expected: ${buffer?.metadata?.image_size || 'unknown'})`);

    const lineage = buffer?.lineage || await resolveDeviceLineage(supabase, normalizedMac);

    let filePath;
    if (lineage?.company_id && lineage?.site_id) {
      try {
        const { data: pathData } = await supabase.rpc('fn_build_device_image_path', {
          p_company_id: lineage.company_id,
          p_site_id: lineage.site_id,
          p_device_mac: normalizedMac,
          p_image_name: imageName,
        });
        filePath = pathData || `${normalizedMac}/${imageName}`;
      } catch (pathErr) {
        filePath = `${normalizedMac}/${imageName}`;
      }
    } else {
      filePath = `${normalizedMac}/${imageName}`;
    }

    console.log(`[UPLOAD] Uploading to ${STORAGE_BUCKET}: ${filePath}`);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, mergedImage, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error(`[ERROR] Failed to upload image:`, uploadError);
      if (buffer?.imageRecord?.image_id) {
        await supabase
          .from('device_images')
          .update({ status: 'failed', error_code: 1 })
          .eq('image_id', buffer.imageRecord.image_id);
      }
      return;
    }

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const imageUrl = urlData.publicUrl;
    console.log(`[SUCCESS] Image uploaded: ${imageUrl}`);

    let completionResult = null;

    let imageId = buffer?.imageRecord?.image_id;

    if (!imageId) {
      console.log(`[FINALIZE] No imageRecord on buffer - looking up by device+image_name`);
      const lineage = buffer?.lineage || await resolveDeviceLineage(supabase, normalizedMac);
      const deviceId = buffer?.device?.device_id || lineage?.device_id;
      if (deviceId) {
        const { data: lookedUp } = await supabase
          .from('device_images')
          .select('image_id')
          .eq('device_id', deviceId)
          .eq('image_name', imageName)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lookedUp) {
          imageId = lookedUp.image_id;
          console.log(`[FINALIZE] Found existing image record ${imageId} via lookup`);
        }
      }
    }

    if (imageId) {
      try {
        const { data: result, error: rpcError } = await supabase.rpc('fn_image_completion_handler', {
          p_image_id: imageId,
          p_image_url: imageUrl,
        });

        if (rpcError || !result || !result.success) {
          console.error(`[FINALIZE] Completion handler RPC failed:`, rpcError || result?.message);
          await supabase
            .from('device_images')
            .update({
              status: 'complete',
              image_url: imageUrl,
              received_at: new Date().toISOString(),
              received_chunks: totalChunks,
            })
            .eq('image_id', imageId);
        } else {
          completionResult = result;
          console.log(`[FINALIZE] Image completion RPC success:`, {
            image_id: result.image_id,
            observation_id: result.observation_id,
            session_id: result.session_id,
          });
        }
      } catch (compErr) {
        console.error(`[FINALIZE] Completion exception:`, compErr);
        await supabase
          .from('device_images')
          .update({
            status: 'complete',
            image_url: imageUrl,
            received_at: new Date().toISOString(),
            received_chunks: totalChunks,
          })
          .eq('image_id', imageId);
      }
    } else {
      console.warn(`[FINALIZE] No image record found for ${imageName} on ${normalizedMac} - creating one now`);
      const lineage = buffer?.lineage || await resolveDeviceLineage(supabase, normalizedMac);
      const deviceId = buffer?.device?.device_id || lineage?.device_id;
      if (deviceId) {
        await supabase
          .from('device_images')
          .insert({
            device_id: deviceId,
            company_id: lineage?.company_id,
            program_id: lineage?.program_id,
            site_id: lineage?.site_id,
            site_device_session_id: buffer?.sessionId,
            image_name: imageName,
            image_url: imageUrl,
            image_size: buffer?.metadata?.image_size || 0,
            captured_at: buffer?.metadata?.capture_timestamp || new Date().toISOString(),
            total_chunks: totalChunks,
            received_chunks: totalChunks,
            received_at: new Date().toISOString(),
            status: 'complete',
            error_code: 0,
            metadata: buffer?.metadata ? {
              location: buffer.metadata.location || 'Unknown',
              temperature: buffer.metadata.temperature,
              humidity: buffer.metadata.humidity,
              pressure: buffer.metadata.pressure,
              gas_resistance: buffer.metadata.gas_resistance,
            } : {},
          });
        console.log(`[FINALIZE] Created new complete image record for ${imageName}`);
      }
    }

    if (buffer?.payloadId) {
      await supabase
        .from('device_wake_payloads')
        .update({
          image_status: 'complete',
          chunks_received: totalChunks,
          is_complete: true,
        })
        .eq('payload_id', buffer.payloadId);
    }

    const ackTopic = `ESP32CAM/${normalizedMac}/ack`;
    const cmdTopic = `ESP32CAM/${normalizedMac}/cmd`;
    const session = deviceSessions.get(normalizedMac);

    if (session && session.state === 'draining_pending') {
      session.pendingDrained++;
      const remaining = session.initialPendingCount - session.pendingDrained;
      console.log(`[DRAIN] Pending image ${imageName} complete (${session.pendingDrained}/${session.initialPendingCount}, ${remaining} remaining)`);

      const pendingAck = {
        device_id: normalizedMac,
        image_name: imageName,
        ACK_OK: {},
      };
      client.publish(ackTopic, JSON.stringify(pendingAck));
      await logMqttMessage(supabase, normalizedMac, 'outbound', ackTopic, pendingAck, 'ack_pending', null, buffer?.payloadId, imageName);
      await logAckToAudit(supabase, normalizedMac, imageName, 'PENDING_IMAGE_ACK', ackTopic, pendingAck, true);
      console.log(`[ACK] Sent ACK_OK (no wake time) for pending image ${imageName} - device should send next pending`);

      if (remaining <= 0) {
        if (session.lastCaptureSentAt && (Date.now() - session.lastCaptureSentAt) < 30000) {
          console.log(`[DRAIN] All pending drained but capture_image sent ${Math.round((Date.now() - session.lastCaptureSentAt) / 1000)}s ago - skipping duplicate`);
        } else {
          console.log(`[DRAIN] All pending images drained - sending capture_image`);
          session.state = 'capture_sent';
          session.lastCaptureSentAt = Date.now();

          const captureCmd = {
            device_id: normalizedMac,
            capture_image: true,
          };
          client.publish(cmdTopic, JSON.stringify(captureCmd));
          await logMqttMessage(supabase, normalizedMac, 'outbound', cmdTopic, captureCmd, 'cmd_capture_image');
          console.log(`[CMD] Sent capture_image to ${normalizedMac} after drain complete`);
        }
      }
    } else {
      const nextWakeTime = await calculateNextWakeTime(buffer?.imageRecord?.device_id || buffer?.device?.device_id);
      const ackMessage = {
        device_id: normalizedMac,
        image_name: imageName,
        ACK_OK: {
          next_wake_time: nextWakeTime,
        },
      };
      client.publish(ackTopic, JSON.stringify(ackMessage));
      await logMqttMessage(supabase, normalizedMac, 'outbound', ackTopic, ackMessage, 'ack_ok', null, buffer?.payloadId, imageName);
      await logAckToAudit(supabase, normalizedMac, imageName, 'ACK_OK', ackTopic, ackMessage, true);
      console.log(`[ACK] Sent ACK_OK to ${buffer?.device?.device_code || normalizedMac} with next wake: ${nextWakeTime}`);

      cleanupSession(normalizedMac);
    }

    await clearChunkBuffer(supabase, normalizedMac, imageName);
    clearMissingChunkTimer(imageKey);

    if (buffer) buffer.completed = true;
    completedImages.add(imageKey);
    setTimeout(() => {
      completedImages.delete(imageKey);
      imageBuffers.delete(imageKey);
    }, COMPLETED_IMAGE_TTL_MS);
    console.log(`[CLEANUP] Marked ${imageName} as completed, chunk buffer cleared`);

  } catch (error) {
    console.error(`[ERROR] Failed to finalize image:`, error);
    console.error(`[ERROR] Stack trace:`, error.stack);

    if (buffer?.imageRecord?.image_id) {
      await supabase
        .from('device_images')
        .update({ status: 'failed', error_code: 2 })
        .eq('image_id', buffer.imageRecord.image_id);
    }
  }
}

async function calculateNextWakeTime(deviceId) {
  try {
    const { data: device, error } = await supabase
      .from('devices')
      .select('wake_schedule_cron, site_id, next_wake_at')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error || !device) {
      console.log(`[SCHEDULE] Device ${deviceId} not found, using default 3h`);
      const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
      return formatTimeForDevice(fallbackTime.toISOString());
    }

    let nextWakeISO = null;

    if (device.next_wake_at) {
      const nextWakeDate = new Date(device.next_wake_at);
      const now = new Date();

      if (nextWakeDate > now) {
        console.log(`[SCHEDULE] Using stored next_wake_at for device ${deviceId}: ${device.next_wake_at}`);
        nextWakeISO = device.next_wake_at;
      } else {
        console.log(`[SCHEDULE] Stored next_wake_at is in the past, recalculating...`);
      }
    }

    if (!nextWakeISO) {
      let cronExpression = device.wake_schedule_cron;

      if (!cronExpression && device.site_id) {
        const { data: site } = await supabase
          .from('sites')
          .select('wake_schedule_cron')
          .eq('site_id', device.site_id)
          .maybeSingle();

        cronExpression = site?.wake_schedule_cron;
      }

      if (!cronExpression) {
        cronExpression = '0 */3 * * *';
      }

      const { data: nextWake, error: rpcError } = await supabase.rpc('fn_calculate_next_wake', {
        p_cron_expression: cronExpression,
        p_from_timestamp: new Date().toISOString(),
      });

      if (rpcError || !nextWake) {
        console.error(`[SCHEDULE] RPC error:`, rpcError);
        const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
        return formatTimeForDevice(fallbackTime.toISOString());
      }

      nextWakeISO = nextWake;
      console.log(`[SCHEDULE] Calculated next wake for device ${deviceId}: ${nextWake} (cron: ${cronExpression})`);
    }

    const simpleTime = formatTimeForDevice(nextWakeISO);
    console.log(`[SCHEDULE] Sending wake time to device: ${simpleTime} (from ${nextWakeISO})`);
    return simpleTime;

  } catch (error) {
    console.error(`[SCHEDULE] Error calculating next wake:`, error);
    const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return formatTimeForDevice(fallbackTime.toISOString());
  }
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
      console.log('[MQTT] Connected to HiveMQ Cloud');

      client.subscribe('ESP32CAM/+/data', (err) => {
        if (err) console.error('[MQTT] Subscription error (ESP32CAM/data):', err);
        else console.log('[MQTT] Subscribed to ESP32CAM/+/data');
      });

      client.subscribe('ESP32CAM/+/status', (err) => {
        if (err) console.error('[MQTT] Subscription error (ESP32CAM/status):', err);
        else console.log('[MQTT] Subscribed to ESP32CAM/+/status');
      });

      client.subscribe('device/+/status', (err) => {
        if (err) console.error('[MQTT] Subscription error (device/status):', err);
        else console.log('[MQTT] Subscribed to device/+/status');
      });

      client.subscribe('device/+/data', (err) => {
        if (err) console.error('[MQTT] Subscription error (device/data):', err);
        else console.log('[MQTT] Subscribed to device/+/data');
      });

      client.subscribe('device/+/ack', (err) => {
        if (err) console.error('[MQTT] Subscription error (device/ack):', err);
        else console.log('[MQTT] Subscribed to device/+/ack');
      });

      resolve(client);
    });

    client.on('error', (error) => {
      console.error('[MQTT] Connection error:', error);
      reject(error);
    });

    client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });

    client.on('offline', () => {
      console.log('[MQTT] Client offline');
    });

    client.on('message', async (topic, message) => {
      try {
        let messageStr = message.toString();

        messageStr = messageStr
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'")
          .trim();

        const payload = JSON.parse(messageStr);

        if (topic.includes('/ack') && commandQueueProcessor) {
          if (!payload.ACK_OK && !payload.missing_chunks) {
            const deviceMac = topic.split('/')[1];
            await commandQueueProcessor.handleCommandAck(deviceMac, payload);
          }
        } else if (topic.includes('/status')) {
          await handleStatusMessage(payload, client);
        } else if (topic.includes('/data')) {
          const hasMetadata = (payload.total_chunks_count !== undefined || payload.total_chunk_count !== undefined)
                           && payload.chunk_id === undefined;

          if (hasMetadata) {
            await handleMetadataMessage(payload, client);
          } else if (payload.chunk_id !== undefined) {
            await handleChunkMessage(payload, client);
          } else if (payload.temperature !== undefined || payload.humidity !== undefined) {
            await handleTelemetryOnly(payload);
          }
        }
      } catch (error) {
        console.error('[MQTT] Message processing error:', error);
        console.error('[MQTT] Raw message:', message.toString('utf8').substring(0, 200));
      }
    });
  });
}

async function handleTelemetryOnly(payload) {
  const deviceMac = payload.device_mac || payload.device_id;
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) return;

  console.log(`[TELEMETRY] Telemetry-only message from ${normalizedMac}`);

  await logMqttMessage(supabase, normalizedMac, 'inbound', `ESP32CAM/${normalizedMac}/data`, payload, 'telemetry');

  const lineage = await resolveDeviceLineage(supabase, normalizedMac);
  if (!lineage) {
    console.warn(`[TELEMETRY] No lineage for ${normalizedMac} - skipping`);
    return;
  }

  const sessionId = await findActiveSession(supabase, lineage.site_id);
  const capturedAt = payload.captured_at || new Date().toISOString();

  const { error } = await supabase
    .from('device_telemetry')
    .insert({
      device_id: lineage.device_id,
      company_id: lineage.company_id,
      program_id: lineage.program_id,
      site_id: lineage.site_id,
      site_device_session_id: sessionId,
      captured_at: capturedAt,
      temperature: celsiusToFahrenheit(payload.temperature),
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      battery_voltage: payload.battery_voltage,
      wifi_rssi: payload.wifi_rssi,
    });

  if (error) {
    console.error(`[TELEMETRY] Insert failed:`, error);
  } else {
    console.log(`[TELEMETRY] Saved (temp: ${payload.temperature}C -> ${celsiusToFahrenheit(payload.temperature)}F)`);
  }
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
    version: '2.0.0',
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
    description: 'Persistent MQTT connection handler with Postgres-backed chunk storage and full RPC integration',
    features: [
      'Auto-provisions new devices on first connection',
      'Receives and reassembles chunked images via Postgres-backed edge_chunk_buffer',
      'Uses fn_wake_ingestion_handler and fn_image_completion_handler RPCs',
      'Creates submissions and observations automatically via server-side RPC',
      'Tracks device telemetry with Celsius to Fahrenheit conversion',
      'Full MQTT traffic logging and ACK audit trail',
      'Handles device commands and wake schedules',
      'Resolves device lineage for context propagation (company, program, site, session)',
    ],
    topics: {
      subscribed: [
        'ESP32CAM/+/status - Device heartbeat and HELLO messages',
        'ESP32CAM/+/data - Image metadata, chunks, and telemetry',
      ],
      published: [
        'ESP32CAM/{MAC}/cmd - Commands (capture_image, send_image, send_all_pending, MISSING_CHUNKS)',
        'ESP32CAM/{MAC}/ack - Acknowledgments (ACK_OK with next_wake_time)',
      ],
    },
    storage: {
      bucket: STORAGE_BUCKET,
      pathFormat: '{company_id}/{site_id}/{device_mac}/{image_name}',
    },
  });
});

async function startService() {
  try {
    console.log('\n======================================================');
    console.log('   MQTT Device Handler v2.0 - Production Service');
    console.log('   Postgres-backed chunks | RPC integration | Full audit');
    console.log('======================================================\n');

    console.log('[CONFIG] Supabase URL:', supabaseUrl);
    console.log('[CONFIG] MQTT Host:', MQTT_HOST);
    console.log('[CONFIG] MQTT Port:', MQTT_PORT);
    console.log('[CONFIG] Storage Bucket:', STORAGE_BUCKET);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    mqttClient = await connectToMQTT();
    connectionStatus.connected = true;
    connectionStatus.lastError = null;

    console.log('[COMMAND_QUEUE] Initializing command queue processor...');
    commandQueueProcessor = new CommandQueueProcessor(supabase, mqttClient, {
      pollInterval: 5000,
      maxRetries: 3,
      retryDelay: 30000,
      getDeviceSessions: () => deviceSessions,
    });
    commandQueueProcessor.start();
    console.log('[COMMAND_QUEUE] Command queue processor started');

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

          if (payload.old.provisioning_status !== 'active' && device.site_id && device.program_id) {
            console.log(`[PROVISIONING] Sending welcome command to newly-mapped device ${device.device_id}`);
            invalidateLineageCache(device.device_mac);

            const { data: site } = await supabase
              .from('sites')
              .select('wake_schedule_cron')
              .eq('site_id', device.site_id)
              .maybeSingle();

            const wakeSchedule = site?.wake_schedule_cron || '0 8,16 * * *';

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
    console.log('[REALTIME] Device provisioning listener active');

    app.listen(PORT, () => {
      console.log(`\n[HTTP] Health check server running on port ${PORT}`);
      console.log(`[HTTP] Health endpoint: http://localhost:${PORT}/health`);
      console.log(`[HTTP] Docs endpoint: http://localhost:${PORT}/docs`);
      console.log('\n[SERVICE] MQTT Device Handler v2.0 is ready!\n');
    });
  } catch (error) {
    console.error('[ERROR] Failed to start service:', error);
    connectionStatus.connected = false;
    connectionStatus.lastError = error.message;
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Received SIGTERM, closing connections...');
  if (commandQueueProcessor) commandQueueProcessor.stop();
  if (mqttClient) mqttClient.end();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Received SIGINT, closing connections...');
  if (commandQueueProcessor) commandQueueProcessor.stop();
  if (mqttClient) mqttClient.end();
  process.exit(0);
});

startService();
