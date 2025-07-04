-- Update RLS policies to handle the ReadOnly role
-- This migration assumes the ReadOnly enum value has been added in a previous migration

-- Drop existing policies for sites
DROP POLICY IF EXISTS "sites_insert" ON "public"."sites";
DROP POLICY IF EXISTS "sites_update" ON "public"."sites";
DROP POLICY IF EXISTS "sites_delete" ON "public"."sites";

-- Recreate sites policies
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

-- Drop existing policies for submissions
DROP POLICY IF EXISTS "submissions_insert" ON "public"."submissions";
DROP POLICY IF EXISTS "submissions_update" ON "public"."submissions";
DROP POLICY IF EXISTS "submissions_delete" ON "public"."submissions";

-- Recreate submissions policies
CREATE POLICY "submissions_insert" 
ON "public"."submissions"
FOR INSERT 
TO authenticated
WITH CHECK (
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND pilot_program_users.role != 'ReadOnly'
  )
);

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

-- Drop existing policies for petri_observations
DROP POLICY IF EXISTS "petri_observations_insert" ON "public"."petri_observations";
DROP POLICY IF EXISTS "petri_observations_update" ON "public"."petri_observations";
DROP POLICY IF EXISTS "petri_observations_delete" ON "public"."petri_observations";

-- Recreate petri_observations policies
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
    AND pilot_program_users.role != 'ReadOnly'
  )
);

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