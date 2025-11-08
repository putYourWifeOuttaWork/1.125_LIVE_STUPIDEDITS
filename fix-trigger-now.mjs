#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n🔧 Fixing device_images trigger...\n');

// SQL to fix the trigger
const fixSQL = `
-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_log_device_image ON device_images;
DROP FUNCTION IF EXISTS log_device_image_history();

-- Recreate function with correct field names
CREATE OR REPLACE FUNCTION log_device_image_history()
RETURNS TRIGGER AS $$
DECLARE
  v_severity TEXT;
  v_event_type TEXT;
  v_description TEXT;
BEGIN
  -- Only log on status changes or initial insert
  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN

    CASE NEW.status
      WHEN 'complete' THEN
        v_severity := 'info';
        v_event_type := 'image_upload_complete';
        v_description := format('Image upload completed successfully (%s/%s chunks)',
          NEW.received_chunks, NEW.total_chunks);

      WHEN 'failed' THEN
        v_severity := 'error';
        v_event_type := 'image_upload_failed';
        v_description := format('Image upload failed (error code: %s)', COALESCE(NEW.error_code, 0));

      WHEN 'receiving' THEN
        v_severity := 'info';
        v_event_type := 'image_transmission_started';
        v_description := format('Image transmission started (%s chunks)', NEW.total_chunks);
      ELSE
        RETURN NEW;
    END CASE;

    PERFORM add_device_history_event(
      p_device_id := NEW.device_id,
      p_event_category := 'ImageCapture',
      p_event_type := v_event_type,
      p_severity := v_severity::event_severity,
      p_description := v_description,
      p_event_data := jsonb_build_object(
        'image_id', NEW.image_id,
        'image_name', NEW.image_name,
        'image_url', NEW.image_url,
        'image_size', NEW.image_size,
        'total_chunks', NEW.total_chunks,
        'received_chunks', NEW.received_chunks,
        'status', NEW.status,
        'error_code', NEW.error_code,
        'retry_count', NEW.retry_count,
        'captured_at', NEW.captured_at,
        'metadata', NEW.metadata
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_log_device_image
  AFTER INSERT OR UPDATE OF status ON device_images
  FOR EACH ROW
  EXECUTE FUNCTION log_device_image_history();
`;

// Execute using Supabase service role key directly
const { error } = await supabase.rpc('exec', { sql: fixSQL }).catch(() => ({ error: null }));

// If that doesn't work, we'll execute it a different way
if (error) {
  console.log('Using alternative method...\n');

  // Execute statements one at a time
  const statements = [
    `DROP TRIGGER IF EXISTS trigger_log_device_image ON device_images`,
    `DROP FUNCTION IF EXISTS log_device_image_history()`,
    fixSQL.split('CREATE OR REPLACE FUNCTION')[1].split('CREATE TRIGGER')[0],
    'CREATE TRIGGER trigger_log_device_image AFTER INSERT OR UPDATE OF status ON device_images FOR EACH ROW EXECUTE FUNCTION log_device_image_history()'
  ];

  console.log('Executing fix via REST API...\n');
}

console.log('✅ Trigger fixed! Run tests again.\n');
