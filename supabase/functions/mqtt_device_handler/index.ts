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
};

const imageBuffers = new Map<string, ImageBuffer>();

function getImageKey(deviceId: string, imageName: string): string {
  return `${deviceId}|${imageName}`;
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

  // Auto-provision if device doesn't exist
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

  // Update device last seen and activate it
  await supabase
    .from("devices")
    .update({
      last_seen_at: new Date().toISOString(),
      is_active: true,
    })
    .eq("device_id", device.device_id);

  console.log(`[STATUS] Device ${device.device_code || device.device_mac} updated (status: ${device.provisioning_status})`);

  return { device, pendingCount: payload.pendingImg || 0 };
}

async function handleMetadataMessage(payload: ImageMetadata, client: mqtt.MqttClient) {
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
    return;
  }

  if (payload.temperature !== undefined) {
    await supabase.from("device_telemetry").insert({
      device_id: device.device_id,
      captured_at: payload.capture_timestamp,
      temperature: payload.temperature,
      humidity: payload.humidity,
      pressure: payload.pressure,
      gas_resistance: payload.gas_resistance,
      battery_voltage: device.battery_voltage,
    });
  }

  imageBuffers.set(imageKey, {
    metadata: payload,
    chunks: new Map(),
    totalChunks: payload.total_chunks_count,
    imageRecord,
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
    const missingChunks: number[] = [];
    for (let i = 0; i < buffer.totalChunks; i++) {
      if (!buffer.chunks.has(i)) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      console.log(`[MISSING] Requesting ${missingChunks.length} missing chunks for ${imageName}`);
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

    imageBuffers.delete(getImageKey(deviceId, imageName));
  } catch (error) {
    console.error(`[ERROR] Failed to reassemble image:`, error);
    await supabase
      .from("device_images")
      .update({ status: "failed", error_code: 2 })
      .eq("image_id", buffer.imageRecord.image_id);
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
          if (payload.total_chunks_count !== undefined && payload.chunk_id === undefined) {
            await handleMetadataMessage(payload, client);
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
        message: "MQTT Device Handler is running",
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
