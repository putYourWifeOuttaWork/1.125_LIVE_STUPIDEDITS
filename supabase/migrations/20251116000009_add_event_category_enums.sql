/*
  # Add Missing Event Category Enum Values

  This migration adds 'Alert' and 'Command' values to the device_event_category enum.
  These are needed for the device events consolidation migration.

  IMPORTANT: This must be run BEFORE migration 20251116000010
*/

-- Add 'Alert' if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Alert'
    AND enumtypid = 'device_event_category'::regtype
  ) THEN
    ALTER TYPE device_event_category ADD VALUE 'Alert';
  END IF;
END $$;

-- Add 'Command' if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Command'
    AND enumtypid = 'device_event_category'::regtype
  ) THEN
    ALTER TYPE device_event_category ADD VALUE 'Command';
  END IF;
END $$;
