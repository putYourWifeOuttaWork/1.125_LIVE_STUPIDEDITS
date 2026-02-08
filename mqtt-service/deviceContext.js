const lineageCache = new Map();
const LINEAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function resolveDeviceLineage(supabase, normalizedMac) {
  const cached = lineageCache.get(normalizedMac);
  if (cached && (Date.now() - cached.timestamp) < LINEAGE_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase.rpc(
      'fn_resolve_device_lineage',
      { p_device_mac: normalizedMac }
    );

    if (error) {
      console.error('[Lineage] RPC error:', error);
      return null;
    }

    if (!data || data.error) {
      console.warn('[Lineage] Device lineage not found or incomplete:', data?.error || 'no data');
      return null;
    }

    lineageCache.set(normalizedMac, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error('[Lineage] Exception resolving lineage:', err);
    return null;
  }
}

export function invalidateLineageCache(normalizedMac) {
  if (normalizedMac) {
    lineageCache.delete(normalizedMac);
  } else {
    lineageCache.clear();
  }
}

export async function findActiveSession(supabase, siteId) {
  if (!siteId) return null;

  try {
    const { data } = await supabase
      .from('site_device_sessions')
      .select('session_id')
      .eq('site_id', siteId)
      .in('status', ['pending', 'in_progress'])
      .eq('session_date', new Date().toISOString().split('T')[0])
      .limit(1)
      .maybeSingle();

    return data?.session_id || null;
  } catch (err) {
    console.error('[Session] Error finding active session:', err);
    return null;
  }
}

export async function logMqttMessage(supabase, macAddress, direction, topic, payload, messageType, sessionId, wakePayloadId, imageName, chunkId) {
  try {
    await supabase.rpc('log_mqtt_message', {
      p_mac_address: macAddress,
      p_direction: direction,
      p_topic: topic,
      p_payload: typeof payload === 'object' ? payload : { raw: payload },
      p_message_type: messageType,
      p_session_id: sessionId || null,
      p_wake_payload_id: wakePayloadId || null,
      p_image_name: imageName || null,
      p_chunk_id: chunkId !== undefined ? chunkId : null,
    });
  } catch (err) {
    console.error('[MqttLog] Failed to log MQTT message:', err);
  }
}

export async function logAckToAudit(supabase, deviceMac, imageName, ackType, topic, payload, success, error) {
  try {
    await supabase.rpc('fn_log_device_ack', {
      p_device_mac: deviceMac,
      p_image_name: imageName,
      p_ack_type: ackType,
      p_mqtt_topic: topic,
      p_mqtt_payload: typeof payload === 'object' ? payload : { raw: payload },
      p_mqtt_success: success,
      p_mqtt_error: error || null,
    });
  } catch (err) {
    console.error('[AckLog] Failed to log ACK to audit:', err);
  }
}

export function celsiusToFahrenheit(celsius) {
  if (celsius === null || celsius === undefined) return null;
  if (celsius < -40 || celsius > 85) {
    console.warn(`[Temperature] Out of range Celsius value: ${celsius}C`);
  }
  const fahrenheit = (celsius * 1.8) + 32;
  return Math.round(fahrenheit * 100) / 100;
}

export function isValidMacAddress(input) {
  if (!input) return false;
  const cleaned = input.replace(/[:\-\s]/g, '');
  return /^[0-9A-Fa-f]{12}$/.test(cleaned);
}

export function normalizeMacAddress(identifier) {
  if (!identifier) return null;

  const upper = identifier.toUpperCase();

  if (upper.startsWith('TEST-') || upper.startsWith('SYSTEM:') || upper.startsWith('VIRTUAL:')) {
    return upper;
  }

  if (!isValidMacAddress(identifier)) {
    console.warn(`[MAC] Invalid device identifier format: ${identifier}`);
    return null;
  }

  return identifier.replace(/[:\-\s]/g, '').toUpperCase();
}

export function parseDeviceTimestamp(raw) {
  if (!raw || typeof raw !== 'string') {
    return { timestamp: new Date().toISOString(), source: 'server_fallback' };
  }

  let iso = raw.trim();

  if (/^\d{1,4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}$/.test(iso)) {
    iso = iso.replace(' ', 'T') + 'Z';
  }

  if (!iso.includes('T') && !iso.endsWith('Z')) {
    iso = raw;
  }

  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) {
      console.warn(`[TIMESTAMP] Invalid device timestamp: "${raw}" - using server time`);
      return { timestamp: new Date().toISOString(), source: 'server_fallback' };
    }

    const year = date.getUTCFullYear();
    if (year < 2020 || year > 2100) {
      console.warn(`[TIMESTAMP] Device timestamp year ${year} out of range: "${raw}" - using server time`);
      return { timestamp: new Date().toISOString(), source: 'server_fallback', device_raw: raw };
    }

    return { timestamp: date.toISOString(), source: 'device' };
  } catch {
    console.warn(`[TIMESTAMP] Failed to parse device timestamp: "${raw}" - using server time`);
    return { timestamp: new Date().toISOString(), source: 'server_fallback' };
  }
}

export function normalizeMetadataPayload(payload) {
  const sensorData = payload.sensor_data || {};

  const rawTimestamp = payload.timestamp || payload.capture_timestamp || payload.capture_timeStamp;
  const { timestamp: parsedTimestamp, source: timestampSource, device_raw } = parseDeviceTimestamp(rawTimestamp);

  const normalized = {
    ...payload,
    capture_timestamp: parsedTimestamp,
    timestamp_source: timestampSource,
    device_raw_timestamp: device_raw || rawTimestamp,
    max_chunk_size: payload.max_chunks_size || payload.max_chunk_size,
    total_chunks_count: payload.total_chunk_count || payload.total_chunks_count,
    temperature: sensorData.temperature ?? payload.temperature,
    humidity: sensorData.humidity ?? payload.humidity,
    pressure: sensorData.pressure ?? payload.pressure,
    gas_resistance: sensorData.gas_resistance ?? payload.gas_resistance,
    device_id: payload.device_id,
    image_name: payload.image_name,
    image_id: payload.image_id,
    image_size: payload.image_size,
    location: payload.location,
    error: payload.error,
  };

  console.log(`[NORMALIZE] Sensor data: temp=${normalized.temperature}, humidity=${normalized.humidity}, pressure=${normalized.pressure}, gas=${normalized.gas_resistance}`);
  console.log(`[NORMALIZE] Timestamp: "${rawTimestamp}" -> "${parsedTimestamp}" (source: ${timestampSource})`);

  return normalized;
}

export function formatTimeForDevice(isoTimestamp) {
  try {
    const date = new Date(isoTimestamp);
    let hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minuteStr = `:${minutes.toString().padStart(2, '0')}`;
    return `${hours}${minuteStr}${ampm}`;
  } catch (error) {
    console.error('[SCHEDULE] Error formatting time:', error);
    return '12:00PM';
  }
}

export function getImageKey(deviceId, imageName) {
  return `${deviceId}|${imageName}`;
}

export async function generateDeviceCode(supabase, hardwareVersion = 'ESP32-S3') {
  const hwNormalized = hardwareVersion.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const prefix = `DEVICE-${hwNormalized}-`;

  const { data: existingDevices } = await supabase
    .from('devices')
    .select('device_code')
    .like('device_code', `${prefix}%`)
    .order('device_code');

  const numbers = [];
  existingDevices?.forEach((d) => {
    if (d.device_code) {
      const match = d.device_code.match(new RegExp(`${prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)`));
      if (match) {
        numbers.push(parseInt(match[1]));
      }
    }
  });

  let nextNum = 1;
  while (numbers.includes(nextNum)) {
    nextNum++;
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}
