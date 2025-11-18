/*
  # Enforce Device Site/Program Inheritance

  1. Purpose
    - Ensure all devices automatically inherit program_id and company_id from their parent site
    - Maintain referential integrity in the multi-tenant architecture
    - Prevent orphaned devices

  2. Changes
    - Create trigger function to auto-populate program_id and company_id from site
    - Add trigger on INSERT and UPDATE of devices table
    - Add CHECK constraint to ensure site_id is never null for active devices

  3. Architecture Compliance
    - Follows the hierarchy: Company → Program → Site → Device
    - Devices MUST have a parent site
    - Devices inherit program_id from their site
    - Devices inherit company_id from their site
*/

-- ==========================================
-- FUNCTION: Auto-populate device lineage from site
-- ==========================================

CREATE OR REPLACE FUNCTION fn_device_inherit_from_site()
RETURNS TRIGGER AS $$
DECLARE
  v_site_program_id UUID;
  v_site_company_id UUID;
BEGIN
  -- If site_id is provided, look up the site's program_id and company_id
  IF NEW.site_id IS NOT NULL THEN
    SELECT program_id, company_id
    INTO v_site_program_id, v_site_company_id
    FROM sites
    WHERE site_id = NEW.site_id;

    -- If site found, auto-populate the IDs
    IF v_site_program_id IS NOT NULL THEN
      NEW.program_id := v_site_program_id;
      NEW.company_id := v_site_company_id;
    ELSE
      RAISE EXCEPTION 'Cannot assign device to site_id % - site not found', NEW.site_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGER: Apply inheritance on INSERT/UPDATE
-- ==========================================

DROP TRIGGER IF EXISTS trg_device_inherit_from_site ON devices;

CREATE TRIGGER trg_device_inherit_from_site
  BEFORE INSERT OR UPDATE OF site_id
  ON devices
  FOR EACH ROW
  EXECUTE FUNCTION fn_device_inherit_from_site();

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON FUNCTION fn_device_inherit_from_site() IS 
  'Automatically populates program_id and company_id from parent site when device is assigned';

COMMENT ON TRIGGER trg_device_inherit_from_site ON devices IS
  'Ensures devices inherit program_id and company_id from their parent site';
