/*
  # Add Junction Tables and Device/Site Codes

  1. New Fields
    - Add `device_code` to devices table (human-readable unique identifier)
    - Add `site_code` to sites table (human-readable unique identifier)

  2. New Tables - Junction Tables for Many-to-Many Relationships
    - `device_site_assignments` - Tracks device assignments to sites over time
    - `device_program_assignments` - Tracks device assignments to programs over time
    - `site_program_assignments` - Tracks site assignments to programs over time

  3. Purpose
    - Enable devices to be assigned to multiple sites and programs over time
    - Enable sites to be reused across multiple programs
    - Maintain complete assignment history for analytics
    - Support field provisioning where devices are registered without site assignment
    - Provide human-readable codes for devices and sites

  4. Security
    - Enable RLS on all junction tables
    - Add policies matching existing device/site security model
    - Ensure multi-tenant data isolation

  5. Backward Compatibility
    - Keep existing device.site_id and device.program_id as primary assignment references
    - These will be synced with junction tables via triggers
*/

-- ============================================
-- STEP 1: Add Code Fields
-- ============================================

-- Add device_code to devices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_code'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_code TEXT UNIQUE;
  END IF;
END $$;

-- Add site_code to sites table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'site_code'
  ) THEN
    ALTER TABLE sites ADD COLUMN site_code TEXT UNIQUE;
  END IF;
END $$;

-- Create index on device_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);

-- Create index on site_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_sites_site_code ON sites(site_code);

-- Add comments
COMMENT ON COLUMN devices.device_code IS 'Human-readable unique device identifier (e.g., ESP32-CAM-001)';
COMMENT ON COLUMN sites.site_code IS 'Human-readable unique site identifier for easy reference';

-- ============================================
-- STEP 2: Create Junction Tables
-- ============================================

-- Device-Site Assignment Junction Table
CREATE TABLE IF NOT EXISTS device_site_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  unassigned_at TIMESTAMPTZ,
  unassigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT check_unassigned_after_assigned CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at),
  CONSTRAINT check_active_not_unassigned CHECK (NOT (is_active = true AND unassigned_at IS NOT NULL))
);

-- Device-Program Assignment Junction Table
CREATE TABLE IF NOT EXISTS device_program_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  unassigned_at TIMESTAMPTZ,
  unassigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT check_program_unassigned_after_assigned CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at),
  CONSTRAINT check_program_active_not_unassigned CHECK (NOT (is_active = true AND unassigned_at IS NOT NULL))
);

-- Site-Program Assignment Junction Table
CREATE TABLE IF NOT EXISTS site_program_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  unassigned_at TIMESTAMPTZ,
  unassigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT check_site_program_unassigned_after_assigned CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at),
  CONSTRAINT check_site_program_active_not_unassigned CHECK (NOT (is_active = true AND unassigned_at IS NOT NULL))
);

-- ============================================
-- STEP 3: Create Indexes for Performance
-- ============================================

-- Device-Site Assignment Indexes
CREATE INDEX IF NOT EXISTS idx_device_site_assignments_device ON device_site_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_site_assignments_site ON device_site_assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_device_site_assignments_program ON device_site_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_device_site_assignments_active ON device_site_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_device_site_assignments_primary ON device_site_assignments(device_id, is_primary) WHERE is_primary = true;

-- Device-Program Assignment Indexes
CREATE INDEX IF NOT EXISTS idx_device_program_assignments_device ON device_program_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_program_assignments_program ON device_program_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_device_program_assignments_active ON device_program_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_device_program_assignments_primary ON device_program_assignments(device_id, is_primary) WHERE is_primary = true;

-- Site-Program Assignment Indexes
CREATE INDEX IF NOT EXISTS idx_site_program_assignments_site ON site_program_assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_site_program_assignments_program ON site_program_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_site_program_assignments_active ON site_program_assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_site_program_assignments_primary ON site_program_assignments(site_id, is_primary) WHERE is_primary = true;

-- ============================================
-- STEP 4: Enable Row Level Security
-- ============================================

ALTER TABLE device_site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_program_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: Create RLS Policies
-- ============================================

-- Device-Site Assignments: Users can view assignments for devices in their programs
CREATE POLICY "Users can view device-site assignments in their programs"
ON device_site_assignments
FOR SELECT
TO authenticated
USING (
  program_id IN (
    SELECT program_id
    FROM pilot_program_users
    WHERE user_id = auth.uid()
  )
);

-- Device-Site Assignments: Company admins can create assignments
CREATE POLICY "Company admins can create device-site assignments"
ON device_site_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Device-Site Assignments: Company admins can update assignments
CREATE POLICY "Company admins can update device-site assignments"
ON device_site_assignments
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Device-Site Assignments: Company admins can delete assignments
CREATE POLICY "Company admins can delete device-site assignments"
ON device_site_assignments
FOR DELETE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Device-Program Assignments: Users can view assignments for their programs
CREATE POLICY "Users can view device-program assignments in their programs"
ON device_program_assignments
FOR SELECT
TO authenticated
USING (
  program_id IN (
    SELECT program_id
    FROM pilot_program_users
    WHERE user_id = auth.uid()
  )
);

-- Device-Program Assignments: Company admins can create assignments
CREATE POLICY "Company admins can create device-program assignments"
ON device_program_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Device-Program Assignments: Company admins can update assignments
CREATE POLICY "Company admins can update device-program assignments"
ON device_program_assignments
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Device-Program Assignments: Company admins can delete assignments
CREATE POLICY "Company admins can delete device-program assignments"
ON device_program_assignments
FOR DELETE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Site-Program Assignments: Users can view assignments for their programs
CREATE POLICY "Users can view site-program assignments in their programs"
ON site_program_assignments
FOR SELECT
TO authenticated
USING (
  program_id IN (
    SELECT program_id
    FROM pilot_program_users
    WHERE user_id = auth.uid()
  )
);

-- Site-Program Assignments: Company admins can create assignments
CREATE POLICY "Company admins can create site-program assignments"
ON site_program_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Site-Program Assignments: Company admins can update assignments
CREATE POLICY "Company admins can update site-program assignments"
ON site_program_assignments
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- Site-Program Assignments: Company admins can delete assignments
CREATE POLICY "Company admins can delete site-program assignments"
ON site_program_assignments
FOR DELETE
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM users WHERE is_company_admin = true
  )
);

-- ============================================
-- STEP 6: Create Update Triggers
-- ============================================

-- Trigger for device_site_assignments updated_at
CREATE OR REPLACE FUNCTION update_device_site_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_site_assignments_updated_at
BEFORE UPDATE ON device_site_assignments
FOR EACH ROW
EXECUTE FUNCTION update_device_site_assignments_updated_at();

-- Trigger for device_program_assignments updated_at
CREATE OR REPLACE FUNCTION update_device_program_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_program_assignments_updated_at
BEFORE UPDATE ON device_program_assignments
FOR EACH ROW
EXECUTE FUNCTION update_device_program_assignments_updated_at();

-- Trigger for site_program_assignments updated_at
CREATE OR REPLACE FUNCTION update_site_program_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_site_program_assignments_updated_at
BEFORE UPDATE ON site_program_assignments
FOR EACH ROW
EXECUTE FUNCTION update_site_program_assignments_updated_at();

-- ============================================
-- STEP 7: Migrate Existing Data
-- ============================================

-- Migrate existing device assignments to junction tables
INSERT INTO device_site_assignments (
  device_id,
  site_id,
  program_id,
  is_primary,
  is_active,
  assigned_at,
  assigned_by_user_id
)
SELECT
  d.device_id,
  d.site_id,
  d.program_id,
  true, -- is_primary
  d.is_active, -- match device active status
  COALESCE(d.mapped_at, d.created_at), -- use mapped_at or created_at as assigned_at
  d.mapped_by_user_id
FROM devices d
WHERE d.site_id IS NOT NULL AND d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate existing device-program relationships
INSERT INTO device_program_assignments (
  device_id,
  program_id,
  is_primary,
  is_active,
  assigned_at,
  assigned_by_user_id
)
SELECT
  d.device_id,
  d.program_id,
  true, -- is_primary
  d.is_active,
  COALESCE(d.mapped_at, d.created_at),
  d.mapped_by_user_id
FROM devices d
WHERE d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate existing site-program relationships
INSERT INTO site_program_assignments (
  site_id,
  program_id,
  is_primary,
  is_active,
  assigned_at
)
SELECT
  s.site_id,
  s.program_id,
  true, -- is_primary
  true, -- is_active
  s.created_at
FROM sites s
WHERE s.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 8: Add Helpful Comments
-- ============================================

COMMENT ON TABLE device_site_assignments IS 'Junction table tracking device assignments to sites over time, supporting many-to-many relationships and complete history';
COMMENT ON TABLE device_program_assignments IS 'Junction table tracking device assignments to programs over time, supporting many-to-many relationships';
COMMENT ON TABLE site_program_assignments IS 'Junction table tracking site assignments to programs, enabling site reuse across programs';

COMMENT ON COLUMN device_site_assignments.is_primary IS 'Indicates if this is the primary/default site assignment for the device';
COMMENT ON COLUMN device_site_assignments.is_active IS 'Whether this assignment is currently active (only one primary active assignment should exist per device)';
COMMENT ON COLUMN device_site_assignments.reason IS 'Reason for assignment or reassignment (e.g., "Initial deployment", "Site relocation")';

COMMENT ON COLUMN device_program_assignments.is_primary IS 'Indicates if this is the primary program assignment for the device';
COMMENT ON COLUMN device_program_assignments.is_active IS 'Whether this assignment is currently active';

COMMENT ON COLUMN site_program_assignments.is_primary IS 'Indicates if this is the primary program for the site';
COMMENT ON COLUMN site_program_assignments.is_active IS 'Whether this assignment is currently active';
