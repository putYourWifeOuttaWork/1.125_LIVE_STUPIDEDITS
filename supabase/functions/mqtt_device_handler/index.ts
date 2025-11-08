import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import * as mqtt from "npm:mqtt@5.3.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MQTT_HOST = "1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud";
const MQTT_PORT = 8883;
const MQTT_USERNAME = "BrainlyTesting";
const MQTT_PASSWORD = "BrainlyTest@1234";

interface DeviceStatusMessage {
  device_id: string;
  status: "alive";
  pendingImg?: number;
}

interface CaptureImageCommand {
  device_id: string;
  capture_image?: boolean;
}

interface SendImageCommand {
  device_id: string;
  send_image: string;
}

interface NextWakeCommand {
  device_id: string;
  next_wake: string;
}

interface ImageMetadata {
  device_id: string;
  capture_timestamp: string;
  image_name: string;
  image_size: number;
  max_chunk_size: number;
  total_chunks_count: number;
  location?: string;
  error: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
}

interface ImageChunk {
  device_id: string;
  image_name: string;
  chunk_id: number;
  max_chunk_size: number;
  payload: number[];
}

interface MissingChunksRequest {
  device_id: string;
  image_name: string;
  missing_chunks: number[];
}

interface AckMessage {
  device_id: string;
  image_name: string;
  ACK_OK?: {
    next_wake_time: string;
  };
}

type ImageBuffer = {
  metadata: ImageMetadata | null;
  chunks: Map<number, Uint8Array>;
  totalChunks: number;
  imageRecord: any;
  sessionId?: string;
};

const imageBuffers = new Map<string, ImageBuffer>();

function getImageKey(deviceId: string, imageName: string): string {
  return `${deviceId}|${imageName}`;
}

async function logDeviceHistoryEvent(
  deviceId: string,
  eventCategory: string,
  eventType: string,
  severity: string = 'info',
  description: string | null = null,
  eventData: any = {},
  sessionId: string | null = null
) {
  try {
    const { error } = await supabase.rpc('add_device_history_event', {
      p_device_id: deviceId,
      p_event_category: eventCategory,
      p_event_type: eventType,
      p_severity: severity,
      p_description: description,
      p_event_data: eventData,
      p_session_id: sessionId,
      p_user_id: null
    });

    if (error) {
      console.error('[HISTORY ERROR]', error);
    }
  } catch (err) {
    console.error('[HISTORY EXCEPTION]', err);
  }
}

async function createWakeSession(deviceId: string, device: any) {
  try {
    const { data: session, error } = await supabase
      .from('device_wake_sessions')
      .insert({
        device_id: device.device_id,
        site_id: device.site_id,
        program_id: device.program_id,
        wake_timestamp: new Date().toISOString(),
        connection_success: true,
        mqtt_connected: true,
        status: 'in_progress'
      })
      .select()
      .single();

    if (error) {
      console.error('[SESSION ERROR] Failed to create wake session:', error);
      return null;
    }

    console.log(`[SESSION] Created wake session ${session.session_id} for device ${device.device_code || device.device_mac}`);

    await logDeviceHistoryEvent(
      device.device_id,
      'WakeSession',
      'device_wake_start',
      'info',
      `Device ${device.device_code || device.device_mac} woke up and connected`,
      { connection_type: 'mqtt', wifi_connected: true },
      session.session_id
    );

    return session;
  } catch (err) {
    console.error('[SESSION EXCEPTION]', err);
    return null;
  }
}

async function updateWakeSession(sessionId: string, updates: any) {
  try {
    const { error } = await supabase
      .from('device_wake_sessions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

    if (error) {
      console.error('[SESSION ERROR] Failed to update wake session:', error);
    }
  } catch (err) {
    console.error('[SESSION EXCEPTION]', err);
  }
}

async function completeWakeSession(sessionId: string, status: string, errorCodes: string[] = []) {
  try {
    const { data: session } = await supabase
      .from('device_wake_sessions')
      .select('wake_timestamp, device_id')
      .eq('session_id', sessionId)
      .single();

    if (session) {
      const durationMs = new Date().getTime() - new Date(session.wake_timestamp).getTime();

      await supabase
        .from('device_wake_sessions')
        .update({
          status,
          error_codes: errorCodes,
          session_duration_ms: durationMs,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      console.log(`[SESSION] Completed session ${sessionId} with status ${status} (${durationMs}ms)`);
    }
  } catch (err) {
    console.error('[SESSION EXCEPTION]', err);
  }
}

async function updateDeviceBatteryFromTelemetry(deviceId: string, telemetryData: any) {
  try {
    if (!telemetryData.battery_voltage && !telemetryData.battery_health_percent) {
      return;
    }

    const { data: device } = await supabase
      .from('devices')
      .select('battery_voltage, battery_health_percent')
      .eq('device_id', deviceId)
      .single();

    const updates: any = {};
    let batteryChanged = false;

    if (telemetryData.battery_voltage && device?.battery_voltage !== telemetryData.battery_voltage) {
      updates.battery_voltage = telemetryData.battery_voltage;
      batteryChanged = true;
    }

    if (telemetryData.battery_health_percent && device?.battery_health_percent !== telemetryData.battery_health_percent) {
      updates.battery_health_percent = telemetryData.battery_health_percent;
      batteryChanged = true;
    }

    if (batteryChanged) {
      await supabase
        .from('devices')
        .update(updates)
        .eq('device_id', deviceId);

      console.log(`[BATTERY] Updated battery for device ${deviceId}`);
    }
  } catch (err) {
    console.error('[BATTERY EXCEPTION]', err);
  }
}

async function generateDeviceCode(hardwareVersion: string = "ESP32-S3"): Promise<string> {
  const prefix = hardwareVersion.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const { count } = await supabase
    .from("devices")
    .select("device_id", { count: "exact", head: true })
    .ilike("device_code", `DEVICE-${prefix}-%`);
  const sequence = String((count || 0) + 1).padStart(3, "0");
  return `DEVICE-${prefix}-${sequence}`;
}

async function autoProvisionDevice(deviceMac: string) {
  console.log(`[AUTO-PROVISION] Attempting to provision new device: ${deviceMac}`);

  try {
    const deviceCode = await generateDeviceCode("ESP32-S3");

    const { data: newDevice, error: insertError } = await supabase
      .from("devices")
      .insert({
        device_mac: deviceMac,
        device_code: deviceCode,
        device_name: null,
        hardware_version: "ESP32-S3",
        provisioning_status: "pending_mapping",
        provisioned_at: new Date().toISOString(),
        is_active: false,
        notes: "Auto-provisioned via MQTT connection",
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[ERROR] Failed to auto-provision device:`, insertError);
      return null;
    }

    console.log(`[SUCCESS] Auto-provisioned device ${deviceMac} with code ${deviceCode} and ID ${newDevice.device_id}`);

    await logDeviceHistoryEvent(
      newDevice.device_id,
      'ProvisioningStep',
      'device_auto_provisioned',
      'info',
      `Device ${deviceMac} auto-provisioned with code ${deviceCode}`,
      { device_mac: deviceMac, device_code: deviceCode, provisioning_method: 'mqtt_auto' }
    );

    return newDevice;
  } catch (error) {
    console.error(`[ERROR] Auto-provision exception:`, error);
    return null;
  }
}

async function handleStatusMessage(payload: DeviceStatusMessage) {
  console.log(`[STATUS] Device ${payload.device_id} is alive, pending images: ${payload.pendingImg || 0}`);

  let { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("*")
    .eq("device_mac", payload.device_id)
    .maybeSingle();

  if (!device && !deviceError) {
    console.log(`[AUTO-PROVISION] Device ${payload.device_id} not found, attempting auto-provision...`);
    device = await autoProvisionDevice(payload.device_id);

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
    .from("devices")
    .update({
      last_seen_at: new Date().toISOString(),
      is_active: true,
    })
    .eq("device_id", device.device_id);

  const session = await createWakeSession(payload.device_id, device);

  if (session && payload.pendingImg && payload.pendingImg > 0) {
    await updateWakeSession(session.session_id, {
      pending_images_count: payload.pendingImg
    });
  }

  console.log(`[STATUS] Device ${device.device_code || device.device_mac} updated (status: ${device.provisioning_status})`);

  return { device, pendingCount: payload.pendingImg || 0, session };
}

async function handleMetadataMessage(payload: ImageMetadata, client: mqtt.MqttClient, sessionId?: string) {
  console.log(`[METADATA] Received for image ${payload.image_name} from ${payload.device_id}`);

  const { data: device } = await supabase
    .from("devices")
    .select("*")
    .eq("device_mac", payload.device_id)
    .maybeSingle();

  if (!device) {
    console.error(`[ERROR] Device ${payload.device_id} not found`);
    return;
  }

  const imageKey = getImageKey(payload.device_id, payload.image_name);

  const { data: imageRecord, error: imageError } = await supabase
    .from("device_images")
    .insert({
      device_id: device.device_id,
      image_name: payload.image_name,
      image_size: payload.image_size,
      captured_at: payload.capture_timestamp,
      total_chunks: payload.total_chunks_count,
      received_chunks: 0,
      status: "receiving",
      error_code: payload.error,
      metadata: {
        location: payload.location,
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        gas_resistance: payload.gas_resistance,
      },
    })
    .select()
    .single();

  if (imageError) {
    console.error(`[ERROR] Failed to create image record:`, imageError);
    await logDeviceHistoryEvent(
      device.device_id,
      'ErrorEvent',
      'image_metadata_error',
      'error',
      `Failed to create image record for ${payload.image_name}`,
      { error: imageError.message, image_name: payload.image_name },
      sessionId
    );
    return;
  }

  if (sessionId) {
    await updateWakeSession(sessionId, {
      image_captured: true,
      image_id: imageRecord.image_id,
      chunks_total: payload.total_chunks_count
    });
  }

  await logDeviceHistoryEvent(
    device.device_id,
    'ImageCapture',
    'image_capture_initiated',
    'info',
    `Image ${payload.image_name} capture started (${payload.total_chunks_count} chunks)`,
    {
      image_name: payload.image_name,
      image_size: payload.image_size,
      total_chunks: payload.total_chunks_count,
      error_code: payload.error
    },
    sessionId
  );

  if (payload.temperature !== undefined || payload.humidity !== undefined) {
    await supabase.from("device_telemetry").insert({
      device_id: device.device_id,
      captured_at: payload.capture_timestamp,
      temperature: payload.temperature,
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      battery_voltage: device.battery_voltage,
    });

    await logDeviceHistoryEvent(
      device.device_id,
      'EnvironmentalReading',
      'telemetry_recorded',
      'info',
      `Environmental data recorded: ${payload.temperature}°F, ${payload.humidity}% humidity`,
      {
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        gas_resistance: payload.gas_resistance
      },
      sessionId
    );

    const telemetryWithBattery = {
      temperature: payload.temperature,
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      battery_voltage: device.battery_voltage,
      battery_health_percent: device.battery_health_percent
    };

    if (sessionId) {
      await updateWakeSession(sessionId, {
        telemetry_data: telemetryWithBattery
      });
    }

    await updateDeviceBatteryFromTelemetry(device.device_id, telemetryWithBattery);
  }

  imageBuffers.set(imageKey, {
    metadata: payload,
    chunks: new Map(),
    totalChunks: payload.total_chunks_count,
    imageRecord,
    sessionId
  });

  console.log(`[METADATA] Ready to receive ${payload.total_chunks_count} chunks for ${payload.image_name}`);
}

async function handleChunkMessage(payload: ImageChunk, client: mqtt.MqttClient) {
  const imageKey = getImageKey(payload.device_id, payload.image_name);
  const buffer = imageBuffers.get(imageKey);

  if (!buffer) {
    console.error(`[ERROR] No metadata found for ${payload.image_name}`);
    return;
  }

  const chunkBytes = new Uint8Array(payload.payload);
  buffer.chunks.set(payload.chunk_id, chunkBytes);

  const receivedCount = buffer.chunks.size;
  console.log(`[CHUNK] Received chunk ${payload.chunk_id + 1}/${buffer.totalChunks} for ${payload.image_name} (${receivedCount} total)`);

  await supabase
    .from("device_images")
    .update({ received_chunks: receivedCount })
    .eq("image_id", buffer.imageRecord.image_id);

  if (buffer.sessionId) {
    await updateWakeSession(buffer.sessionId, {
      chunks_sent: receivedCount,
      chunks_total: buffer.totalChunks
    });
  }

  if (receivedCount % 5 === 0 || receivedCount === buffer.totalChunks) {
    const { data: device } = await supabase
      .from("devices")
      .select("device_id")
      .eq("device_mac", payload.device_id)
      .single();

    if (device) {
      await logDeviceHistoryEvent(
        device.device_id,
        'ChunkTransmission',
        'chunks_received',
        'info',
        `Received ${receivedCount}/${buffer.totalChunks} chunks for ${payload.image_name}`,
        {
          image_name: payload.image_name,
          chunks_received: receivedCount,
          chunks_total: buffer.totalChunks,
          progress_percent: Math.round((receivedCount / buffer.totalChunks) * 100)
        },
        buffer.sessionId
      );
    }
  }

  if (receivedCount === buffer.totalChunks) {
    console.log(`[COMPLETE] All chunks received for ${payload.image_name}`);
    await reassembleAndUploadImage(payload.device_id, payload.image_name, buffer, client);
  }
}

async function reassembleAndUploadImage(
  deviceId: string,
  imageName: string,
  buffer: ImageBuffer,
  client: mqtt.MqttClient
) {
  try {
    const { data: device } = await supabase
      .from("devices")
      .select("device_id")
      .eq("device_mac", deviceId)
      .single();

    if (!device) {
      console.error(`[ERROR] Device not found for MAC ${deviceId}`);
      return;
    }

    const missingChunks: number[] = [];
    for (let i = 0; i < buffer.totalChunks; i++) {
      if (!buffer.chunks.has(i)) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      console.log(`[MISSING] Requesting ${missingChunks.length} missing chunks for ${imageName}`);

      if (buffer.sessionId) {
        await updateWakeSession(buffer.sessionId, {
          chunks_missing: missingChunks
        });
      }

      await logDeviceHistoryEvent(
        device.device_id,
        'ChunkTransmission',
        'missing_chunks_requested',
        'warning',
        `Requesting ${missingChunks.length} missing chunks for ${imageName}`,
        {
          image_name: imageName,
          missing_chunks: missingChunks,
          missing_count: missingChunks.length
        },
        buffer.sessionId
      );

      const missingRequest: MissingChunksRequest = {
        device_id: deviceId,
        image_name: imageName,
        missing_chunks: missingChunks,
      };
      client.publish(`device/${deviceId}/ack`, JSON.stringify(missingRequest));
      return;
    }

    const sortedChunks: Uint8Array[] = [];
    for (let i = 0; i < buffer.totalChunks; i++) {
      const chunk = buffer.chunks.get(i);
      if (chunk) {
        sortedChunks.push(chunk);
      }
    }

    const totalLength = sortedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const mergedImage = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of sortedChunks) {
      mergedImage.set(chunk, offset);
      offset += chunk.length;
    }

    const timestamp = Date.now();
    const fileName = `device_${deviceId}_${timestamp}_${imageName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("petri-images")
      .upload(fileName, mergedImage, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error(`[ERROR] Failed to upload image:`, uploadError);
      await supabase
        .from("device_images")
        .update({ status: "failed", error_code: 1 })
        .eq("image_id", buffer.imageRecord.image_id);

      await logDeviceHistoryEvent(
        device.device_id,
        'ErrorEvent',
        'image_upload_failed',
        'error',
        `Failed to upload image ${imageName}`,
        { error: uploadError.message, image_name: imageName },
        buffer.sessionId
      );

      if (buffer.sessionId) {
        await completeWakeSession(buffer.sessionId, 'failed', ['image_upload_error']);
      }
      return;
    }

    const { data: urlData } = supabase.storage
      .from("petri-images")
      .getPublicUrl(fileName);

    await supabase
      .from("device_images")
      .update({
        status: "complete",
        image_url: urlData.publicUrl,
        received_at: new Date().toISOString(),
      })
      .eq("image_id", buffer.imageRecord.image_id);

    console.log(`[SUCCESS] Image uploaded: ${fileName}`);

    await logDeviceHistoryEvent(
      device.device_id,
      'ImageCapture',
      'image_upload_success',
      'info',
      `Image ${imageName} uploaded successfully`,
      {
        image_name: imageName,
        file_name: fileName,
        image_url: urlData.publicUrl,
        file_size: totalLength
      },
      buffer.sessionId
    );

    if (buffer.sessionId) {
      await updateWakeSession(buffer.sessionId, {
        transmission_complete: true
      });
    }

    await createSubmissionAndObservation(buffer, urlData.publicUrl);

    const nextWakeTime = calculateNextWakeTime();
    const ackMessage: AckMessage = {
      device_id: deviceId,
      image_name: imageName,
      ACK_OK: {
        next_wake_time: nextWakeTime,
      },
    };

    client.publish(`device/${deviceId}/ack`, JSON.stringify(ackMessage));
    console.log(`[ACK] Sent ACK_OK with next wake: ${nextWakeTime}`);

    if (buffer.sessionId) {
      await updateWakeSession(buffer.sessionId, {
        next_wake_scheduled: nextWakeTime
      });
      await completeWakeSession(buffer.sessionId, 'success');
    }

    imageBuffers.delete(getImageKey(deviceId, imageName));
  } catch (error) {
    console.error(`[ERROR] Failed to reassemble image:`, error);

    const { data: device } = await supabase
      .from("devices")
      .select("device_id")
      .eq("device_mac", deviceId)
      .single();

    if (device) {
      await supabase
        .from("device_images")
        .update({ status: "failed", error_code: 2 })
        .eq("image_id", buffer.imageRecord.image_id);

      await logDeviceHistoryEvent(
        device.device_id,
        'ErrorEvent',
        'image_assembly_failed',
        'error',
        `Failed to reassemble image ${imageName}`,
        { error: error instanceof Error ? error.message : 'Unknown error', image_name: imageName },
        buffer.sessionId
      );

      if (buffer.sessionId) {
        await completeWakeSession(buffer.sessionId, 'failed', ['image_assembly_error']);
      }
    }
  }
}

async function createSubmissionAndObservation(buffer: ImageBuffer, imageUrl: string) {
  try {
    const { data: device } = await supabase
      .from("devices")
      .select("device_id, site_id, program_id")
      .eq("device_id", buffer.imageRecord.device_id)
      .single();

    if (!device || !device.site_id) {
      console.error(`[ERROR] Device not associated with a site`);
      return;
    }

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({
        site_id: device.site_id,
        program_id: device.program_id,
        created_by_device_id: device.device_id,
        is_device_generated: true,
        submission_date: buffer.metadata?.capture_timestamp || new Date().toISOString(),
      })
      .select()
      .single();

    if (submissionError) {
      console.error(`[ERROR] Failed to create submission:`, submissionError);
      return;
    }

    const { data: observation, error: observationError } = await supabase
      .from("petri_observations")
      .insert({
        submission_id: submission.submission_id,
        observation_date: buffer.metadata?.capture_timestamp || new Date().toISOString(),
        image_url: imageUrl,
        is_device_generated: true,
        device_capture_metadata: buffer.metadata,
      })
      .select()
      .single();

    if (observationError) {
      console.error(`[ERROR] Failed to create observation:`, observationError);
      return;
    }

    await supabase
      .from("device_images")
      .update({
        submission_id: submission.submission_id,
        observation_id: observation.observation_id,
        observation_type: "petri",
      })
      .eq("image_id", buffer.imageRecord.image_id);

    console.log(`[SUCCESS] Created submission ${submission.submission_id} and observation ${observation.observation_id}`);
  } catch (error) {
    console.error(`[ERROR] Failed to create submission/observation:`, error);
  }
}

function calculateNextWakeTime(): string {
  const now = new Date();
  now.setHours(now.getHours() + 12);
  return now.toISOString();
}

function connectToMQTT(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      protocol: "mqtts",
      rejectUnauthorized: false,
    });

    client.on("connect", () => {
      console.log("[MQTT] Connected to HiveMQ Cloud");

      client.subscribe("ESP32CAM/+/data", (err) => {
        if (err) {
          console.error("[MQTT] Subscription error:", err);
        } else {
          console.log("[MQTT] Subscribed to ESP32CAM/+/data");
        }
      });

      client.subscribe("device/+/status", (err) => {
        if (err) {
          console.error("[MQTT] Subscription error:", err);
        } else {
          console.log("[MQTT] Subscribed to device/+/status");
        }
      });

      resolve(client);
    });

    client.on("error", (error) => {
      console.error("[MQTT] Connection error:", error);
      reject(error);
    });

    client.on("message", async (topic: string, message: Buffer) => {
      try {
        const payload = JSON.parse(message.toString());
        console.log(`[MQTT] Message on ${topic}:`, JSON.stringify(payload).substring(0, 200));

        if (topic.includes("/status")) {
          const result = await handleStatusMessage(payload);
          if (result && result.pendingCount > 0) {
            const captureCmd: CaptureImageCommand = {
              device_id: payload.device_id,
              capture_image: true,
            };
            client.publish(`device/${payload.device_id}/cmd`, JSON.stringify(captureCmd));
          }
        } else if (topic.includes("/data")) {
          const deviceMac = topic.split('/')[1];
          const { data: device } = await supabase
            .from("devices")
            .select("device_id, session_id")
            .eq("device_mac", deviceMac)
            .maybeSingle();

          const currentSession = await supabase
            .from('device_wake_sessions')
            .select('session_id')
            .eq('device_id', device?.device_id)
            .eq('status', 'in_progress')
            .order('wake_timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

          const sessionId = currentSession?.data?.session_id;

          if (payload.total_chunks_count !== undefined && payload.chunk_id === undefined) {
            await handleMetadataMessage(payload, client, sessionId);
          } else if (payload.chunk_id !== undefined) {
            await handleChunkMessage(payload, client);
          }
        }
      } catch (error) {
        console.error("[MQTT] Message processing error:", error);
      }
    });
  });
}

let mqttClient: mqtt.MqttClient | null = null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (!mqttClient) {
      console.log("[INIT] Initializing MQTT connection...");
      mqttClient = await connectToMQTT();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "MQTT Device Handler is running with device history logging",
        connected: mqttClient?.connected || false,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[ERROR] Handler error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
