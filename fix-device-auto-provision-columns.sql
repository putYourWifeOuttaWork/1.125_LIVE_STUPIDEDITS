/*
  # Fix Device Table Nullable Columns for Auto-Provisioning

  1. Problem
    - Devices auto-provision when they first connect via MQTT (send "alive" message)
    - At auto-provision time, devices ONLY provide: device_mac, hardware version
    - Position (x_position, y_position), zone info, and other fields are set later when admin maps device to site
    - Currently x_position, y_position have NOT NULL constraints causing auto-provision to fail

  2. Changes
    - Remove NOT NULL constraints from columns that are set during mapping, not at auto-provision
    - These columns are filled in when device is mapped to site in the application

  3. Columns Made Nullable (set during mapping)
    - x_position, y_position - Physical coordinates on site map
    - zone_id, zone_label - Environmental zone assignment
    - company_id - Set when device assigned to site (inherited from site)

  4. Columns That Stay NOT NULL (known at auto-provision)
    - device_id (PK, generated)
    - device_mac (provided by device)
    - created_at, updated_at (system generated)

  5. Reference: BrainlyTree ESP32-CAM Architecture Document
    - Device Status/Alive message contains: device_id, status="alive", pendingImg
    - Device does NOT send position, zone, or site information
    - Admin maps device to site via UI after auto-provision
*/

-- Make x_position nullable (set during mapping)
ALTER TABLE devices
ALTER COLUMN x_position DROP NOT NULL;

-- Make y_position nullable (set during mapping)
ALTER TABLE devices
ALTER COLUMN y_position DROP NOT NULL;

-- Make zone_id nullable (set during mapping)
ALTER TABLE devices
ALTER COLUMN zone_id DROP NOT NULL;

-- Make zone_label nullable (set during mapping)
ALTER TABLE devices
ALTER COLUMN zone_label DROP NOT NULL;

-- Make company_id nullable (inherited from site during mapping)
ALTER TABLE devices
ALTER COLUMN company_id DROP NOT NULL;

-- Add helpful comments
COMMENT ON COLUMN devices.x_position IS 'X coordinate on site map (meters). Set when device is mapped to site by admin.';
COMMENT ON COLUMN devices.y_position IS 'Y coordinate on site map (meters). Set when device is mapped to site by admin.';
COMMENT ON COLUMN devices.zone_id IS 'Environmental zone identifier. Set when device is mapped to site by admin.';
COMMENT ON COLUMN devices.zone_label IS 'Human-readable zone name. Set when device is mapped to site by admin.';
COMMENT ON COLUMN devices.company_id IS 'Company owning this device. Inherited from site when device is mapped.';

-- Update comment on device_mac to clarify it's the only required field at auto-provision
COMMENT ON COLUMN devices.device_mac IS 'Device MAC address (e.g., B8F862F9CFB8). Only field required at auto-provision. Must be unique.';
