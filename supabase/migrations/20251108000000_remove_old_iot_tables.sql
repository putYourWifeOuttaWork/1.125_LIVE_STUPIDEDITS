/*
  # Remove Old IoT Device Infrastructure

  1. Purpose
    - Clean removal of previous IoT device implementation
    - Preparing for new cohesive device architecture
    - Ensures no orphaned data or conflicting schemas

  2. Tables Being Removed (in dependency order)
    - device_command_logs (depends on device_commands, devices)
    - device_commands (depends on devices)
    - device_configs (depends on devices)
    - device_errors (depends on captures, devices)
    - device_publish_log (depends on devices)
    - device_sites (depends on devices, sites)
    - device_status (depends on devices)
    - sensor_readings (depends on captures, devices)
    - captures (depends on devices, sites, pilot_programs)
    - devices (base table)

  3. Reason for Removal
    - Previous architecture had inconsistencies with planned MQTT integration
    - New architecture provides better separation of concerns
    - Improved RLS policies and audit trails
    - Better alignment with ESP32-CAM device capabilities

  4. Data Loss Warning
    - This migration will permanently delete all existing device data
    - Ensure backup is taken before applying
    - No device registrations, captures, or telemetry will be preserved

  5. Safety
    - Uses IF EXISTS to prevent errors if tables were already removed
    - Drops in correct order to respect foreign key dependencies
    - Cascading deletes handled automatically by foreign key constraints
*/

-- Drop tables in reverse dependency order

-- Drop device_command_logs (depends on device_commands and devices)
DROP TABLE IF EXISTS public.device_command_logs CASCADE;

-- Drop device_commands (depends on devices)
DROP TABLE IF EXISTS public.device_commands CASCADE;

-- Drop device_configs (depends on devices)
DROP TABLE IF EXISTS public.device_configs CASCADE;

-- Drop device_errors (depends on captures and devices)
DROP TABLE IF EXISTS public.device_errors CASCADE;

-- Drop device_publish_log (depends on devices)
DROP TABLE IF EXISTS public.device_publish_log CASCADE;

-- Drop device_sites (depends on devices and sites)
DROP TABLE IF EXISTS public.device_sites CASCADE;

-- Drop device_status (depends on devices)
DROP TABLE IF EXISTS public.device_status CASCADE;

-- Drop sensor_readings (depends on captures and devices)
DROP TABLE IF EXISTS public.sensor_readings CASCADE;

-- Drop captures (depends on devices, sites, pilot_programs)
DROP TABLE IF EXISTS public.captures CASCADE;

-- Drop devices (base table)
DROP TABLE IF EXISTS public.devices CASCADE;
