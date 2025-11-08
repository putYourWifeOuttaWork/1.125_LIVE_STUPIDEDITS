/*
  # Row-Level Security Policies for Device Tables

  1. Purpose
    - Implement company-based RLS for all device-related tables
    - Enforce company isolation for device data
    - Allow super admins full access
    - Company admins manage their company's devices
    - Regular users see devices assigned to accessible programs

  2. Tables with RLS Policies
    - devices (update existing policies)
    - device_telemetry (update existing policies)
    - device_images (update existing policies)
    - device_commands (update existing policies)
    - device_alerts (update existing policies)
    - device_wake_sessions
    - device_history
    - device_site_assignments
    - device_program_assignments
    - site_program_assignments

  3. Access Model
    - Super admins: Full CRUD access to all devices
    - Company admins: Full CRUD access to their company's devices
    - Regular users: View devices in programs they have access to
    - Device reassignment to different company requires super admin or company admin
*/

-- ==========================================
-- DEVICES TABLE RLS (UPDATE EXISTING)
-- ==========================================

-- Drop existing device policies
DROP POLICY IF EXISTS "Users can view devices in their programs" ON devices;
DROP POLICY IF EXISTS "Company admins can create devices" ON devices;
DROP POLICY IF EXISTS "Company admins can update devices" ON devices;
DROP POLICY IF EXISTS "Company admins can delete devices" ON devices;
DROP POLICY IF EXISTS "Super admins can view all devices" ON devices;
DROP POLICY IF EXISTS "Super admins can create devices" ON devices;
DROP POLICY IF EXISTS "Super admins can update all devices" ON devices;
DROP POLICY IF EXISTS "Super admins can delete all devices" ON devices;
DROP POLICY IF EXISTS "Users can view devices in accessible programs" ON devices;

-- SELECT policies
CREATE POLICY "Super admins can view all devices"
ON devices
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view devices in accessible programs"
ON devices
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (
    -- Device has a program assigned that user has access to
    (program_id IS NOT NULL AND user_has_program_access(program_id))
    OR
    -- Device is assigned to a site in a program user has access to
    (site_id IN (
      SELECT site_id
      FROM sites
      WHERE company_id = get_user_company_id()
        AND user_has_program_access(program_id)
    ))
    OR
    -- Device has assignments to programs user has access to
    (device_id IN (
      SELECT device_id
      FROM device_program_assignments
      WHERE is_active = true
        AND company_id = get_user_company_id()
        AND user_has_program_access(program_id)
    ))
  )
);

-- INSERT policies
CREATE POLICY "Super admins can create devices"
ON devices
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can create devices"
ON devices
FOR INSERT
TO authenticated
WITH CHECK (
  user_is_company_admin()
  AND (company_id = get_user_company_id() OR company_id IS NULL)
);

-- UPDATE policies
CREATE POLICY "Super admins can update all devices"
ON devices
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update devices"
ON devices
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND (
    company_id = get_user_company_id()
    OR is_super_admin() -- Super admin can reassign to different company
  )
);

-- DELETE policies
CREATE POLICY "Super admins can delete all devices"
ON devices
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can delete devices"
ON devices
FOR DELETE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_TELEMETRY TABLE RLS (UPDATE EXISTING)
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view device telemetry in their programs" ON device_telemetry;
DROP POLICY IF EXISTS "Super admins can view all device telemetry" ON device_telemetry;
DROP POLICY IF EXISTS "Users can view device telemetry in accessible programs" ON device_telemetry;

-- SELECT policies
CREATE POLICY "Super admins can view all device telemetry"
ON device_telemetry
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device telemetry in accessible programs"
ON device_telemetry
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND device_id IN (
    SELECT device_id
    FROM devices
    WHERE company_id = get_user_company_id()
      AND (
        (program_id IS NOT NULL AND user_has_program_access(program_id))
        OR (site_id IN (
          SELECT site_id
          FROM sites
          WHERE company_id = get_user_company_id()
            AND user_has_program_access(program_id)
        ))
      )
  )
);

-- INSERT policy (typically done by devices/system, not users)
CREATE POLICY "System can insert device telemetry"
ON device_telemetry
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_IMAGES TABLE RLS (UPDATE EXISTING)
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view device images in their programs" ON device_images;
DROP POLICY IF EXISTS "Super admins can view all device images" ON device_images;
DROP POLICY IF EXISTS "Users can view device images in accessible programs" ON device_images;

-- SELECT policies
CREATE POLICY "Super admins can view all device images"
ON device_images
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device images in accessible programs"
ON device_images
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND device_id IN (
    SELECT device_id
    FROM devices
    WHERE company_id = get_user_company_id()
      AND (
        (program_id IS NOT NULL AND user_has_program_access(program_id))
        OR (site_id IN (
          SELECT site_id
          FROM sites
          WHERE company_id = get_user_company_id()
            AND user_has_program_access(program_id)
        ))
      )
  )
);

-- INSERT policy
CREATE POLICY "System can insert device images"
ON device_images
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- UPDATE policy
CREATE POLICY "Super admins can update device images"
ON device_images
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update device images"
ON device_images
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_COMMANDS TABLE RLS (UPDATE EXISTING)
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view device commands in their programs" ON device_commands;
DROP POLICY IF EXISTS "Company admins can create device commands" ON device_commands;
DROP POLICY IF EXISTS "Company admins can update device commands" ON device_commands;
DROP POLICY IF EXISTS "Super admins can view all device commands" ON device_commands;
DROP POLICY IF EXISTS "Super admins can create device commands" ON device_commands;
DROP POLICY IF EXISTS "Super admins can update all device commands" ON device_commands;
DROP POLICY IF EXISTS "Users can view device commands in accessible programs" ON device_commands;

-- SELECT policies
CREATE POLICY "Super admins can view all device commands"
ON device_commands
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device commands in accessible programs"
ON device_commands
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND device_id IN (
    SELECT device_id
    FROM devices
    WHERE company_id = get_user_company_id()
      AND (
        (program_id IS NOT NULL AND user_has_program_access(program_id))
        OR (site_id IN (
          SELECT site_id
          FROM sites
          WHERE company_id = get_user_company_id()
            AND user_has_program_access(program_id)
        ))
      )
  )
);

-- INSERT policies
CREATE POLICY "Super admins can create device commands"
ON device_commands
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can create device commands"
ON device_commands
FOR INSERT
TO authenticated
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- UPDATE policies
CREATE POLICY "Super admins can update all device commands"
ON device_commands
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update device commands"
ON device_commands
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_ALERTS TABLE RLS (UPDATE EXISTING)
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view device alerts in their programs" ON device_alerts;
DROP POLICY IF EXISTS "Admins can resolve device alerts" ON device_alerts;
DROP POLICY IF EXISTS "Super admins can view all device alerts" ON device_alerts;
DROP POLICY IF EXISTS "Users can view device alerts in accessible programs" ON device_alerts;
DROP POLICY IF EXISTS "Super admins can update all device alerts" ON device_alerts;
DROP POLICY IF EXISTS "Company admins can resolve device alerts" ON device_alerts;

-- SELECT policies
CREATE POLICY "Super admins can view all device alerts"
ON device_alerts
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device alerts in accessible programs"
ON device_alerts
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND device_id IN (
    SELECT device_id
    FROM devices
    WHERE company_id = get_user_company_id()
      AND (
        (program_id IS NOT NULL AND user_has_program_access(program_id))
        OR (site_id IN (
          SELECT site_id
          FROM sites
          WHERE company_id = get_user_company_id()
            AND user_has_program_access(program_id)
        ))
      )
  )
);

-- INSERT policy
CREATE POLICY "System can create device alerts"
ON device_alerts
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- UPDATE policies (for resolving alerts)
CREATE POLICY "Super admins can update all device alerts"
ON device_alerts
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can resolve device alerts"
ON device_alerts
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_WAKE_SESSIONS TABLE RLS
-- ==========================================

-- Enable RLS on device_wake_sessions
ALTER TABLE device_wake_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all wake sessions" ON device_wake_sessions;
DROP POLICY IF EXISTS "Users can view wake sessions in accessible programs" ON device_wake_sessions;
DROP POLICY IF EXISTS "System can create wake sessions" ON device_wake_sessions;
DROP POLICY IF EXISTS "System can update wake sessions" ON device_wake_sessions;

-- SELECT policies
CREATE POLICY "Super admins can view all wake sessions"
ON device_wake_sessions
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view wake sessions in accessible programs"
ON device_wake_sessions
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND device_id IN (
    SELECT device_id
    FROM devices
    WHERE company_id = get_user_company_id()
      AND (
        (program_id IS NOT NULL AND user_has_program_access(program_id))
        OR (site_id IN (
          SELECT site_id
          FROM sites
          WHERE company_id = get_user_company_id()
            AND user_has_program_access(program_id)
        ))
      )
  )
);

-- INSERT policy
CREATE POLICY "System can create wake sessions"
ON device_wake_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- UPDATE policy
CREATE POLICY "System can update wake sessions"
ON device_wake_sessions
FOR UPDATE
TO authenticated
USING (
  is_super_admin()
  OR company_id = get_user_company_id()
)
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_HISTORY TABLE RLS
-- ==========================================

-- Enable RLS on device_history
ALTER TABLE device_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all device history" ON device_history;
DROP POLICY IF EXISTS "Users can view device history in accessible programs" ON device_history;
DROP POLICY IF EXISTS "System can create device history" ON device_history;

-- SELECT policies
CREATE POLICY "Super admins can view all device history"
ON device_history
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device history in accessible programs"
ON device_history
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND device_id IN (
    SELECT device_id
    FROM devices
    WHERE company_id = get_user_company_id()
      AND (
        (program_id IS NOT NULL AND user_has_program_access(program_id))
        OR (site_id IN (
          SELECT site_id
          FROM sites
          WHERE company_id = get_user_company_id()
            AND user_has_program_access(program_id)
        ))
      )
  )
);

-- INSERT policy
CREATE POLICY "System can create device history"
ON device_history
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_SITE_ASSIGNMENTS TABLE RLS
-- ==========================================

-- Enable RLS on device_site_assignments if not already enabled
ALTER TABLE device_site_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all device site assignments" ON device_site_assignments;
DROP POLICY IF EXISTS "Users can view device site assignments in accessible programs" ON device_site_assignments;
DROP POLICY IF EXISTS "Super admins can create device site assignments" ON device_site_assignments;
DROP POLICY IF EXISTS "Company admins can create device site assignments" ON device_site_assignments;
DROP POLICY IF EXISTS "Super admins can update all device site assignments" ON device_site_assignments;
DROP POLICY IF EXISTS "Company admins can update device site assignments" ON device_site_assignments;
DROP POLICY IF EXISTS "Super admins can delete all device site assignments" ON device_site_assignments;
DROP POLICY IF EXISTS "Company admins can delete device site assignments" ON device_site_assignments;

-- SELECT policies
CREATE POLICY "Super admins can view all device site assignments"
ON device_site_assignments
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device site assignments in accessible programs"
ON device_site_assignments
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create device site assignments"
ON device_site_assignments
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can create device site assignments"
ON device_site_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- UPDATE policies
CREATE POLICY "Super admins can update all device site assignments"
ON device_site_assignments
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update device site assignments"
ON device_site_assignments
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- DELETE policies
CREATE POLICY "Super admins can delete all device site assignments"
ON device_site_assignments
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can delete device site assignments"
ON device_site_assignments
FOR DELETE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- DEVICE_PROGRAM_ASSIGNMENTS TABLE RLS
-- ==========================================

-- Enable RLS on device_program_assignments
ALTER TABLE device_program_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all device program assignments" ON device_program_assignments;
DROP POLICY IF EXISTS "Users can view device program assignments in accessible programs" ON device_program_assignments;
DROP POLICY IF EXISTS "Super admins can create device program assignments" ON device_program_assignments;
DROP POLICY IF EXISTS "Company admins can create device program assignments" ON device_program_assignments;
DROP POLICY IF EXISTS "Super admins can update all device program assignments" ON device_program_assignments;
DROP POLICY IF EXISTS "Company admins can update device program assignments" ON device_program_assignments;
DROP POLICY IF EXISTS "Super admins can delete all device program assignments" ON device_program_assignments;
DROP POLICY IF EXISTS "Company admins can delete device program assignments" ON device_program_assignments;

-- SELECT policies
CREATE POLICY "Super admins can view all device program assignments"
ON device_program_assignments
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view device program assignments in accessible programs"
ON device_program_assignments
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create device program assignments"
ON device_program_assignments
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can create device program assignments"
ON device_program_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- UPDATE policies
CREATE POLICY "Super admins can update all device program assignments"
ON device_program_assignments
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update device program assignments"
ON device_program_assignments
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- DELETE policies
CREATE POLICY "Super admins can delete all device program assignments"
ON device_program_assignments
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can delete device program assignments"
ON device_program_assignments
FOR DELETE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- ==========================================
-- SITE_PROGRAM_ASSIGNMENTS TABLE RLS
-- ==========================================

-- Enable RLS on site_program_assignments
ALTER TABLE site_program_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all site program assignments" ON site_program_assignments;
DROP POLICY IF EXISTS "Users can view site program assignments in accessible programs" ON site_program_assignments;
DROP POLICY IF EXISTS "Super admins can create site program assignments" ON site_program_assignments;
DROP POLICY IF EXISTS "Company admins can create site program assignments" ON site_program_assignments;
DROP POLICY IF EXISTS "Super admins can update all site program assignments" ON site_program_assignments;
DROP POLICY IF EXISTS "Company admins can update site program assignments" ON site_program_assignments;
DROP POLICY IF EXISTS "Super admins can delete all site program assignments" ON site_program_assignments;
DROP POLICY IF EXISTS "Company admins can delete site program assignments" ON site_program_assignments;

-- SELECT policies
CREATE POLICY "Super admins can view all site program assignments"
ON site_program_assignments
FOR SELECT
TO authenticated
USING (is_super_admin());

CREATE POLICY "Users can view site program assignments in accessible programs"
ON site_program_assignments
FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND user_has_program_access(program_id)
);

-- INSERT policies
CREATE POLICY "Super admins can create site program assignments"
ON site_program_assignments
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can create site program assignments"
ON site_program_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- UPDATE policies
CREATE POLICY "Super admins can update all site program assignments"
ON site_program_assignments
FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Company admins can update site program assignments"
ON site_program_assignments
FOR UPDATE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
)
WITH CHECK (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);

-- DELETE policies
CREATE POLICY "Super admins can delete all site program assignments"
ON site_program_assignments
FOR DELETE
TO authenticated
USING (is_super_admin());

CREATE POLICY "Company admins can delete site program assignments"
ON site_program_assignments
FOR DELETE
TO authenticated
USING (
  user_is_company_admin()
  AND company_id = get_user_company_id()
);
