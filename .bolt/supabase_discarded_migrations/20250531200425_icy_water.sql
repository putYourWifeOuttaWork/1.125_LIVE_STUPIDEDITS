/*
  # Add Program RLS Policies
  
  1. Changes
    - Drop existing program-related RLS policies
    - Create new policies that combine program role and company-based access
    - Update policies for sites, submissions, and petri observations
    
  2. Security
    - Maintains existing role-based permissions (Admin, Edit, Respond)
    - Adds company-based read access
    - Ensures proper data isolation between companies
*/

-- Drop existing policies for pilot_programs
DROP POLICY IF EXISTS "pilot_programs_policy" ON "public"."pilot_programs";
DROP POLICY IF EXISTS "pilot_programs_insert" ON "public"."pilot_programs";
DROP POLICY IF EXISTS "pilot_programs_update" ON "public"."pilot_programs";
DROP POLICY IF EXISTS "pilot_programs_delete" ON "public"."pilot_programs";

-- Create enhanced policies for pilot_programs
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    ) OR (
      company_id IN (
        SELECT company_id FROM users
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    )
  );

CREATE POLICY "pilot_programs_insert" 
ON "public"."pilot_programs"
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

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

-- Drop existing policies for sites
DROP POLICY IF EXISTS "sites_policy" ON "public"."sites";
DROP POLICY IF EXISTS "sites_insert" ON "public"."sites";
DROP POLICY IF EXISTS "sites_update" ON "public"."sites";
DROP POLICY IF EXISTS "sites_delete" ON "public"."sites";

-- Create enhanced policies for sites
CREATE POLICY "sites_policy" ON sites
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    ) OR (
      program_id IN (
        SELECT program_id FROM pilot_programs
        WHERE company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

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
DROP POLICY IF EXISTS "submissions_policy" ON "public"."submissions";
DROP POLICY IF EXISTS "submissions_insert" ON "public"."submissions";
DROP POLICY IF EXISTS "submissions_update" ON "public"."submissions";
DROP POLICY IF EXISTS "submissions_delete" ON "public"."submissions";

-- Create enhanced policies for submissions
CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      site_id IN (
        SELECT sites.site_id FROM sites
        JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
        WHERE pilot_programs.company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

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
DROP POLICY IF EXISTS "petri_observations_policy" ON "public"."petri_observations";
DROP POLICY IF EXISTS "petri_observations_insert" ON "public"."petri_observations";
DROP POLICY IF EXISTS "petri_observations_update" ON "public"."petri_observations";
DROP POLICY IF EXISTS "petri_observations_delete" ON "public"."petri_observations";

-- Create enhanced policies for petri_observations
CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      submission_id IN (
        SELECT submissions.submission_id FROM submissions
        JOIN sites ON submissions.site_id = sites.site_id
        JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
        WHERE pilot_programs.company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

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