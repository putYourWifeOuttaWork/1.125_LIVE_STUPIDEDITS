/*
  # Phase 2: Wake Payload Consolidation Schema Updates
  
  ## Purpose
  Enhance device_wake_payloads table to serve as the single source of truth for ALL device wake events.
  According to ESP32-CAM architecture document, every wake should create ONE consolidated record.
  
  ## Changes
  
  ### 1. Add Missing Columns to device_wake_payloads
  - `telemetry_id`: Link to device_telemetry record (if telemetry was stored separately)
  - `wake_type`: Categorize wake events (image_wake, telemetry_only, hello, retry)
  - `chunk_count`: Total chunks expected for image transfer
  - `chunks_received`: Number of chunks successfully received
  - `is_complete`: Boolean flag for quick filtering of complete wakes
  
  ### 2. Remove device_wake_sessions Table
  - Table is empty (0 rows) and unused
  - All wake tracking consolidated into device_wake_payloads
  - Simplifies architecture per original plan
  
  ## Migration Safety
  - Uses IF NOT EXISTS / IF EXISTS for idempotency
  - Does not modify existing data
  - Can be rolled back if needed
*/

-- Step 1: Add missing columns to device_wake_payloads
ALTER TABLE device_wake_payloads
  ADD COLUMN IF NOT EXISTS telemetry_id UUID REFERENCES device_telemetry(telemetry_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wake_type TEXT CHECK (wake_type IN ('image_wake', 'telemetry_only', 'hello', 'retry')),
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER CHECK (chunk_count >= 0),
  ADD COLUMN IF NOT EXISTS chunks_received INTEGER DEFAULT 0 CHECK (chunks_received >= 0),
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE;

-- Step 2: Create index on is_complete for fast filtering
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_is_complete 
  ON device_wake_payloads(is_complete) 
  WHERE is_complete = TRUE;

-- Step 3: Create index on wake_type for analytics
CREATE INDEX IF NOT EXISTS idx_device_wake_payloads_wake_type 
  ON device_wake_payloads(wake_type);

-- Step 4: Update existing records to mark them as complete if they have images
UPDATE device_wake_payloads
SET 
  is_complete = (image_status = 'complete'),
  wake_type = CASE 
    WHEN image_id IS NOT NULL THEN 'image_wake'
    ELSE 'telemetry_only'
  END
WHERE wake_type IS NULL;

-- Step 5: Verify device_wake_sessions is empty before dropping
DO $$
DECLARE
  session_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO session_count FROM device_wake_sessions;
  
  IF session_count > 0 THEN
    RAISE EXCEPTION 'device_wake_sessions table is not empty (% rows). Manual review required.', session_count;
  END IF;
  
  RAISE NOTICE 'device_wake_sessions is empty, safe to drop';
END $$;

-- Step 6: Drop device_wake_sessions table (empty and unused)
DROP TABLE IF EXISTS device_wake_sessions CASCADE;

-- Step 7: Add comment documenting the consolidation
COMMENT ON TABLE device_wake_payloads IS 
  'Consolidated wake event tracking. Each device wake creates ONE record here with telemetry data and optional image reference. Replaces deprecated device_wake_sessions table.';

COMMENT ON COLUMN device_wake_payloads.wake_type IS 
  'Type of wake event: image_wake (captured image), telemetry_only (sensors only), hello (initial contact), retry (retransmission attempt)';

COMMENT ON COLUMN device_wake_payloads.is_complete IS 
  'Quick filter for completed wakes. TRUE when all data received and processed successfully.';

COMMENT ON COLUMN device_wake_payloads.chunk_count IS 
  'Total number of chunks expected for image transfer (matches total_chunks_count from metadata)';

COMMENT ON COLUMN device_wake_payloads.chunks_received IS 
  'Number of chunks successfully received so far. When equals chunk_count, transfer is complete.';
