/*
  # Fix custom_reports RLS for three-tier ownership model

  1. Changes
    - Drops all existing policies on `custom_reports` to eliminate duplicates
    - Creates clean, consolidated policies implementing:
      - SELECT: Any active user in the same company can view; super admins can view all
      - INSERT: Any active user can create reports for their own company (must be creator)
      - UPDATE: Creator can update own report; company admins can update any in their company; super admins can update any
      - DELETE: Same three-tier model as UPDATE

  2. Security
    - All policies require `is_user_active()` check
    - INSERT enforces `created_by_user_id = auth.uid()` so users cannot impersonate
    - Company admin access is scoped to `company_id = get_user_company_id()`
    - Super admin access is unrestricted across companies
*/

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view company custom reports" ON custom_reports;
  DROP POLICY IF EXISTS "Users can view reports in their company" ON custom_reports;
  DROP POLICY IF EXISTS "Analysts can create custom reports" ON custom_reports;
  DROP POLICY IF EXISTS "Users can create reports for their company" ON custom_reports;
  DROP POLICY IF EXISTS "Users can update their own reports" ON custom_reports;
  DROP POLICY IF EXISTS "Users can delete their own reports" ON custom_reports;
END $$;

CREATE POLICY "Users can view reports in their company or all if super admin"
  ON custom_reports
  FOR SELECT
  TO authenticated
  USING (
    is_user_active()
    AND (
      is_super_admin()
      OR company_id = get_user_company_id()
    )
  );

CREATE POLICY "Active users can create reports for their company"
  ON custom_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_user_active()
    AND created_by_user_id = auth.uid()
    AND company_id = get_user_company_id()
  );

CREATE POLICY "Creator or company admin or super admin can update reports"
  ON custom_reports
  FOR UPDATE
  TO authenticated
  USING (
    is_user_active()
    AND (
      created_by_user_id = auth.uid()
      OR (is_company_admin() AND company_id = get_user_company_id())
      OR is_super_admin()
    )
  )
  WITH CHECK (
    is_user_active()
    AND (
      created_by_user_id = auth.uid()
      OR (is_company_admin() AND company_id = get_user_company_id())
      OR is_super_admin()
    )
  );

CREATE POLICY "Creator or company admin or super admin can delete reports"
  ON custom_reports
  FOR DELETE
  TO authenticated
  USING (
    is_user_active()
    AND (
      created_by_user_id = auth.uid()
      OR (is_company_admin() AND company_id = get_user_company_id())
      OR is_super_admin()
    )
  );
