/*
  # Add Colony Detection Tracking System

  This migration adds granular per-colony tracking for the new Roboflow
  find-molds workflow, which returns individual mold detections with
  bounding boxes, confidence scores, and an annotated output image.

  1. New Columns on `device_images`
    - `annotated_image_url` (text) - URL to Roboflow-generated highlighted image
    - `find_molds_response` (jsonb) - Full raw response from find-molds workflow
    - `avg_colony_confidence` (numeric) - Average confidence across all detections
    - `colony_image_width` (integer) - Source image width from response
    - `colony_image_height` (integer) - Source image height from response

  2. New Tables
    - `colony_detection_details` - One row per individual mold detection per image
      Stores bounding box, confidence, and optional track assignment
    - `colony_tracks` - Represents a single colony tracked across multiple images
      over time based on spatial position matching

  3. Security
    - RLS enabled on both new tables
    - Policies mirror device_images: read access for active company users,
      write access for maintenance role, delete for sysAdmin

  4. Indexes
    - colony_detection_details: (device_id, captured_at), (image_id), (track_id)
    - colony_tracks: (device_id, status)

  5. Important Notes
    - All changes are additive; no existing columns or tables are modified
    - colony_detection_details stores denormalized device_id and captured_at
      from the parent image for efficient time-range queries without joins
    - The track_id on colony_detection_details is nullable; it is populated
      after the spatial matching function runs
*/

-- =====================================================
-- 1. Add new columns to device_images
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'annotated_image_url'
  ) THEN
    ALTER TABLE device_images ADD COLUMN annotated_image_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'find_molds_response'
  ) THEN
    ALTER TABLE device_images ADD COLUMN find_molds_response jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'avg_colony_confidence'
  ) THEN
    ALTER TABLE device_images ADD COLUMN avg_colony_confidence numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'colony_image_width'
  ) THEN
    ALTER TABLE device_images ADD COLUMN colony_image_width integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'colony_image_height'
  ) THEN
    ALTER TABLE device_images ADD COLUMN colony_image_height integer;
  END IF;
END $$;

-- =====================================================
-- 2. Create colony_tracks table (must exist before
--    colony_detection_details which references it)
-- =====================================================

CREATE TABLE IF NOT EXISTS colony_tracks (
  track_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(device_id),
  company_id uuid NOT NULL,
  first_seen_image_id uuid REFERENCES device_images(image_id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  detection_count integer NOT NULL DEFAULT 1,
  initial_area numeric NOT NULL DEFAULT 0,
  latest_area numeric NOT NULL DEFAULT 0,
  growth_factor numeric DEFAULT 1.0,
  avg_x numeric NOT NULL DEFAULT 0,
  avg_y numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  consecutive_misses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE colony_tracks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_colony_tracks_device_status
  ON colony_tracks (device_id, status);

CREATE INDEX IF NOT EXISTS idx_colony_tracks_company
  ON colony_tracks (company_id);

-- =====================================================
-- 3. Create colony_detection_details table
-- =====================================================

CREATE TABLE IF NOT EXISTS colony_detection_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id text,
  image_id uuid NOT NULL REFERENCES device_images(image_id),
  device_id uuid NOT NULL REFERENCES devices(device_id),
  company_id uuid NOT NULL,
  track_id uuid REFERENCES colony_tracks(track_id),
  x numeric NOT NULL,
  y numeric NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  area numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  class text NOT NULL DEFAULT 'mold',
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE colony_detection_details ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_colony_detections_device_time
  ON colony_detection_details (device_id, captured_at);

CREATE INDEX IF NOT EXISTS idx_colony_detections_image
  ON colony_detection_details (image_id);

CREATE INDEX IF NOT EXISTS idx_colony_detections_track
  ON colony_detection_details (track_id)
  WHERE track_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_colony_detections_company
  ON colony_detection_details (company_id);

-- =====================================================
-- 4. RLS Policies for colony_tracks
-- =====================================================

CREATE POLICY "Users can view colony tracks in active company"
  ON colony_tracks FOR SELECT
  TO authenticated
  USING (is_user_active() AND company_id = get_active_company_id());

CREATE POLICY "Admins can create colony tracks"
  ON colony_tracks FOR INSERT
  TO authenticated
  WITH CHECK (is_user_active() AND has_role('maintenance'::user_role) AND company_id = get_active_company_id());

CREATE POLICY "Admins can update colony tracks in active company"
  ON colony_tracks FOR UPDATE
  TO authenticated
  USING (is_user_active() AND has_role('maintenance'::user_role) AND company_id = get_active_company_id())
  WITH CHECK (is_user_active() AND has_role('maintenance'::user_role) AND company_id = get_active_company_id());

CREATE POLICY "SysAdmins can delete colony tracks in active company"
  ON colony_tracks FOR DELETE
  TO authenticated
  USING (is_user_active() AND has_role('sysAdmin'::user_role) AND company_id = get_active_company_id());

-- =====================================================
-- 5. RLS Policies for colony_detection_details
-- =====================================================

CREATE POLICY "Users can view colony detections in active company"
  ON colony_detection_details FOR SELECT
  TO authenticated
  USING (is_user_active() AND company_id = get_active_company_id());

CREATE POLICY "Admins can create colony detections"
  ON colony_detection_details FOR INSERT
  TO authenticated
  WITH CHECK (is_user_active() AND has_role('maintenance'::user_role) AND company_id = get_active_company_id());

CREATE POLICY "Admins can update colony detections in active company"
  ON colony_detection_details FOR UPDATE
  TO authenticated
  USING (is_user_active() AND has_role('maintenance'::user_role) AND company_id = get_active_company_id())
  WITH CHECK (is_user_active() AND has_role('maintenance'::user_role) AND company_id = get_active_company_id());

CREATE POLICY "SysAdmins can delete colony detections in active company"
  ON colony_detection_details FOR DELETE
  TO authenticated
  USING (is_user_active() AND has_role('sysAdmin'::user_role) AND company_id = get_active_company_id());
