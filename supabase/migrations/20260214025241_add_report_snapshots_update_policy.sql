/*
  # Add UPDATE policy for report_snapshots

  1. Security Changes
    - Add RLS policy allowing authenticated users to update snapshot_name
      and description for snapshots belonging to their company
    - Super admins can update any snapshot

  2. Important Notes
    - This enables inline renaming of snapshots in the UI
    - Only snapshot_name and description are expected to be updated;
      data_snapshot and configuration_snapshot remain immutable by convention
*/

CREATE POLICY "Users can update own company snapshots"
  ON report_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT u.company_id FROM users u
      WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT u.company_id FROM users u
      WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_super_admin = true
    )
  );
