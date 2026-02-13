-- ================================================================
-- Fix Custom Reports Foreign Key Reference
-- ================================================================
-- This fixes the error:
-- "Could not find a relationship between 'custom_reports' and 'created_by_user_id'"
--
-- PROBLEM:
-- The custom_reports table references auth.users(id), but Supabase
-- PostgREST cannot resolve cross-schema foreign key relationships
-- for automatic joins.
--
-- SOLUTION:
-- Change the foreign key to reference public.users(id) instead,
-- which allows PostgREST to properly resolve the relationship.
--
-- HOW TO APPLY:
-- 1. Copy this entire SQL block
-- 2. Go to Supabase Dashboard > SQL Editor
-- 3. Paste and execute
-- ================================================================

-- Drop the old constraint that references auth.users
ALTER TABLE custom_reports
  DROP CONSTRAINT IF EXISTS custom_reports_created_by_user_id_fkey;

-- Add new constraint that references public.users
ALTER TABLE custom_reports
  ADD CONSTRAINT custom_reports_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the constraint was created correctly
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'custom_reports'
  AND kcu.column_name = 'created_by_user_id';
