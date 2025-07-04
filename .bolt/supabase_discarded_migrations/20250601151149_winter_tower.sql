-- Add Site Templates Table
-- This migration creates a new table for storing default values for submissions at a site level

-- 1. Create site_templates table
CREATE TABLE site_templates (
  template_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  submission_defaults JSONB NOT NULL,
  petri_defaults JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (site_id)
);

-- 2. Add updated_at trigger
CREATE TRIGGER set_updated_at_site_templates
BEFORE UPDATE ON site_templates
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- 3. Enable RLS on site_templates table
ALTER TABLE site_templates ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for site_templates
-- Policy for selecting site templates (same visibility as sites)
CREATE POLICY "site_templates_select_policy" ON site_templates
  FOR SELECT
  USING (
    site_id IN (
      SELECT site_id FROM sites
      WHERE program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid()
      ) OR program_id IN (
        SELECT program_id FROM pilot_programs
        WHERE company_id IN (
          SELECT company_id FROM users
          WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
    )
  );

-- Policy for inserting site templates (Admin or Edit users)
CREATE POLICY "site_templates_insert_policy" ON site_templates
  FOR INSERT
  WITH CHECK (
    site_id IN (
      SELECT sites.site_id FROM sites
      WHERE program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid() 
        AND (role = 'Admin' OR role = 'Edit')
      )
    )
  );

-- Policy for updating site templates (Admin or Edit users)
CREATE POLICY "site_templates_update_policy" ON site_templates
  FOR UPDATE
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      WHERE program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid() 
        AND (role = 'Admin' OR role = 'Edit')
      )
    )
  );

-- Policy for deleting site templates (Admin or Edit users)
CREATE POLICY "site_templates_delete_policy" ON site_templates
  FOR DELETE
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      WHERE program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid() 
        AND (role = 'Admin' OR role = 'Edit')
      )
    )
  );

-- 5. Create function to get site template
CREATE OR REPLACE FUNCTION get_site_template(site_id_param UUID)
RETURNS TABLE (
  template_id UUID,
  site_id UUID,
  submission_defaults JSONB,
  petri_defaults JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID
) LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return the site template
  RETURN QUERY
  SELECT st.* 
  FROM site_templates st
  WHERE st.site_id = site_id_param;
END;
$$;

-- 6. Create function to upsert site template
CREATE OR REPLACE FUNCTION upsert_site_template(
  p_site_id UUID,
  p_submission_defaults JSONB,
  p_petri_defaults JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template_id UUID;
  v_result JSONB;
BEGIN
  -- Check if the user has permission (Admin or Edit role for the program)
  IF NOT EXISTS (
    SELECT 1 
    FROM sites s
    JOIN pilot_program_users ppu ON s.program_id = ppu.program_id
    WHERE s.site_id = p_site_id
    AND ppu.user_id = auth.uid()
    AND (ppu.role = 'Admin' OR ppu.role = 'Edit')
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient permissions');
  END IF;
  
  -- Upsert the template
  INSERT INTO site_templates (
    site_id, 
    submission_defaults, 
    petri_defaults,
    created_by
  )
  VALUES (
    p_site_id,
    p_submission_defaults,
    p_petri_defaults,
    auth.uid()
  )
  ON CONFLICT (site_id) 
  DO UPDATE SET 
    submission_defaults = p_submission_defaults,
    petri_defaults = p_petri_defaults,
    updated_at = NOW()
  RETURNING template_id INTO v_template_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true, 
    'template_id', v_template_id,
    'message', 'Site template saved successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 7. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_site_template(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_site_template(UUID, JSONB, JSONB) TO authenticated;

-- 8. Add comments for documentation
COMMENT ON TABLE site_templates IS 'Stores default values for submissions and petri observations for each site';
COMMENT ON COLUMN site_templates.submission_defaults IS 'JSONB object containing default values for submissions';
COMMENT ON COLUMN site_templates.petri_defaults IS 'JSONB array of objects containing default values for petri observations';