/*
  # Device Images Storage Bucket

  1. Purpose
    - Create Supabase Storage bucket for device-captured images
    - Set up RLS policies for company-scoped access
    - Enable secure image storage with hierarchical organization

  2. Bucket Structure
    - Bucket: `device-images`
    - Path: `{company_id}/{site_id}/{device_mac}/{image_name}`
    - Example: `abc123/site456/AA:BB:CC:DD:EE:FF/image_001_20251111_120000.jpg`

  3. Security
    - Authenticated users can view images from their company
    - Service role has full access for edge function uploads
    - Public access disabled (authentication required)

  4. Benefits
    - Company data isolation at storage level
    - Easy querying by company/site/device
    - Support for multi-tenancy
    - Audit trail via path structure
*/

-- ==========================================
-- CREATE STORAGE BUCKET
-- ==========================================

-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'device-images',
  'device-images',
  false, -- Not public, requires authentication
  5242880, -- 5MB max file size
  ARRAY['image/jpeg', 'image/jpg', 'image/png'] -- Allowed formats
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png'];

-- ==========================================
-- STORAGE RLS POLICIES
-- ==========================================

-- Policy 1: Authenticated users can view images in their company
CREATE POLICY "Users can view device images in their company"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'device-images'
  AND (
    -- Extract company_id from path (first segment)
    -- Path format: company_id/site_id/device_mac/image_name
    (string_to_array(name, '/'))[1]::uuid = get_active_company_id()::uuid
  )
);

-- Policy 2: Service role can manage all device images
CREATE POLICY "Service role can manage all device images"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'device-images')
WITH CHECK (bucket_id = 'device-images');

-- Policy 3: Authenticated users can upload images to their company folder
-- (Future: if we want users to manually upload)
CREATE POLICY "Users can upload images to their company folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'device-images'
  AND (string_to_array(name, '/'))[1]::uuid = get_active_company_id()::uuid
);

-- Policy 4: Authenticated users can update images in their company folder
CREATE POLICY "Users can update images in their company folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'device-images'
  AND (string_to_array(name, '/'))[1]::uuid = get_active_company_id()::uuid
)
WITH CHECK (
  bucket_id = 'device-images'
  AND (string_to_array(name, '/'))[1]::uuid = get_active_company_id()::uuid
);

-- Policy 5: Authenticated users can delete images in their company folder
CREATE POLICY "Users can delete images in their company folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'device-images'
  AND (string_to_array(name, '/'))[1]::uuid = get_active_company_id()::uuid
);

-- ==========================================
-- HELPER FUNCTIONS FOR STORAGE
-- ==========================================

-- Function to build storage path
CREATE OR REPLACE FUNCTION fn_build_device_image_path(
  p_company_id UUID,
  p_site_id UUID,
  p_device_mac TEXT,
  p_image_name TEXT
)
RETURNS TEXT AS $$
BEGIN
  -- Build hierarchical path: company/site/device/image
  RETURN format(
    '%s/%s/%s/%s',
    p_company_id,
    p_site_id,
    p_device_mac,
    p_image_name
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION fn_build_device_image_path TO authenticated, service_role;

COMMENT ON FUNCTION fn_build_device_image_path IS
'Build hierarchical storage path for device image: company_id/site_id/device_mac/image_name';

-- Function to extract company_id from storage path
CREATE OR REPLACE FUNCTION fn_extract_company_from_path(p_path TEXT)
RETURNS UUID AS $$
BEGIN
  -- Extract first segment (company_id) from path
  RETURN (string_to_array(p_path, '/'))[1]::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION fn_extract_company_from_path TO authenticated, service_role;

COMMENT ON FUNCTION fn_extract_company_from_path IS
'Extract company_id from device image storage path';

-- ==========================================
-- INDEXES AND CONSTRAINTS
-- ==========================================

-- Add index on device_images.image_url for fast lookups
CREATE INDEX IF NOT EXISTS idx_device_images_url ON device_images(image_url) WHERE image_url IS NOT NULL;

-- Add check constraint to ensure image_url uses correct bucket
ALTER TABLE device_images
DROP CONSTRAINT IF EXISTS chk_device_images_url_bucket;

ALTER TABLE device_images
ADD CONSTRAINT chk_device_images_url_bucket
CHECK (
  image_url IS NULL
  OR image_url LIKE '%/storage/v1/object/public/device-images/%'
  OR image_url LIKE '%/storage/v1/object/sign/device-images/%'
);

COMMENT ON CONSTRAINT chk_device_images_url_bucket ON device_images IS
'Ensure image_url points to device-images bucket in Supabase Storage';
