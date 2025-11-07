/*
  # Create Device Images Table

  1. New Tables
    - `device_images`
      - `image_id` (uuid, primary key)
      - `device_id` (uuid, FK) - Reference to devices table
      - `image_name` (text) - Image filename from device (e.g., "image_001.jpg")
      - `image_url` (text) - Supabase Storage URL after upload
      - `image_size` (integer) - Total image size in bytes
      - `captured_at` (timestamptz) - When device captured the image
      - `received_at` (timestamptz) - When server completed receiving all chunks
      - `total_chunks` (integer) - Expected number of chunks
      - `received_chunks` (integer) - Number of chunks received so far
      - `status` (text) - 'pending', 'receiving', 'complete', 'failed'
      - `error_code` (integer) - Error code if status is 'failed'
      - `retry_count` (integer) - Number of retry attempts
      - `submission_id` (uuid, FK) - Associated submission
      - `observation_id` (uuid) - Associated observation (petri or gasifier)
      - `observation_type` (text) - 'petri' or 'gasifier'
      - `metadata` (jsonb) - Full metadata from device (temp, humidity, etc.)
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record last update timestamp

  2. Security
    - Enable RLS on `device_images` table
    - Add policies for viewing images (users with device access)
    - Images are read-only for users (only system can modify)

  3. Indexes
    - Index on device_id for device-specific queries
    - Index on status for querying pending/failed images
    - Index on captured_at for chronological queries
    - Index on submission_id for linking to submissions
*/

-- Create device_images table
CREATE TABLE IF NOT EXISTS device_images (
  image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  image_name TEXT NOT NULL,
  image_url TEXT,
  image_size INTEGER,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  total_chunks INTEGER,
  received_chunks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'receiving', 'complete', 'failed')),
  error_code INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  submission_id UUID REFERENCES submissions(submission_id) ON DELETE SET NULL,
  observation_id UUID,
  observation_type TEXT CHECK (observation_type IN ('petri', 'gasifier')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_images_device ON device_images(device_id);
CREATE INDEX IF NOT EXISTS idx_device_images_status ON device_images(status);
CREATE INDEX IF NOT EXISTS idx_device_images_captured ON device_images(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_images_submission ON device_images(submission_id);
CREATE INDEX IF NOT EXISTS idx_device_images_device_name ON device_images(device_id, image_name);

-- Enable Row Level Security
ALTER TABLE device_images ENABLE ROW LEVEL SECURITY;

-- Users can view images for devices in their accessible programs
CREATE POLICY "Users can view device images in their programs"
ON device_images
FOR SELECT
TO authenticated
USING (
  device_id IN (
    SELECT device_id
    FROM devices
    WHERE program_id IN (
      SELECT program_id
      FROM program_access
      WHERE user_id = auth.uid()
    )
    OR site_id IN (
      SELECT site_id
      FROM sites
      WHERE program_id IN (
        SELECT program_id
        FROM program_access
        WHERE user_id = auth.uid()
      )
    )
  )
);

-- No INSERT/UPDATE/DELETE policies for users - images are system-managed only
-- Server-side code will use service role key to manage image records

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_device_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_images_updated_at
BEFORE UPDATE ON device_images
FOR EACH ROW
EXECUTE FUNCTION update_device_images_updated_at();

-- Add helpful comments
COMMENT ON TABLE device_images IS 'Tracks chunked image transmission from IoT devices to server';
COMMENT ON COLUMN device_images.image_name IS 'Original filename from device SD card';
COMMENT ON COLUMN device_images.status IS 'pending: awaiting chunks, receiving: in progress, complete: all chunks received, failed: transmission error';
COMMENT ON COLUMN device_images.received_chunks IS 'Count of unique chunk_ids received (used for progress tracking)';
COMMENT ON COLUMN device_images.metadata IS 'Full device metadata including temperature, humidity, pressure, gas_resistance, location';
COMMENT ON COLUMN device_images.observation_id IS 'UUID of petri_observation or gasifier_observation record created from this image';
