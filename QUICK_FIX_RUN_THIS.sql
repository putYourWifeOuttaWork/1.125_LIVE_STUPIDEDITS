-- ==========================================
-- QUICK FIX: Remove Foreign Key Constraint
-- ==========================================
-- Run this SQL to fix the migration 00004 error

-- Step 1: Drop the foreign key constraint that's causing the issue
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_last_updated_by_user_id_fkey;

-- Step 2: Verify it's gone
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'devices_last_updated_by_user_id_fkey'
    AND table_name = 'devices'
  ) THEN
    RAISE NOTICE '✅ Foreign key constraint successfully removed';
  ELSE
    RAISE WARNING '❌ Foreign key constraint still exists!';
  END IF;
END $$;

-- Step 3: Now you can run migration 00004 successfully
-- After running this, go back and run migration 00004 again

RAISE NOTICE '🎉 Fix applied! Now run migration 20251116000004_system_user_setup.sql';
