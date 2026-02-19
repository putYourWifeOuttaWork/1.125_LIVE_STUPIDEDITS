/*
  # Fix report_snapshots foreign key to cascade on delete

  1. Changes
    - Drop existing `report_snapshots_report_id_fkey` constraint (NO ACTION)
    - Re-add it with `ON DELETE CASCADE` so deleting a custom_report
      automatically removes its associated snapshots

  2. Reason
    - Deleting a report currently fails with a 409 Conflict because
      child rows in `report_snapshots` block the delete
    - This matches the original design intent
*/

ALTER TABLE report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_report_id_fkey;

ALTER TABLE report_snapshots
  ADD CONSTRAINT report_snapshots_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES custom_reports(report_id)
  ON DELETE CASCADE;
