#!/usr/bin/env node

/**
 * Add is_active field to get_session_devices_with_wakes RPC function
 * This script updates the database function to return is_active status
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sql = `
/*
  # Add is_active Field to Device Session View

  1. Changes
    - Add is_active field to get_session_devices_with_wakes function return
    - This allows frontend to properly display device active/inactive status
*/

-- Drop and recreate with is_active field
DROP FUNCTION IF EXISTS get_session_devices_with_wakes(UUID);

CREATE OR REPLACE FUNCTION get_session_devices_with_wakes(p_session_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_record RECORD;
  v_devices_json JSONB;
  v_device_record RECORD;
  v_device_array JSONB := '[]'::jsonb;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get session details
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

  -- Check user has access to this company
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND (u.company_id = v_session_record.company_id OR u.is_super_admin = TRUE)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get all devices that were assigned to this site on this session date
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
      d.x_position,
      d.y_position,
      d.is_active,
      dsa.assigned_at,
      dsa.is_primary,

      -- Calculate expected wakes for this device
      fn_calculate_device_expected_wakes(
        d.wake_schedule_cron,
        dsa.assigned_at,
        v_session_record.session_start_time,
        v_session_record.session_end_time
      ) as expected_wakes_in_session,

      -- Count actual wakes
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
        AND dwp.overage_flag = FALSE  -- Exclude extra/overage wakes
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

      -- Get wake payloads as JSON array
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

      -- Get images as JSON array
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'image_id', di.image_id,
            'captured_at', di.captured_at,
            'image_url', di.image_url,
            'image_status', di.status,
            'wake_window_index', dwp.wake_window_index
          ) ORDER BY di.captured_at
        ), '[]'::jsonb)
        FROM device_images di
        JOIN device_wake_payloads dwp ON di.image_id = dwp.image_id
        WHERE dwp.device_id = d.device_id
        AND dwp.site_device_session_id = p_session_id
        AND di.image_id IS NOT NULL
      ) as images

    FROM devices d
    JOIN device_site_assignments dsa ON d.device_id = dsa.device_id
    WHERE dsa.site_id = v_session_record.site_id
    AND dsa.is_active = TRUE
    AND d.is_active = TRUE
    AND dsa.assigned_at <= v_session_record.session_end_time
    ORDER BY dsa.is_primary DESC, d.device_code
  LOOP
    -- Build device JSON object
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
      'last_seen_at', v_device_record.last_seen_at,
      'x_position', v_device_record.x_position,
      'y_position', v_device_record.y_position,
      'is_active', v_device_record.is_active,
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
        WHEN v_device_record.assigned_at > v_session_record.session_start_time THEN true
        ELSE false
      END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'session_id', v_session_record.session_id,
    'site_id', v_session_record.site_id,
    'session_date', v_session_record.session_date,
    'session_start_time', v_session_record.session_start_time,
    'session_end_time', v_session_record.session_end_time,
    'devices', v_device_array
  );
END;
$$;

COMMENT ON FUNCTION get_session_devices_with_wakes IS
'Get all devices in a session with wake payloads, images, statistics, and is_active status.';
`;

async function applyMigration() {
  console.log('Applying migration to add is_active to get_session_devices_with_wakes...\n');

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

    if (error) {
      // Try direct execution if exec_sql doesn't exist
      const { error: directError } = await supabase.from('_dummy').select('*').limit(0);

      // Execute using raw SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ sql_query: sql })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('\nChanges:');
    console.log('  - Added is_active field to SELECT query');
    console.log('  - Added is_active to jsonb_build_object return');
    console.log('  - Frontend can now display accurate device status');

  } catch (err) {
    console.error('❌ Error applying migration:', err.message);
    console.error('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.error('\n' + sql);
    process.exit(1);
  }
}

applyMigration();
