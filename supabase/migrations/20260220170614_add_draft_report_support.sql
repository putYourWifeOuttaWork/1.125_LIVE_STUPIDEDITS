/*
  # Add Draft Report Support for Alert Investigation Reports

  1. Modified Tables
    - `custom_reports`
      - `is_draft` (boolean, default false) - marks auto-generated draft reports
      - `source_alert_id` (uuid, nullable, FK to device_alerts) - links back to originating alert
      - `annotations` (jsonb, nullable) - persists chart annotations (threshold lines, highlights, etc.)
      - `draft_expires_at` (timestamptz, nullable) - auto-cleanup deadline for unclaimed drafts

  2. New Functions
    - `cleanup_expired_draft_reports()` - deletes draft reports past their expiry

  3. Scheduled Jobs
    - Daily cron job to clean up expired drafts

  4. Indexes
    - Partial index on (company_id, draft_expires_at) WHERE is_draft = true for efficient cleanup
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_reports' AND column_name = 'is_draft'
  ) THEN
    ALTER TABLE custom_reports ADD COLUMN is_draft boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_reports' AND column_name = 'source_alert_id'
  ) THEN
    ALTER TABLE custom_reports ADD COLUMN source_alert_id uuid REFERENCES device_alerts(alert_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_reports' AND column_name = 'annotations'
  ) THEN
    ALTER TABLE custom_reports ADD COLUMN annotations jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_reports' AND column_name = 'draft_expires_at'
  ) THEN
    ALTER TABLE custom_reports ADD COLUMN draft_expires_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_custom_reports_draft_cleanup
  ON custom_reports (company_id, draft_expires_at)
  WHERE is_draft = true;

CREATE OR REPLACE FUNCTION cleanup_expired_draft_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  deleted_count integer;
BEGIN
  WITH expired AS (
    SELECT report_id FROM custom_reports
    WHERE is_draft = true
      AND draft_expires_at IS NOT NULL
      AND draft_expires_at < now()
  ),
  del_snapshots AS (
    DELETE FROM report_snapshots
    WHERE report_id IN (SELECT report_id FROM expired)
  ),
  del_schedules AS (
    DELETE FROM report_snapshot_schedules
    WHERE report_id IN (SELECT report_id FROM expired)
  ),
  del_reports AS (
    DELETE FROM custom_reports
    WHERE report_id IN (SELECT report_id FROM expired)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM del_reports;

  RETURN deleted_count;
END;
$fn$;

SELECT cron.schedule(
  'cleanup-expired-draft-reports',
  '0 3 * * *',
  'SELECT cleanup_expired_draft_reports()'
);