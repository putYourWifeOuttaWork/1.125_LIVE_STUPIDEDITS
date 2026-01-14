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
  const hwNormalized = hardwareVersion.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const prefix = `DEVICE-${hwNormalized}-`;

  // Query existing device codes with this prefix
  const { data: existingDevices } = await supabase
    .from('devices')
    .select('device_code')
    .like('device_code', `${prefix}%`)
    .order('device_code');

  // Extract numbers from existing codes
  const numbers = [];
  existingDevices?.forEach((d) => {
    if (d.device_code) {
      const match = d.device_code.match(new RegExp(`${prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)`));
      if (match) {
        numbers.push(parseInt(match[1]));
      }
    }
  });

  // Find the first available number (starting from 1)
  let nextNum = 1;
  while (numbers.includes(nextNum)) {
    nextNum++;
  }

  // Return zero-padded code
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/**
 * Checks if the input is a valid MAC address pattern
 */
function isValidMacAddress(input) {
  if (!input) return false;
  const cleaned = input.replace(/[:\-\s]/g, '');
  return /^[0-9A-Fa-f]{12}$/.test(cleaned);
}

/**
 * Normalize device identifier to standard format
 *
 * Handles both MAC addresses and special device identifiers:
 * - MAC addresses: Converts to uppercase 12-character string without separators
 * - Special identifiers: Preserves TEST-, SYSTEM:, VIRTUAL: prefixes
 *
 * Examples:
 *   "98:A3:16:F8:29:28"      -> "98A316F82928"
 *   "98-a3-16-f8-29-28"      -> "98A316F82928"
 *   "98A316F82928"           -> "98A316F82928"
 *   "TEST-ESP32-002"         -> "TEST-ESP32-002"
 *   "SYSTEM:AUTO:GENERATED"  -> "SYSTEM:AUTO:GENERATED"
 *   "VIRTUAL:SIMULATOR:001"  -> "VIRTUAL:SIMULATOR:001"
 */
function normalizeMacAddress(identifier) {
  if (!identifier) return null;

  const upper = identifier.toUpperCase();

  // Check for special identifier prefixes - preserve as-is
  if (upper.startsWith('TEST-') || upper.startsWith('SYSTEM:') || upper.startsWith('VIRTUAL:')) {
    return upper;
  }

  // Check if it looks like a MAC address
  if (!isValidMacAddress(identifier)) {
    console.warn(`[MAC] Invalid device identifier format: ${identifier}`);
    return null;
  }

  // Normalize MAC address: remove separators and uppercase
  return identifier.replace(/[:\-\s]/g, '').toUpperCase();
}

async function autoProvisionDevice(deviceMac) {
  const normalizedMac = normalizeMacAddress(deviceMac);
  if (!normalizedMac) {
    console.error(`[ERROR] Invalid MAC address: ${deviceMac}`);
    return null;
  }

  console.log(`[AUTO-PROVISION] Attempting to provision new device: ${deviceMac} (normalized: ${normalizedMac})`);

  try {
    const deviceCode = await generateDeviceCode('ESP32-S3');

    const { data: newDevice, error: insertError } = await supabase
      .from('devices')
      .insert({
        device_mac: normalizedMac,  // Use normalized MAC
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

    console.log(`[SUCCESS] Auto-provisioned device ${normalizedMac} with code ${deviceCode} and ID ${newDevice.device_id}`);
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
            device_id: device.device_mac, // Use MAC address per PDF spec
            ping: true,
            timestamp: command.command_payload?.timestamp || new Date().toISOString()
          };
          break;

        case 'capture_image':
          // Per BrainlyTree PDF spec (page 5)
          message = {
            device_id: device.device_mac,
            capture_image: true
          };
          break;

        case 'set_wake_schedule':
          // Per BrainlyTree PDF spec: send "next_wake" with calculated time, NOT cron
          const nextWake = await calculateNextWakeTime(device.device_id);
          message = {
            device_id: device.device_mac,
            next_wake: nextWake // ISO 8601 UTC timestamp
          };
          break;

        case 'send_image':
          // Per BrainlyTree PDF spec (page 5)
          message = {
            device_id: device.device_mac,
            send_image: command.command_payload?.image_name
          };
          break;

        default:
          console.log(`[CMD] Unknown command type: ${command.command_type}`);
          continue;
      }

      // Publish command to device - use MAC address in topic per PDF spec
      const topic = `ESP32CAM/${device.device_mac}/cmd`;
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
  const normalizedMac = normalizeMacAddress(deviceMac);

  if (!normalizedMac) {
    console.error(`[ERROR] Invalid MAC address in status message: ${deviceMac}`);
    return null;
  }

  console.log(`[STATUS] Device ${payload.device_id} (MAC: ${deviceMac}, normalized: ${normalizedMac}) is alive, pending images: ${payload.pendingImg || payload.pending_count || 0}`);

  let { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', normalizedMac)  // Use normalized MAC for lookup
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
    })
    .eq('device_id', device.device_id);

  console.log(`[STATUS] Device ${device.device_code || device.device_mac} updated (status: ${device.provisioning_status})`);

  // Send any pending commands to the device
  await sendPendingCommands(device, client);

  // Per ESP32-CAM architecture: Handle device alive status
  const pendingCount = payload.pendingImg || payload.pending_count || 0;

  // Log pending image information for diagnostics
  if (pendingCount > 0) {
    console.log(`[STATUS] Device reports ${pendingCount} pending images from offline period`);
  } else {
    console.log(`[STATUS] Device has no pending images - will capture new image`);
  }

  // ALWAYS send capture_image command when device sends Alive message
  // This initiates the standard protocol flow regardless of pending count:
  // 1. Server sends capture_image
  // 2. Device responds with metadata (from pending queue or new capture)
  // 3. Server sends send_image to request transmission
  // 4. Device sends chunks
  // 5. Server verifies and sends ACK_OK with next_wake_time
  //
  // Per BrainlyTree PDF Section 8.5: The device knows whether to capture
  // a new image or send a pending one. Server should not send ACK_OK until
  // AFTER successfully receiving and verifying the image.
  try {
    const captureCmd = {
      device_id: deviceMac,
      capture_image: true,
    };
    client.publish(`ESP32CAM/${deviceMac}/cmd`, JSON.stringify(captureCmd));
    console.log(`[CMD] Sent capture_image command to ${deviceMac} (device pending count: ${pendingCount})`);
  } catch (cmdError) {
    console.error(`[ERROR] Failed to send capture_image command:`, cmdError);
  }

  return { device, pendingCount };
}

async function handleMetadataMessage(payload, client) {
  // Normalize field names from device format to server format
  const normalizedPayload = {
    ...payload,
    // Handle timestamp field variations
    capture_timestamp: payload.capture_timestamp || payload.capture_timeStamp,
    // Handle chunk count field variations
    total_chunks_count: payload.total_chunks_count || payload.total_chunk_count,
  };

  console.log(`[METADATA] Normalized payload fields - timestamp: ${normalizedPayload.capture_timestamp}, chunks: ${normalizedPayload.total_chunks_count}`);

  const deviceMac = normalizedPayload.device_mac || normalizedPayload.device_id;
  const normalizedMac = normalizeMacAddress(deviceMac);

  if (!normalizedMac) {
    console.error(`[ERROR] Invalid MAC address in metadata: ${deviceMac}`);
    return;
  }

  console.log(`[METADATA] Received for image ${normalizedPayload.image_name} from ${normalizedPayload.device_id} (MAC: ${normalizedMac})`);

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_mac', normalizedMac)  // Use normalized MAC for lookup
    .maybeSingle();

  if (deviceError) {
    console.error(`[ERROR] Device lookup error:`, deviceError);
    return;
  }

  if (!device) {
    console.error(`[ERROR] Device ${normalizedPayload.device_id} not found`);
    return;
  }

  const imageKey = getImageKey(normalizedPayload.device_id, normalizedPayload.image_name);

  // Build metadata object with all sensor data
  const metadataObj = {
    location: normalizedPayload.location || 'Unknown',
    temperature: normalizedPayload.temperature,
    humidity: normalizedPayload.humidity,
    pressure: normalizedPayload.pressure,
    gas_resistance: normalizedPayload.gas_resistance,
    error: normalizedPayload.error || 0,
  };

  console.log(`[METADATA] Inserting image record with metadata:`, JSON.stringify(metadataObj));

  const { data: imageRecord, error: imageError } = await supabase
    .from('device_images')
    .insert({
      device_id: device.device_id,
      image_name: normalizedPayload.image_name,
      image_size: normalizedPayload.image_size || 0,
      captured_at: normalizedPayload.capture_timestamp,
      total_chunks: normalizedPayload.total_chunks_count,
      received_chunks: 0,
      status: 'receiving',
      error_code: normalizedPayload.error || 0,
      metadata: metadataObj,
    })
    .select()
    .single();

  if (imageError) {
    console.error(`[ERROR] Failed to create image record:`, imageError);
    console.error(`[ERROR] Payload was:`, JSON.stringify(normalizedPayload));
    return;
  }

  console.log(`[SUCCESS] Created image record ${imageRecord.image_id}`);

  // Create telemetry record if we have sensor data
  if (normalizedPayload.temperature !== undefined) {
    const { error: telemetryError } = await supabase.from('device_telemetry').insert({
      device_id: device.device_id,
      captured_at: normalizedPayload.capture_timestamp,
      temperature: normalizedPayload.temperature,
      humidity: normalizedPayload.humidity,
      pressure: normalizedPayload.pressure,
      gas_resistance: normalizedPayload.gas_resistance,
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
    metadata: normalizedPayload,
    chunks: new Map(),
    totalChunks: normalizedPayload.total_chunks_count,
    imageRecord,
    device,
  });

  console.log(`[METADATA] Ready to receive ${normalizedPayload.total_chunks_count} chunks for ${normalizedPayload.image_name}`);

  // Send send_image command to request chunks (per PDF spec page 3, step 11)
  const sendImageCmd = {
    device_id: deviceMac,
    send_image: normalizedPayload.image_name
  };
  client.publish(`ESP32CAM/${deviceMac}/cmd`, JSON.stringify(sendImageCmd));
  console.log(`[CMD] Sent send_image command for ${normalizedPayload.image_name} to ${deviceMac}`);
}

async function handleChunkMessage(payload, client) {
  const imageKey = getImageKey(payload.device_id, payload.image_name);
  const buffer = imageBuffers.get(imageKey);

  if (!buffer) {
    console.error(`[ERROR] No metadata found for ${payload.image_name}`);
    console.error(`[ERROR] Available keys:`, Array.from(imageBuffers.keys()));
    return;
  }

  try {
    // Decode base64 payload to binary data
    const chunkBytes = Buffer.from(payload.payload, 'base64');

    // Validate chunk size
    if (chunkBytes.length === 0) {
      console.error(`[ERROR] Chunk ${payload.chunk_id} has zero length after decoding`);
      return;
    }

    // For first chunk, verify JPEG header
    if (payload.chunk_id === 0) {
      const jpegHeader = chunkBytes.slice(0, 3);
      if (jpegHeader[0] === 0xFF && jpegHeader[1] === 0xD8 && jpegHeader[2] === 0xFF) {
        console.log(`[CHUNK] ✅ Valid JPEG header detected in first chunk`);
      } else {
        console.warn(`[CHUNK] ⚠️  Warning: First chunk may not have valid JPEG header`);
      }
    }

    console.log(`[CHUNK] Decoded chunk ${payload.chunk_id}: ${chunkBytes.length} bytes (from ${payload.payload.length} base64 chars)`);

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
  } catch (error) {
    console.error(`[ERROR] Failed to decode chunk ${payload.chunk_id}:`, error.message);
    console.error(`[ERROR] Payload preview:`, payload.payload?.substring(0, 50));

    // Request retransmission of this chunk
    const retryRequest = {
      device_id: payload.device_id,
      image_name: payload.image_name,
      missing_chunks: [payload.chunk_id],
    };
    client.publish(`ESP32CAM/${payload.device_id}/ack`, JSON.stringify(retryRequest));
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
      client.publish(`ESP32CAM/${deviceId}/ack`, JSON.stringify(missingRequest));

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

    // Verify JPEG integrity
    console.log(`[REASSEMBLE] Verifying JPEG integrity...`);
    const jpegStart = mergedImage.slice(0, 3);
    const jpegEnd = mergedImage.slice(-2);

    if (jpegStart[0] === 0xFF && jpegStart[1] === 0xD8 && jpegStart[2] === 0xFF) {
      console.log(`[REASSEMBLE] ✅ Valid JPEG start marker (FF D8 FF)`);
    } else {
      console.error(`[REASSEMBLE] ❌ Invalid JPEG start marker: ${Array.from(jpegStart).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    if (jpegEnd[0] === 0xFF && jpegEnd[1] === 0xD9) {
      console.log(`[REASSEMBLE] ✅ Valid JPEG end marker (FF D9)`);
    } else {
      console.warn(`[REASSEMBLE] ⚠️  Warning: JPEG end marker may be invalid: ${Array.from(jpegEnd).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    console.log(`[REASSEMBLE] Final image size: ${totalLength} bytes (expected: ${buffer.metadata.image_size || 'unknown'})`);

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

    // Send acknowledgment to device with next wake time
    // Per BrainlyTree PDF spec: ACK_OK message format
    const nextWakeTime = await calculateNextWakeTime(buffer.imageRecord.device_id);
    const ackMessage = {
      device_id: buffer.device.device_mac, // Use MAC address for device identification
      image_name: imageName,
      ACK_OK: {
        next_wake_time: nextWakeTime, // ISO 8601 UTC timestamp
      },
    };

    client.publish(`ESP32CAM/${buffer.device.device_mac}/ack`, JSON.stringify(ackMessage));
    console.log(`[ACK] Sent ACK_OK to ${buffer.device.device_code || buffer.device.device_mac} with next wake: ${nextWakeTime}`);

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

/**
 * Calculate next wake time for device in ISO format
 * Returns full ISO 8601 timestamp (e.g., "2025-11-23T12:00:00.000Z")
 */
async function calculateNextWakeISO(deviceId) {
  try {
    const { data: device, error } = await supabase
      .from('devices')
      .select('wake_schedule_cron, site_id, next_wake_at')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error || !device) {
      console.log(`[SCHEDULE] Device ${deviceId} not found, using default 3h`);
      const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
      return fallbackTime.toISOString();
    }

    // Priority 1: Use stored next_wake_at if it exists and is in the future
    if (device.next_wake_at) {
      const nextWakeDate = new Date(device.next_wake_at);
      const now = new Date();

      if (nextWakeDate > now) {
        console.log(`[SCHEDULE] Using stored next_wake_at for device ${deviceId}: ${device.next_wake_at}`);
        return device.next_wake_at;
      } else {
        console.log(`[SCHEDULE] Stored next_wake_at is in the past, recalculating...`);
      }
    }

    // Priority 2: Calculate from cron expression if needed
    let cronExpression = device.wake_schedule_cron;

    // If no device-level schedule, get from site
    if (!cronExpression && device.site_id) {
      const { data: site } = await supabase
        .from('sites')
        .select('wake_schedule_cron')
        .eq('site_id', device.site_id)
        .maybeSingle();

      cronExpression = site?.wake_schedule_cron;
    }

    if (cronExpression) {
      const { data: nextWake, error: rpcError } = await supabase.rpc(
        'fn_calculate_next_wake_time',
        {
          p_last_wake_at: new Date().toISOString(),
          p_cron_expression: cronExpression,
          p_timezone: 'UTC'
        }
      );

      if (rpcError || !nextWake) {
        console.error(`[SCHEDULE] RPC error:`, rpcError);
        const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
        return fallbackTime.toISOString();
      }

      console.log(`[SCHEDULE] Calculated next wake for device ${deviceId}: ${nextWake}`);
      return nextWake;
    }

    // Priority 3: Fallback to default 3 hours
    const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return fallbackTime.toISOString();

  } catch (error) {
    console.error(`[SCHEDULE] Error calculating next wake:`, error);
    const fallbackTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return fallbackTime.toISOString();
  }
}

/**
 * Convert ISO 8601 timestamp to simple time format for device
 * Per BrainlyTree PDF spec: device expects "11:00PM" format in UTC
 * IMPORTANT: Device expects UTC time, NOT local time
 *
 * Examples:
 *   "2025-11-22T20:00:00.000Z" -> "8:00PM" (UTC)
 *   "2025-11-22T08:30:00.000Z" -> "8:30AM" (UTC)
 *   "2025-11-22T12:00:00.000Z" -> "12:00PM" (UTC)
 */
function formatTimeForDevice(isoTimestamp) {
  try {
    const date = new Date(isoTimestamp);

    // Use UTC methods to get UTC time (NOT local time)
    let hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12

    // ALWAYS include minutes with leading zero (protocol expects "12:00PM" not "12PM")
    const minuteStr = `:${minutes.toString().padStart(2, '0')}`;

    return `${hours}${minuteStr}${ampm}`;
  } catch (error) {
    console.error('[SCHEDULE] Error formatting time:', error);
    return '12:00PM'; // Safe fallback
  }
}

/**
 * Calculate next wake time based on device's wake schedule
 * Returns simple time string as expected by device (e.g., "11:00PM")
 * Per BrainlyTree PDF spec (page 5): device needs "next_wake": "wake_up_time"
 *
 * Priority:
 * 1. Use stored next_wake_at if it exists and is in the future
 * 2. Calculate from cron expression (device or site level)
 * 3. Fallback to default interval
 */
async function calculateNextWakeTime(deviceId) {
  try {
    // Get device's wake schedule and stored next_wake_at
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

    // Priority 1: Use stored next_wake_at if it exists and is in the future
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

    // Priority 2: Calculate from cron expression if needed
    if (!nextWakeISO) {
      let cronExpression = device.wake_schedule_cron;

      // If no device-level schedule, get from site
      if (!cronExpression && device.site_id) {
        const { data: site } = await supabase
          .from('sites')
          .select('wake_schedule_cron')
          .eq('site_id', device.site_id)
          .maybeSingle();

        cronExpression = site?.wake_schedule_cron;
      }

      // Use default if still no schedule found
      if (!cronExpression) {
        cronExpression = '0 */3 * * *'; // Every 3 hours default
      }

      // Calculate next wake using RPC function from NOW()
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

    // Convert ISO timestamp to simple time format for device
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
      console.log('[MQTT] ✅ Connected to HiveMQ Cloud');

      client.subscribe('ESP32CAM/+/data', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (ESP32CAM/data):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to ESP32CAM/+/data');
        }
      });

      client.subscribe('ESP32CAM/+/status', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (ESP32CAM/status):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to ESP32CAM/+/status');
        }
      });

      client.subscribe('device/+/status', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (device/status):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to device/+/status');
        }
      });

      client.subscribe('device/+/data', (err) => {
        if (err) {
          console.error('[MQTT] ❌ Subscription error (device/data):', err);
        } else {
          console.log('[MQTT] ✅ Subscribed to device/+/data');
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
        // Log raw message for debugging
        let messageStr = message.toString();
        console.log(`[MQTT] 📨 Raw message on ${topic} (${message.length} bytes):`, messageStr);

        // Sanitize smart quotes and other non-standard JSON characters
        // Replace Unicode smart quotes with straight quotes
        messageStr = messageStr
          .replace(/[\u201C\u201D]/g, '"')  // Replace " and " with "
          .replace(/[\u2018\u2019]/g, "'")  // Replace ' and ' with '
          .trim();

        // Try to parse JSON
        const payload = JSON.parse(messageStr);
        console.log(`[MQTT] ✅ Parsed payload:`, JSON.stringify(payload).substring(0, 200));

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
          // Only process device command acknowledgments, not our own ACK_OK messages
          // Device ACKs have command_id or specific command fields
          // Our ACK_OK messages have ACK_OK field
          if (!payload.ACK_OK && !payload.missing_chunks) {
            const deviceMac = topic.split('/')[1];
            await commandQueueProcessor.handleCommandAck(deviceMac, payload);
          }
        } else if (topic.includes('/status')) {
          // Handle status message - logic is now inside handleStatusMessage()
          await handleStatusMessage(payload, client);
        } else if (topic.includes('/data')) {
          // Check for metadata message - handle both field name variations
          const hasMetadata = (payload.total_chunks_count !== undefined || payload.total_chunk_count !== undefined)
                           && payload.chunk_id === undefined;

          if (hasMetadata) {
            await handleMetadataMessage(payload, client);
          } else if (payload.chunk_id !== undefined) {
            await handleChunkMessage(payload, client);
          }
        }
      } catch (error) {
        console.error('[MQTT] ❌ Message processing error:', error);
        console.error('[MQTT] 📋 Raw message buffer (hex):', message.toString('hex'));
        console.error('[MQTT] 📋 Raw message buffer (utf8):', message.toString('utf8'));
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
