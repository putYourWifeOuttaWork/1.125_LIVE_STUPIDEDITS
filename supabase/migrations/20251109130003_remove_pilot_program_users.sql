/*
  # Remove pilot_program_users Table

  This migration removes the pilot_program_users table as program-level access
  is now controlled by company membership and user roles.

  ## Changes
  1. Backup pilot_program_users data to a historical table
  2. Drop RLS policies on pilot_program_users
  3. Drop foreign key constraints
  4. Drop the pilot_program_users table

  ## Rationale
  The new role-based access control model provides access to all programs
  within a user's company, eliminating the need for explicit program-level
  access grants via pilot_program_users table.
*/

-- ==========================================
-- BACKUP PILOT_PROGRAM_USERS DATA
-- ==========================================

-- Create a backup table for historical reference
CREATE TABLE IF NOT EXISTS pilot_program_users_archive (
  id uuid,
  program_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  user_email varchar,
  archived_at timestamptz DEFAULT now(),
  archived_reason text DEFAULT 'Removed due to RLS rebuild - access now controlled by company membership and user_role'
);

-- Copy all data to archive
INSERT INTO pilot_program_users_archive (id, program_id, user_id, role, created_at, user_email)
SELECT id, program_id, user_id, role::text, created_at, user_email
FROM pilot_program_users
ON CONFLICT DO NOTHING;

-- Add index for quick lookups in archive
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_archive_user_id
  ON pilot_program_users_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_archive_program_id
  ON pilot_program_users_archive(program_id);

COMMENT ON TABLE pilot_program_users_archive IS 'Historical archive of pilot_program_users table before removal. Access control now managed via company membership and user_role field.';

-- ==========================================
-- DROP CONSTRAINTS AND TABLE
-- ==========================================

-- Create helper function to drop policies if it doesn't exist
CREATE OR REPLACE FUNCTION drop_all_policies_on_table(table_name text)
RETURNS void AS $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = table_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_record.policyname, table_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Drop any existing RLS policies on pilot_program_users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'pilot_program_users'
  ) THEN
    PERFORM drop_all_policies_on_table('pilot_program_users');
    RAISE NOTICE 'Dropped RLS policies on pilot_program_users';
  END IF;
END $$;

-- Drop the table (CASCADE will drop any dependent foreign keys)
DROP TABLE IF EXISTS pilot_program_users CASCADE;

-- Clean up the helper function
DROP FUNCTION IF EXISTS drop_all_policies_on_table(text);

-- ==========================================
-- VERIFICATION
-- ==========================================

-- Verify pilot_program_users table is removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'pilot_program_users'
  ) THEN
    RAISE EXCEPTION 'pilot_program_users table still exists after drop attempt';
  END IF;

  RAISE NOTICE 'pilot_program_users table successfully removed';
END $$;

-- Verify archive table has data
DO $$
DECLARE
  archive_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO archive_count FROM pilot_program_users_archive;
  RAISE NOTICE 'pilot_program_users_archive contains % records', archive_count;
END $$;

-- ==========================================
-- MIGRATION NOTES
-- ==========================================

/*
  IMPORTANT: Access Control Change Summary

  BEFORE:
  - Users needed explicit pilot_program_users entries to access programs
  - Access was granted per-program via Admin, Edit, Respond, ReadOnly roles
  - Company admins still needed program-level access entries

  AFTER:
  - All active users in a company can view all programs in their company
  - User permissions are controlled by the user_role field:
    * observer: Read + write submissions/observations
    * analyst: Read all data + write submissions/observations + view history
    * maintenance: Full device management + delete submissions/observations
    * sysAdmin: Full CRUD within company
  - Company admins (is_company_admin=true) have admin privileges
  - Super admins (is_super_admin=true) have unrestricted cross-company access

  MIGRATION IMPACT:
  - Users who previously had no pilot_program_users entries will now see
    all programs in their company (if they are active)
  - Users who had limited program access will now see all company programs
  - Role-based permissions are more uniform and easier to manage
  - Frontend may need updates to remove program-level access UI

  DATA RECOVERY:
  - Original pilot_program_users data is preserved in pilot_program_users_archive
  - Can be referenced if needed to understand historical access patterns
*/
