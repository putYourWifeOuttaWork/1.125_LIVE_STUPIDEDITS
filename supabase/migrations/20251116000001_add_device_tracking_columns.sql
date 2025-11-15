/*
  # Add Device Tracking Columns

  1. Purpose
    - Add missing columns for comprehensive device tracking
    - Enable WiFi signal monitoring
    - Track who made changes (user vs system)
    - Set battery alert thresholds

  2. New Columns
    - `wifi_rssi` - WiFi signal strength from device messages
    - `last_updated_by_user_id` - Audit trail for changes
    - `battery_critical_threshold` - Critical battery voltage (default: 3.4V)
    - `battery_warning_threshold` - Warning battery voltage (default: 3.6V)

  3. Indexes
    - mqtt_client_id for MQTT lookups
    - next_wake_at for monitoring/alerts
    - battery_voltage for low battery alerts

  4. Security
    - All columns follow existing RLS policies
    - System user will be created in separate migration
*/

-- ==========================================
-- ADD MISSING COLUMNS
-- ==========================================

-- WiFi signal strength tracking
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS wifi_rssi integer;

-- Audit trail for user changes
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS last_updated_by_user_id UUID REFERENCES auth.users(id);

-- Battery alert thresholds
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS battery_critical_threshold numeric DEFAULT 3.4;

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS battery_warning_threshold numeric DEFAULT 3.6;

-- ==========================================
-- ADD INDEXES FOR PERFORMANCE
-- ==========================================

-- Index for MQTT client ID lookups (edge function uses this)
CREATE INDEX IF NOT EXISTS idx_devices_mqtt_client_id
ON devices(mqtt_client_id)
WHERE mqtt_client_id IS NOT NULL;

-- Index for next wake time queries (monitoring/alerts)
CREATE INDEX IF NOT EXISTS idx_devices_next_wake_at
ON devices(next_wake_at)
WHERE is_active = TRUE AND next_wake_at IS NOT NULL;

-- Index for battery voltage monitoring (low battery alerts)
CREATE INDEX IF NOT EXISTS idx_devices_battery_voltage
ON devices(battery_voltage)
WHERE is_active = TRUE AND battery_voltage IS NOT NULL;

-- Index for device MAC lookups (primary MQTT routing identifier)
CREATE INDEX IF NOT EXISTS idx_devices_device_mac
ON devices(device_mac)
WHERE device_mac IS NOT NULL;

-- ==========================================
-- ADD COLUMN COMMENTS
-- ==========================================

COMMENT ON COLUMN devices.wifi_rssi IS
'Last known WiFi RSSI (signal strength in dBm) from most recent device message. Negative values: -30 (excellent) to -90 (poor).';

COMMENT ON COLUMN devices.mqtt_client_id IS
'Device firmware-reported ID (e.g., TESTC3, esp32-cam-01). Used in MQTT topic routing. Immutable from device perspective.';

COMMENT ON COLUMN devices.device_name IS
'User-editable friendly label for device (e.g., "Kitchen Camera", "test6"). Displayed in UI, editable by users.';

COMMENT ON COLUMN devices.device_mac IS
'Hardware MAC address (e.g., ZZ:C7:B4:99:99:99). Primary MQTT routing identifier. UNIQUE, immutable.';

COMMENT ON COLUMN devices.battery_voltage IS
'Last reported battery voltage in volts from device (e.g., 3.7V, 4.2V). Updated from HELLO, metadata, and telemetry messages.';

COMMENT ON COLUMN devices.battery_health_percent IS
'Auto-calculated health percentage (0-100) based on voltage range 3.0V-4.2V. Calculated by trigger on battery_voltage update.';

COMMENT ON COLUMN devices.next_wake_at IS
'Expected next wake time calculated as: last_actual_wake_time + cron_interval.
Recalculated ONLY when device actually wakes, not when schedule command is sent.
Uses site timezone for calculation.';

COMMENT ON COLUMN devices.last_updated_by_user_id IS
'User who last modified device settings.
- NULL for legacy data or unknown
- System user UUID (00000000-0000-0000-0000-000000000001) for automated updates
- Actual user UUID for user-initiated changes';

COMMENT ON COLUMN devices.battery_critical_threshold IS
'Battery voltage threshold for critical alerts (default: 3.4V). Device should be charged immediately.';

COMMENT ON COLUMN devices.battery_warning_threshold IS
'Battery voltage threshold for warning alerts (default: 3.6V). Device battery is getting low.';

-- ==========================================
-- UPDATE EXISTING COLUMNS WITH BETTER DEFAULTS
-- ==========================================

-- Ensure battery thresholds are set on existing devices
UPDATE devices
SET
  battery_critical_threshold = 3.4,
  battery_warning_threshold = 3.6
WHERE battery_critical_threshold IS NULL
   OR battery_warning_threshold IS NULL;
