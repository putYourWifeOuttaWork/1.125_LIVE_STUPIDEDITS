/*
  # Add colony_count fields to get_session_devices_with_wakes RPC

  1. Changes
    - Add `colony_count` and `colony_count_velocity` to the image JSON
      returned by `get_session_devices_with_wakes`
    - Add `mgi_original_score` and `mgi_qa_status` for QA display in lightbox

  2. Important Notes
    - Uses CREATE OR REPLACE so existing function signature is preserved
    - Only the image subquery SELECT and jsonb_build_object are modified
*/

CREATE OR REPLACE FUNCTION public.get_session_devices_with_wakes(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_session_record RECORD;
v_device_record RECORD;
v_device_array JSONB := '[]'::jsonb;
BEGIN
IF auth.uid() IS NULL THEN
RAISE EXCEPTION 'Not authenticated';
END IF;

SELECT
sds.session_id,
sds.site_id,
sds.session_date,
sds.session_start_time,
sds.session_end_time,
sds.company_id
INTO v_session_record
FROM site_device_sessions sds
WHERE sds.session_id = p_session_id;

IF v_session_record.session_id IS NULL THEN
RAISE EXCEPTION 'Session not found';
END IF;

IF NOT EXISTS (
SELECT 1 FROM users u
WHERE u.id = auth.uid()
AND (u.company_id = v_session_record.company_id OR u.is_super_admin = TRUE)
) THEN
RAISE EXCEPTION 'Access denied';
END IF;

FOR v_device_record IN
SELECT
d.device_id,
d.device_code,
d.device_name,
d.hardware_version,
d.firmware_version,
d.wake_schedule_cron,
d.battery_voltage,
d.battery_health_percent,
d.wifi_ssid,
d.last_seen_at,
d.last_wake_at,
d.next_wake_at,
d.is_active,
d.x_position,
d.y_position,
dsa.assigned_at,
dsa.is_primary,

fn_calculate_device_expected_wakes(
d.wake_schedule_cron,
dsa.assigned_at,
v_session_record.session_start_time,
v_session_record.session_end_time
) as expected_wakes_in_session,

(
SELECT COUNT(*)::INT
FROM device_wake_payloads dwp
WHERE dwp.device_id = d.device_id
AND dwp.site_device_session_id = p_session_id
) as actual_wakes,

(
SELECT COUNT(*)::INT
FROM device_wake_payloads dwp
WHERE dwp.device_id = d.device_id
AND dwp.site_device_session_id = p_session_id
AND dwp.payload_status = 'complete'
AND dwp.overage_flag = FALSE
) as completed_wakes,

(
SELECT COUNT(*)::INT
FROM device_wake_payloads dwp
WHERE dwp.device_id = d.device_id
AND dwp.site_device_session_id = p_session_id
AND dwp.payload_status = 'failed'
) as failed_wakes,

(
SELECT COUNT(*)::INT
FROM device_wake_payloads dwp
WHERE dwp.device_id = d.device_id
AND dwp.site_device_session_id = p_session_id
AND dwp.overage_flag = TRUE
) as extra_wakes,

(
SELECT MAX(dwp.captured_at)
FROM device_wake_payloads dwp
WHERE dwp.device_id = d.device_id
AND dwp.site_device_session_id = p_session_id
) as last_session_wake_at,

(
SELECT COALESCE(jsonb_agg(
jsonb_build_object(
'payload_id', dwp.payload_id,
'wake_window_index', dwp.wake_window_index,
'captured_at', dwp.captured_at,
'payload_status', dwp.payload_status,
'temperature', dwp.temperature,
'humidity', dwp.humidity,
'battery_voltage', dwp.battery_voltage,
'wifi_rssi', dwp.wifi_rssi,
'image_id', dwp.image_id,
'overage_flag', dwp.overage_flag,
'resent_received_at', dwp.resent_received_at
) ORDER BY dwp.captured_at
), '[]'::jsonb)
FROM device_wake_payloads dwp
WHERE dwp.device_id = d.device_id
AND dwp.site_device_session_id = p_session_id
) as wake_payloads,

(
SELECT COALESCE(jsonb_agg(
jsonb_build_object(
'image_id', image_data.image_id,
'image_name', image_data.image_name,
'captured_at', image_data.captured_at,
'image_url', image_data.image_url,
'image_status', image_data.status,
'wake_window_index', image_data.wake_window_index,
'wake_number', image_data.wake_window_index,
'mgi_score', image_data.mgi_score,
'mgi_original_score', image_data.mgi_original_score,
'mgi_qa_status', image_data.mgi_qa_status,
'mgi_velocity', image_data.mgi_velocity,
'mgi_speed', image_data.mgi_speed,
'colony_count', image_data.colony_count,
'colony_count_velocity', image_data.colony_count_velocity,
'temperature', image_data.temperature,
'humidity', image_data.humidity,
'battery_voltage', image_data.battery_voltage,
'wifi_rssi', image_data.wifi_rssi
) ORDER BY image_data.captured_at
), '[]'::jsonb)
FROM (
SELECT DISTINCT ON (di.image_id)
di.image_id,
di.image_name,
di.captured_at,
di.image_url,
di.status,
dwp.wake_window_index,
di.mgi_score,
di.mgi_original_score,
di.mgi_qa_status,
di.mgi_velocity,
di.mgi_speed,
di.colony_count,
di.colony_count_velocity,
di.temperature,
di.humidity,
dwp.battery_voltage,
dwp.wifi_rssi
FROM device_images di
LEFT JOIN device_wake_payloads dwp ON di.wake_payload_id = dwp.payload_id
WHERE di.device_id = d.device_id
AND di.site_device_session_id = p_session_id
ORDER BY di.image_id, di.captured_at DESC
) as image_data
) as images

FROM devices d
JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
WHERE dsa.site_id = v_session_record.site_id
AND dsa.assigned_at <= v_session_record.session_end_time
AND (dsa.unassigned_at IS NULL OR dsa.unassigned_at >= v_session_record.session_start_time)
ORDER BY dsa.is_primary DESC NULLS LAST, d.device_code

LOOP
v_device_array := v_device_array || jsonb_build_object(
'device_id', v_device_record.device_id,
'device_code', v_device_record.device_code,
'device_name', v_device_record.device_name,
'hardware_version', v_device_record.hardware_version,
'firmware_version', v_device_record.firmware_version,
'wake_schedule_cron', v_device_record.wake_schedule_cron,
'battery_voltage', v_device_record.battery_voltage,
'battery_health_percent', v_device_record.battery_health_percent,
'wifi_ssid', v_device_record.wifi_ssid,
'is_active', v_device_record.is_active,
'last_seen_at', v_device_record.last_seen_at,
'last_wake_at', v_device_record.last_wake_at,
'next_wake_at', v_device_record.next_wake_at,
'last_session_wake_at', v_device_record.last_session_wake_at,
'missed_wakes_in_session', fn_calculate_missed_wakes(
v_device_record.wake_schedule_cron,
COALESCE(v_device_record.last_session_wake_at, v_session_record.session_start_time)
),
'missed_wakes_global', fn_calculate_missed_wakes(
v_device_record.wake_schedule_cron,
v_device_record.last_wake_at
),
'assigned_at', v_device_record.assigned_at,
'is_primary', v_device_record.is_primary,
'expected_wakes_in_session', v_device_record.expected_wakes_in_session,
'actual_wakes', v_device_record.actual_wakes,
'completed_wakes', v_device_record.completed_wakes,
'failed_wakes', v_device_record.failed_wakes,
'extra_wakes', v_device_record.extra_wakes,
'wake_payloads', v_device_record.wake_payloads,
'images', v_device_record.images,
'added_mid_session', CASE
WHEN v_device_record.assigned_at > v_session_record.session_start_time THEN TRUE
ELSE FALSE
END
);
END LOOP;

RETURN jsonb_build_object('devices', v_device_array);
END;
$function$;
