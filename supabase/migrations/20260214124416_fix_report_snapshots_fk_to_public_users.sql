/*
  # Fix report_snapshots FK to reference public.users

  1. Changes
    - Drop the existing `report_snapshots_created_by_user_id_fkey` FK that incorrectly
      references `auth.users(id)` (inaccessible to PostgREST)
    - Recreate it to reference `public.users(id)` (same pattern as `custom_reports`)

  2. Why
    - PostgREST only resolves FK joins against the `public` schema
    - The `custom_reports` table already has its `created_by_user_id` FK pointing to
      `public.users` and works correctly
    - This mismatch causes PGRST200 errors when fetching snapshots with user joins
*/

ALTER TABLE public.report_snapshots
  DROP CONSTRAINT IF EXISTS report_snapshots_created_by_user_id_fkey;

ALTER TABLE public.report_snapshots
  ADD CONSTRAINT report_snapshots_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);

NOTIFY pgrst, 'reload schema';
