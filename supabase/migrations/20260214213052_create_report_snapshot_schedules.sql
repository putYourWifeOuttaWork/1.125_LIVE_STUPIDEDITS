/*
  # Create Report Snapshot Schedules Table

  1. New Tables
    - `report_snapshot_schedules`
      - `schedule_id` (uuid, primary key)
      - `report_id` (uuid, FK to custom_reports, unique per report)
      - `company_id` (uuid, FK to companies)
      - `enabled` (boolean) - whether the schedule is active
      - `cadence` (text) - daily, every_other_day, weekly, biweekly, monthly
      - `snapshot_time` (time) - time of day to capture
      - `timezone` (text) - timezone for interpreting snapshot_time
      - `last_run_at` (timestamptz) - last successful execution
      - `created_by_user_id` (uuid) - who created the schedule
      - `created_at` / `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `report_snapshot_schedules`
    - Company-scoped policies for SELECT, INSERT, UPDATE, DELETE
    - Super admin bypass on all policies

  3. Indexes
    - Unique on report_id
    - Composite on (enabled, last_run_at) for cron queries
    - On company_id for RLS performance
*/

CREATE TABLE IF NOT EXISTS report_snapshot_schedules (
  schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES custom_reports(report_id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  cadence text NOT NULL DEFAULT 'daily'
    CHECK (cadence IN ('daily', 'every_other_day', 'weekly', 'biweekly', 'monthly')),
  snapshot_time time NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'America/New_York',
  last_run_at timestamptz,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id)
);

CREATE INDEX IF NOT EXISTS idx_report_snapshot_schedules_company
  ON report_snapshot_schedules(company_id);

CREATE INDEX IF NOT EXISTS idx_report_snapshot_schedules_enabled_last_run
  ON report_snapshot_schedules(enabled, last_run_at);

ALTER TABLE report_snapshot_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules for their company reports"
  ON report_snapshot_schedules
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT u.company_id FROM users u WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );

CREATE POLICY "Users can create schedules for their company reports"
  ON report_snapshot_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      company_id IN (
        SELECT u.company_id FROM users u WHERE u.id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM custom_reports cr
        WHERE cr.report_id = report_snapshot_schedules.report_id
        AND cr.company_id = report_snapshot_schedules.company_id
      )
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );

CREATE POLICY "Users can update schedules for their company reports"
  ON report_snapshot_schedules
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT u.company_id FROM users u WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT u.company_id FROM users u WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );

CREATE POLICY "Users can delete schedules for their company reports"
  ON report_snapshot_schedules
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT u.company_id FROM users u WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );
