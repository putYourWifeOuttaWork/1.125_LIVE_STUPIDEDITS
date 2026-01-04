/*
  # Add Session Context to Device Alerts

  1. Schema Changes
    - Add `session_id` column to `device_alerts` table (nullable, foreign key to site_device_sessions)
    - Add `snapshot_id` column to `device_alerts` table (nullable, foreign key to session_wake_snapshots)
    - Add `wake_number` column to `device_alerts` table (integer, nullable)
    - Add indexes on new columns for query performance

  2. Purpose
    - Enable alerts to link directly to the exact session and wake moment where they were triggered
    - Allow navigation from alert to session detail page with timeline context
    - Support future snapshot-based visualization of alert conditions

  3. Migration Strategy
    - Columns are nullable to support existing alerts without session context
    - Foreign keys ensure referential integrity
    - Indexes added for efficient querying by session and snapshot
    - Backfill of existing alerts will be handled separately if needed
*/

-- Add session context columns to device_alerts
ALTER TABLE public.device_alerts
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS wake_number integer CHECK (wake_number > 0 OR wake_number IS NULL);

-- Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'device_alerts_session_id_fkey'
  ) THEN
    ALTER TABLE public.device_alerts
      ADD CONSTRAINT device_alerts_session_id_fkey
      FOREIGN KEY (session_id)
      REFERENCES public.site_device_sessions(session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'device_alerts_snapshot_id_fkey'
  ) THEN
    ALTER TABLE public.device_alerts
      ADD CONSTRAINT device_alerts_snapshot_id_fkey
      FOREIGN KEY (snapshot_id)
      REFERENCES public.session_wake_snapshots(snapshot_id);
  END IF;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_device_alerts_session_id
  ON public.device_alerts(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_alerts_snapshot_id
  ON public.device_alerts(snapshot_id)
  WHERE snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_alerts_wake_number
  ON public.device_alerts(wake_number)
  WHERE wake_number IS NOT NULL;

-- Composite index for session + wake navigation
CREATE INDEX IF NOT EXISTS idx_device_alerts_session_wake
  ON public.device_alerts(session_id, wake_number)
  WHERE session_id IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN public.device_alerts.session_id IS 'Link to the device session where alert was triggered (nullable for backward compatibility)';
COMMENT ON COLUMN public.device_alerts.snapshot_id IS 'Link to the specific wake snapshot where alert was triggered (nullable)';
COMMENT ON COLUMN public.device_alerts.wake_number IS 'The wake number within the session where alert was triggered (nullable)';
