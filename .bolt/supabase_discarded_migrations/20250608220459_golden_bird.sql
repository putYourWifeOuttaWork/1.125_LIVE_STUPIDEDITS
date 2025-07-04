/*
  # Fix uid() references in RLS policies
  
  1. Changes
    - Replaces all instances of uid() with auth.uid() in RLS policies
    - Drops and recreates all affected policies to ensure consistency
    - Fixes the "function uid() does not exist" error
    
  2. Tables Affected
    - pilot_programs
    - sites
    - submissions
    - petri_observations
    - gasifier_observations
    - pilot_program_users
    - pilot_program_history
    - users
    - companies
*/

-- 1. Drop all existing policies on all tables to start fresh
DO $$
DECLARE
  table_record RECORD;
  policy_record RECORD;
BEGIN
  -- Loop through all tables in the public schema
  FOR table_record IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  ) LOOP
    -- For each table, drop all its policies
    FOR policy_record IN (
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = table_record.tablename AND schemaname = 'public'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 
                    policy_record.policyname, table_record.tablename);
    END LOOP;
  END LOOP;
END
$$;

-- 2. Recreate policies for pilot_programs table
-- Policy for viewing programs
CREATE POLICY "pilot_programs_policy" ON pilot_programs
  FOR SELECT
  TO public
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

-- Policy for inserting programs
CREATE POLICY "pilot_programs_insert" 
ON "public"."pilot_programs"
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy for updating programs
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

-- Policy for deleting programs
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

-- Company admin policies for programs
CREATE POLICY "Company admins can create programs" ON pilot_programs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND is_company_admin = TRUE
    )
  );

CREATE POLICY "Company admins can update programs" ON pilot_programs
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND is_company_admin = TRUE
    )
  );

CREATE POLICY "Company admins can delete programs" ON pilot_programs
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND is_company_admin = TRUE
    )
  );

-- 3. Recreate policies for sites table
-- Policy for viewing sites
CREATE POLICY "sites_policy" ON sites
  FOR SELECT
  TO public
  USING (
    program_id IN (
      -- Direct program access
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    ) OR (
      -- Company-based access
      program_id IN (
        SELECT program_id FROM pilot_programs
        WHERE company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- Policy for inserting sites
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

-- Policy for updating sites
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

-- Policy for deleting sites
CREATE POLICY "sites_delete" ON sites
FOR DELETE 
TO authenticated
USING (
  -- Program admins and editors can delete
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() 
    AND (role = 'Admin' OR role = 'Edit')
  )
  -- OR company admins can delete
  OR is_company_admin_for_program(program_id)
);

-- 4. Recreate policies for submissions table
-- Policy for viewing submissions
CREATE POLICY "submissions_policy" ON submissions
  FOR SELECT
  TO public
  USING (
    site_id IN (
      -- Direct program access
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      -- Company-based access
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

-- Policy for inserting submissions
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

-- Policy for updating submissions
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

-- Policy for deleting submissions
CREATE POLICY "submissions_delete" ON submissions
FOR DELETE 
TO authenticated
USING (
  -- Program admins and editors can delete
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
  -- OR company admins can delete 
  OR site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
    WHERE is_company_admin_for_program(pilot_programs.program_id)
  )
);

-- 5. Recreate policies for petri_observations table
-- Policy for viewing petri observations
CREATE POLICY "petri_observations_policy" ON petri_observations
  FOR SELECT
  TO public
  USING (
    submission_id IN (
      -- Direct program access
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      -- Company-based access
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

-- Policy for inserting petri observations
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

-- Policy for updating petri observations
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

-- Policy for deleting petri observations
CREATE POLICY "petri_observations_delete" ON petri_observations
FOR DELETE 
TO authenticated
USING (
  -- Program admins and editors can delete
  submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
    AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
  )
  -- OR company admins can delete
  OR submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
    WHERE is_company_admin_for_program(pilot_programs.program_id)
  )
);

-- 6. Recreate policies for gasifier_observations table
-- Policy for viewing gasifier observations
CREATE POLICY "gasifier_observations_policy" ON gasifier_observations
  FOR SELECT
  TO public
  USING (
    submission_id IN (
      -- Direct program access
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    ) OR (
      -- Company-based access
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

-- Policy for inserting gasifier observations
CREATE POLICY "gasifier_observations_insert" ON gasifier_observations
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

-- Policy for updating gasifier observations
CREATE POLICY "gasifier_observations_update" ON gasifier_observations
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

-- Policy for deleting gasifier observations
CREATE POLICY "gasifier_observations_delete" ON gasifier_observations
  FOR DELETE
  TO authenticated
  USING (
    -- Program admins and editors can delete
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
      AND (pilot_program_users.role = 'Admin' OR pilot_program_users.role = 'Edit')
    )
    -- OR company admins can delete
    OR submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_programs ON sites.program_id = pilot_programs.program_id
      WHERE is_company_admin_for_program(pilot_programs.program_id)
    )
  );

-- 7. Recreate policies for pilot_program_users table
-- Policy for viewing program users
CREATE POLICY "pilot_program_users_policy" ON pilot_program_users
  FOR ALL
  TO public
  USING (user_id = auth.uid());

-- Policy for inserting program users
CREATE POLICY "pilot_program_users_insert" ON pilot_program_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid() AND role = 'Admin'
    ) OR (
      program_id IN (
        SELECT pp.program_id FROM pilot_programs pp
        JOIN users u ON pp.company_id = u.company_id
        WHERE u.id = auth.uid() AND u.is_company_admin = true
      )
    )
  );

-- Policy for updating program users
CREATE POLICY "pilot_program_users_update" ON pilot_program_users
  FOR UPDATE
  TO authenticated
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- Policy for deleting program users
CREATE POLICY "pilot_program_users_delete" ON pilot_program_users
  FOR DELETE
  TO authenticated
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- 8. Recreate policies for pilot_program_history table
-- Policy for viewing history
CREATE POLICY "Users can view history for their programs" ON pilot_program_history
  FOR SELECT
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users 
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- Policy for inserting history records
CREATE POLICY "Users can insert history records" ON pilot_program_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 9. Recreate policies for users table
-- Policy for users to view their own profile
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Policy for users to update their own profile
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Policy for users to search for other users by email
CREATE POLICY "Users can search for other users by email" ON users
  FOR SELECT
  USING (true);

-- Policy for users to view other users in their company
CREATE POLICY "Users can view company members" ON users
  FOR SELECT
  USING (
    (company_id IS NOT NULL) AND 
    (company_id = (
      SELECT company_id 
      FROM users 
      WHERE id = auth.uid() 
      AND company_id IS NOT NULL
    ))
  );

-- Policy for users to view other users in shared programs
CREATE POLICY "Users can view program participants" ON users
  FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT u.id
      FROM users u
      JOIN pilot_program_users ppu ON u.id = ppu.user_id
      WHERE ppu.program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid()
      )
    )
  );

-- 10. Recreate policies for companies table
-- Policy for viewing companies
CREATE POLICY "Users can view their own company" ON companies
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  );

-- Policy for updating companies
CREATE POLICY "Company admins can update their company" ON companies
  FOR UPDATE
  USING (
    is_company_admin(company_id)
  );

-- 11. Add comments for documentation
COMMENT ON POLICY "pilot_programs_policy" ON pilot_programs IS 'Allows users to view programs they have access to directly or via company membership';
COMMENT ON POLICY "sites_policy" ON sites IS 'Allows users to view sites in programs they have access to directly or via company membership';
COMMENT ON POLICY "submissions_policy" ON submissions IS 'Allows users to view submissions for sites they have access to';
COMMENT ON POLICY "petri_observations_policy" ON petri_observations IS 'Allows users to view petri observations for submissions they have access to';
COMMENT ON POLICY "gasifier_observations_policy" ON gasifier_observations IS 'Allows users to view gasifier observations for submissions they have access to';
COMMENT ON POLICY "Users can view their own profile" ON users IS 'Allows users to view their own profile information';
COMMENT ON POLICY "Users can view company members" ON users IS 'Allows users to view other users in the same company';