# APPLY THIS FIX NOW

## The Error You're Seeing
```
ERROR: 42703: column d.mapped_at does not exist
```

## The Fix (5 minutes)

### Go here right now:
https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

### Copy and paste this ENTIRE SQL script:

```sql
/*
  # Add Missing Columns to Devices Table
  Fixes: ERROR: 42703: column d.mapped_at does not exist
*/

-- Add mapped_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'mapped_at'
  ) THEN
    ALTER TABLE devices ADD COLUMN mapped_at TIMESTAMPTZ;
    COMMENT ON COLUMN devices.mapped_at IS 'Timestamp when device was mapped to a site by an administrator';
  END IF;
END $$;

-- Add mapped_by_user_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'mapped_by_user_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN mapped_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    COMMENT ON COLUMN devices.mapped_by_user_id IS 'User who mapped the device to a site';
  END IF;
END $$;

-- Add provisioning_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'provisioning_status'
  ) THEN
    ALTER TABLE devices ADD COLUMN provisioning_status TEXT DEFAULT 'pending_mapping';
    ALTER TABLE devices ADD CONSTRAINT devices_provisioning_status_check
      CHECK (provisioning_status IN ('pending_mapping', 'mapped', 'active', 'inactive'));
    COMMENT ON COLUMN devices.provisioning_status IS 'Device provisioning state: pending_mapping (awaiting admin assignment), mapped (assigned to site), active (operational), inactive (disabled)';
  END IF;
END $$;

-- Add device_reported_site_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_reported_site_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_reported_site_id TEXT;
    COMMENT ON COLUMN devices.device_reported_site_id IS 'Site ID as reported by device firmware (may not match actual site_id)';
  END IF;
END $$;

-- Add device_reported_location column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_reported_location'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_reported_location TEXT;
    COMMENT ON COLUMN devices.device_reported_location IS 'Location string as reported by device firmware';
  END IF;
END $$;

-- Create index on provisioning_status
CREATE INDEX IF NOT EXISTS idx_devices_provisioning_status ON devices(provisioning_status);

-- Update existing devices to set provisioning_status
UPDATE devices
SET provisioning_status = 'mapped',
    mapped_at = created_at
WHERE site_id IS NOT NULL
  AND (provisioning_status IS NULL OR provisioning_status = 'pending_mapping');

UPDATE devices
SET provisioning_status = 'active'
WHERE site_id IS NOT NULL
  AND is_active = true
  AND provisioning_status = 'mapped';

UPDATE devices
SET provisioning_status = 'inactive'
WHERE is_active = false
  AND (provisioning_status IS NULL OR provisioning_status != 'inactive');
```

### Click "RUN"

That's it! The error should be fixed.

---

## After Step 1 Works, Do This (Step 2)

### Populate the junction tables:

```sql
-- Add device_code column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'device_code'
  ) THEN
    ALTER TABLE devices ADD COLUMN device_code TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);
  END IF;
END $$;

-- Migrate device-site assignments
INSERT INTO device_site_assignments (
  device_id, site_id, program_id, is_primary, is_active, assigned_at, assigned_by_user_id
)
SELECT
  d.device_id, d.site_id, d.program_id, true, d.is_active,
  COALESCE(d.mapped_at, d.created_at), d.mapped_by_user_id
FROM devices d
WHERE d.site_id IS NOT NULL AND d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate device-program assignments
INSERT INTO device_program_assignments (
  device_id, program_id, is_primary, is_active, assigned_at, assigned_by_user_id
)
SELECT
  d.device_id, d.program_id, true, d.is_active,
  COALESCE(d.mapped_at, d.created_at), d.mapped_by_user_id
FROM devices d
WHERE d.program_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate site-program assignments
INSERT INTO site_program_assignments (
  site_id, program_id, is_primary, is_active, assigned_at
)
SELECT s.site_id, s.program_id, true, true, s.created_at
FROM sites s
WHERE s.program_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

---

## Verify It Worked

Run: `node verify-device-columns.mjs`

You should see all ✅ checkmarks.

---

**Questions?** See `FIX_DEVICE_SCHEMA_ERROR.md` for the full explanation.
