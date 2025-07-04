-- Fix RBAC migration by properly handling enum types and policies
-- This migration adds an Admin role and implements proper role-based access control

-- 1. First drop ALL existing policies that might reference the role column
DROP POLICY IF EXISTS "sites_policy" ON "public"."sites";
DROP POLICY IF EXISTS "sites_insert" ON "public"."sites";
DROP POLICY IF EXISTS "submissions_policy" ON "public"."submissions";
DROP POLICY IF EXISTS "submissions_insert" ON "public"."submissions";
DROP POLICY IF EXISTS "petri_observations_policy" ON "public"."petri_observations";
DROP POLICY IF EXISTS "petri_observations_insert" ON "public"."petri_observations";
DROP POLICY IF EXISTS "pilot_program_users_policy" ON "public"."pilot_program_users";
DROP POLICY IF EXISTS "pilot_program_users_insert" ON "public"."pilot_program_users";
DROP POLICY IF EXISTS "pilot_programs_policy" ON "public"."pilot_programs";
DROP POLICY IF EXISTS "pilot_programs_insert" ON "public"."pilot_programs";

-- 2. Create a new enum type with all values including Admin
CREATE TYPE user_role_enum_new AS ENUM ('Admin', 'Edit', 'Respond');

-- 3. Modify the table to use the new enum type
-- First drop the default value
ALTER TABLE pilot_program_users ALTER COLUMN role DROP DEFAULT;

-- Then alter the column type
ALTER TABLE pilot_program_users 
    ALTER COLUMN role TYPE user_role_enum_new 
    USING (
        CASE 
            WHEN role::text = 'Edit' THEN 'Edit'::user_role_enum_new
            WHEN role::text = 'Respond' THEN 'Respond'::user_role_enum_new
            ELSE 'Respond'::user_role_enum_new
        END
    );

-- Set the default value with the new type
ALTER TABLE pilot_program_users ALTER COLUMN role SET DEFAULT 'Respond'::user_role_enum_new;

-- 4. Drop the old enum type
DROP TYPE user_role_enum;

-- 5. Rename the new enum type to the original name
ALTER TYPE user_role_enum_new RENAME TO user_role_enum;

-- 6. Recreate the base policies for each table
-- Policy for pilot_programs - user can only see programs they have access to
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  );

-- Policy for sites - user can only see sites of programs they have access to
CREATE POLICY "sites_policy" ON sites
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  );

-- Policy for submissions - user can only see submissions of sites they have access to
CREATE POLICY "submissions_policy" ON submissions
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    )
  );

-- Policy for petri_observations - user can only see observations of submissions they have access to
CREATE POLICY "petri_observations_policy" ON petri_observations
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    )
  );

-- Policy for pilot_program_users - user can only see their own records
CREATE POLICY "pilot_program_users_policy" ON pilot_program_users
  USING (user_id = auth.uid());

-- 7. Create new insert policies with proper role restrictions
-- Allow authenticated users to create pilot programs
CREATE POLICY "pilot_programs_insert" 
ON "public"."pilot_programs"
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Sites can be created only by users with Admin or Edit roles
CREATE POLICY "sites_insert" 
ON "public"."sites"
FOR INSERT 
TO authenticated
WITH CHECK (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() 
    AND (role = 'Admin' OR role = 'Edit')
  )
);

-- Submissions can be created by users with any role (Admin, Edit, or Respond)
CREATE POLICY "submissions_insert" 
ON "public"."submissions"
FOR INSERT 
TO authenticated
WITH CHECK (
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
  )
);

-- Petri observations can be created by users with any role (Admin, Edit, or Respond)
CREATE POLICY "petri_observations_insert" 
ON "public"."petri_observations"
FOR INSERT 
TO authenticated
WITH CHECK (
  submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
  )
);

-- Only Admin users can add new users to a program
CREATE POLICY "pilot_program_users_insert" 
ON "public"."pilot_program_users"
FOR INSERT 
TO authenticated
WITH CHECK (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Admin'
  )
);

-- 8. Create update policies based on roles
-- Only Admin users can update pilot programs
CREATE POLICY "pilot_programs_update" 
ON "public"."pilot_programs"
FOR UPDATE 
TO authenticated
USING (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Admin'
  )
);

-- Admin and Edit users can update sites
CREATE POLICY "sites_update" 
ON "public"."sites"
FOR UPDATE 
TO authenticated
USING (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() 
    AND (role = 'Admin' OR role = 'Edit')
  )
);

-- Admin and Edit users can update submissions
CREATE POLICY "submissions_update" 
ON "public"."submissions"
FOR UPDATE 
TO authenticated
USING (
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
);

-- Admin and Edit users can update petri observations
CREATE POLICY "petri_observations_update" 
ON "public"."petri_observations"
FOR UPDATE 
TO authenticated
USING (
  submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
);

-- Only Admin users can update user roles
CREATE POLICY "pilot_program_users_update" 
ON "public"."pilot_program_users"
FOR UPDATE 
TO authenticated
USING (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Admin'
  )
);

-- 9. Create delete policies based on roles
-- Only Admin users can delete pilot programs
CREATE POLICY "pilot_programs_delete" 
ON "public"."pilot_programs"
FOR DELETE 
TO authenticated
USING (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Admin'
  )
);

-- Admin and Edit users can delete sites
CREATE POLICY "sites_delete" 
ON "public"."sites"
FOR DELETE 
TO authenticated
USING (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() 
    AND (role = 'Admin' OR role = 'Edit')
  )
);

-- Admin and Edit users can delete submissions
CREATE POLICY "submissions_delete" 
ON "public"."submissions"
FOR DELETE 
TO authenticated
USING (
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
);

-- Admin and Edit users can delete petri observations
CREATE POLICY "petri_observations_delete" 
ON "public"."petri_observations"
FOR DELETE 
TO authenticated
USING (
  submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
);

-- Only Admin users can delete user roles
CREATE POLICY "pilot_program_users_delete" 
ON "public"."pilot_program_users"
FOR DELETE 
TO authenticated
USING (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Admin'
  )
);

-- 10. Update the pilot program creation policy to make creator an Admin
-- When a user creates a program, they become an Admin by default
CREATE OR REPLACE FUNCTION handle_new_pilot_program() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.pilot_program_users (program_id, user_id, role)
  VALUES (NEW.program_id, auth.uid(), 'Admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create admin user relationship on program creation
DROP TRIGGER IF EXISTS on_pilot_program_created ON public.pilot_programs;
CREATE TRIGGER on_pilot_program_created
  AFTER INSERT ON public.pilot_programs
  FOR EACH ROW EXECUTE PROCEDURE handle_new_pilot_program();

-- 11. Create function to check if user has required role for a program
CREATE OR REPLACE FUNCTION check_user_role(program_uuid UUID, required_roles text[])
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role::text INTO user_role
  FROM pilot_program_users
  WHERE program_id = program_uuid AND user_id = auth.uid();
  
  RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role for a specific program
CREATE OR REPLACE FUNCTION get_user_program_role(program_uuid UUID)
RETURNS text AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role::text INTO user_role
  FROM pilot_program_users
  WHERE program_id = program_uuid AND user_id = auth.uid();
  
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;