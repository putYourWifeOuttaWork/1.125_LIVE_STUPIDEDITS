/*
  # Recreate pilot_program_users Table
  
  This migration recreates the pilot_program_users table to restore compatibility
  with legacy submission creation functions. The table will be automatically 
  populated with entries for all active users and programs within their company.
  
  ## Changes
  1. Create pilot_program_users table with original structure
  2. Automatically populate entries for all active company users with their programs
  3. Create trigger to maintain entries when new users or programs are added
  4. Assign role based on user's user_role field (Admin for company_admin/sysAdmin)
  
  ## Access Model
  - All active users in a company automatically get access to all programs in that company
  - Role is derived from user's user_role:
    * is_company_admin OR user_role='sysAdmin' -> 'Admin'
    * user_role='maintenance' -> 'Edit'
    * user_role='analyst' -> 'Edit'
    * user_role='observer' -> 'Edit' (can create submissions)
  - This maintains backward compatibility while respecting the new role system
*/

-- ==========================================
-- CREATE PILOT_PROGRAM_USERS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS pilot_program_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Edit',
  created_at timestamptz NOT NULL DEFAULT now(),
  user_email varchar,
  UNIQUE(program_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_program_id ON pilot_program_users(program_id);
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_user_id ON pilot_program_users(user_id);
CREATE INDEX IF NOT EXISTS idx_pilot_program_users_lookup ON pilot_program_users(user_id, program_id);

COMMENT ON TABLE pilot_program_users IS 'Program access table - automatically populated based on company membership. Maintained for backward compatibility with legacy functions.';
COMMENT ON COLUMN pilot_program_users.role IS 'Legacy role field - Admin for company admins, Edit for others. New permissions controlled by user_role field in users table.';

-- ==========================================
-- FUNCTION: DETERMINE ROLE FROM USER_ROLE
-- ==========================================

CREATE OR REPLACE FUNCTION get_legacy_program_role(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_is_company_admin BOOLEAN;
  v_user_role TEXT;
BEGIN
  SELECT is_company_admin, user_role::text
  INTO v_is_company_admin, v_user_role
  FROM users
  WHERE id = p_user_id;
  
  -- Company admins and sysAdmins get Admin role
  IF v_is_company_admin OR v_user_role = 'sysAdmin' THEN
    RETURN 'Admin';
  END IF;
  
  -- All other active users get Edit role (allows submission creation)
  RETURN 'Edit';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_legacy_program_role(UUID) TO authenticated;

COMMENT ON FUNCTION get_legacy_program_role IS 'Maps new user_role to legacy program role for backward compatibility';

-- ==========================================
-- POPULATE PILOT_PROGRAM_USERS
-- ==========================================

-- Populate pilot_program_users for all active users with all programs in their company
INSERT INTO pilot_program_users (program_id, user_id, role, user_email)
SELECT 
  pp.program_id,
  u.id as user_id,
  get_legacy_program_role(u.id) as role,
  u.email as user_email
FROM users u
CROSS JOIN pilot_programs pp
WHERE 
  u.company_id = pp.company_id  -- Only match programs in user's company
  AND u.is_active = true         -- Only active users
  AND u.company_id IS NOT NULL   -- User must have a company
  AND pp.company_id IS NOT NULL  -- Program must have a company
ON CONFLICT (program_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      user_email = EXCLUDED.user_email;

-- ==========================================
-- TRIGGER: AUTO-MAINTAIN PILOT_PROGRAM_USERS
-- ==========================================

-- Function to sync pilot_program_users when users are added/updated
CREATE OR REPLACE FUNCTION sync_pilot_program_users_for_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process active users with a company
  IF NEW.is_active = true AND NEW.company_id IS NOT NULL THEN
    -- Add entries for all programs in user's company
    INSERT INTO pilot_program_users (program_id, user_id, role, user_email)
    SELECT 
      pp.program_id,
      NEW.id,
      get_legacy_program_role(NEW.id),
      NEW.email
    FROM pilot_programs pp
    WHERE pp.company_id = NEW.company_id
    ON CONFLICT (program_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          user_email = EXCLUDED.user_email;
  ELSIF NEW.is_active = false OR NEW.company_id IS NULL THEN
    -- Remove entries if user becomes inactive or loses company
    DELETE FROM pilot_program_users WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on users table
DROP TRIGGER IF EXISTS trg_sync_pilot_program_users_user ON users;
CREATE TRIGGER trg_sync_pilot_program_users_user
  AFTER INSERT OR UPDATE OF is_active, company_id, is_company_admin, user_role
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_pilot_program_users_for_user();

-- Function to sync pilot_program_users when programs are added/updated
CREATE OR REPLACE FUNCTION sync_pilot_program_users_for_program()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process programs with a company
  IF NEW.company_id IS NOT NULL THEN
    -- Add entries for all active users in the program's company
    INSERT INTO pilot_program_users (program_id, user_id, role, user_email)
    SELECT 
      NEW.program_id,
      u.id,
      get_legacy_program_role(u.id),
      u.email
    FROM users u
    WHERE u.company_id = NEW.company_id
      AND u.is_active = true
    ON CONFLICT (program_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          user_email = EXCLUDED.user_email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on pilot_programs table
DROP TRIGGER IF EXISTS trg_sync_pilot_program_users_program ON pilot_programs;
CREATE TRIGGER trg_sync_pilot_program_users_program
  AFTER INSERT OR UPDATE OF company_id
  ON pilot_programs
  FOR EACH ROW
  EXECUTE FUNCTION sync_pilot_program_users_for_program();

-- ==========================================
-- RLS POLICIES
-- ==========================================

ALTER TABLE pilot_program_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can view all program users" ON pilot_program_users;
DROP POLICY IF EXISTS "Users can view program users in accessible programs" ON pilot_program_users;
DROP POLICY IF EXISTS "System can manage pilot_program_users" ON pilot_program_users;

-- Super admins can view all
CREATE POLICY "Super admins can view all program users"
ON pilot_program_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_super_admin = true
  )
);

-- Users can view entries in their company
CREATE POLICY "Users can view program users in their company"
ON pilot_program_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN pilot_programs pp ON pp.program_id = pilot_program_users.program_id
    WHERE u.id = auth.uid()
    AND u.company_id = pp.company_id
  )
);

-- System can manage (for triggers)
CREATE POLICY "System can manage pilot_program_users"
ON pilot_program_users FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ==========================================
-- VERIFICATION
-- ==========================================

DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_entry_count INTEGER;
  v_user_count INTEGER;
  v_program_count INTEGER;
BEGIN
  -- Check table exists
  SELECT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'pilot_program_users'
  ) INTO v_table_exists;
  
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'pilot_program_users table was not created';
  END IF;
  
  -- Count entries
  SELECT COUNT(*) INTO v_entry_count FROM pilot_program_users;
  SELECT COUNT(*) INTO v_user_count FROM users WHERE is_active = true AND company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_program_count FROM pilot_programs WHERE company_id IS NOT NULL;
  
  RAISE NOTICE 'pilot_program_users table successfully recreated';
  RAISE NOTICE 'Created % entries for % active users across % programs', v_entry_count, v_user_count, v_program_count;
  
  -- Sample some entries
  IF v_entry_count > 0 THEN
    RAISE NOTICE 'Sample entries:';
    FOR i IN (
      SELECT 
        ppu.user_email,
        pp.name as program_name,
        ppu.role,
        c.name as company_name
      FROM pilot_program_users ppu
      JOIN pilot_programs pp ON pp.program_id = ppu.program_id
      JOIN companies c ON c.company_id = pp.company_id
      LIMIT 5
    ) LOOP
      RAISE NOTICE '  - % -> % (%) [Company: %]', i.user_email, i.program_name, i.role, i.company_name;
    END LOOP;
  END IF;
END $$;

-- ==========================================
-- MIGRATION NOTES
-- ==========================================

/*
  ## What This Migration Does:
  
  1. Recreates pilot_program_users table with original structure
  2. Automatically populates entries for every active user and program pair in the same company
  3. Sets role based on user's permissions:
     - Company admins and sysAdmins get 'Admin' role
     - All other active users get 'Edit' role (allows submission creation)
  4. Creates triggers to maintain the table automatically when:
     - New users are added to a company
     - Users are activated/deactivated
     - User roles change
     - New programs are created
  
  ## Backward Compatibility:
  
  - Legacy functions like create_submission_session can now query pilot_program_users
  - All active company users automatically have access to create submissions
  - Role field is maintained but actual permissions come from user_role field
  
  ## Going Forward:
  
  - Consider this a compatibility layer for legacy code
  - New code should use company_id and user_role directly
  - The table is auto-maintained, no manual entries needed
  - To give a user access to a program, just ensure they're in the right company
*/
