-- Rollback for migration 20250531142627_wooden_snowflake.sql
-- This script reverts the changes made in the "wooden_snowflake" migration
-- which added company objects and RLS policy changes

-- 1. First drop all the modified RLS policies
DROP POLICY IF EXISTS "pilot_programs_policy" ON "public"."pilot_programs";
DROP POLICY IF EXISTS "sites_policy" ON "public"."sites";
DROP POLICY IF EXISTS "submissions_policy" ON "public"."submissions";
DROP POLICY IF EXISTS "petri_observations_policy" ON "public"."petri_observations";
DROP POLICY IF EXISTS "Users can view their own company" ON "public"."companies";
DROP POLICY IF EXISTS "Company admins can update their company" ON "public"."companies";

-- 2. Drop the company-related triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created_company ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated_company ON auth.users;
DROP FUNCTION IF EXISTS handle_user_company();
DROP FUNCTION IF EXISTS is_company_admin(UUID);

-- 3. Restore the original handle_new_pilot_program function without company logic
CREATE OR REPLACE FUNCTION handle_new_pilot_program() 
RETURNS TRIGGER AS $$
BEGIN
  -- Insert the creator as an Admin
  INSERT INTO public.pilot_program_users (program_id, user_id, role)
  VALUES (NEW.program_id, auth.uid(), 'Admin');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Remove company_id from pilot_programs table
ALTER TABLE pilot_programs DROP COLUMN IF EXISTS company_id;

-- 5. Remove company-related columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS company_id;
ALTER TABLE users DROP COLUMN IF EXISTS is_company_admin;

-- 6. Drop the companies table
DROP TABLE IF EXISTS companies;

-- 7. Restore original policies with simpler logic

-- Policy for pilot_programs
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  );

-- Policy for sites
CREATE POLICY "sites_policy" ON sites
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  );

-- Policy for submissions
CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    )
  );

-- Policy for petri_observations
CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    )
  );