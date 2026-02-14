/*
  # Add missing foreign key on report_snapshots.created_by_user_id

  1. Changes
    - Add FK constraint from `report_snapshots.created_by_user_id` to `users(id)`
    - This enables PostgREST relational joins needed by the Snapshots tab

  2. Why
    - The snapshots fetch query uses `created_by:created_by_user_id(id, email, full_name)`
    - PostgREST requires an actual FK constraint to resolve this join
    - Without it, every snapshot fetch fails with PGRST200
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'report_snapshots_created_by_user_id_fkey'
      AND table_name = 'report_snapshots'
  ) THEN
    ALTER TABLE report_snapshots
      ADD CONSTRAINT report_snapshots_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id);
  END IF;
END $$;
