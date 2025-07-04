-- GRMTek Sporeless Pilot Program Schema
-- This script sets up all tables, relationships, triggers, and metadata for the application

-- Create ENUMs for constrained choices
CREATE TYPE site_type_enum AS ENUM ('Greenhouse', 'Storage', 'Transport', 'Production Facility');
CREATE TYPE program_status_enum AS ENUM ('active', 'inactive');
CREATE TYPE airflow_enum AS ENUM ('Open', 'Closed');
CREATE TYPE odor_distance_enum AS ENUM ('5-10ft', '10-25ft', '25-50ft', '50-100ft', '>100ft');
CREATE TYPE weather_enum AS ENUM ('Clear', 'Cloudy', 'Rain');
CREATE TYPE plant_type_enum AS ENUM (
  'Ornamental Annual', 'Ornamental Perennial', 'Edible Flower', 
  'Bulb Flower', 'Other Flower', 'Leafy Greens', 'Fruiting Crop', 
  'Vegetable', 'Root Vegetable', 'Other Fresh Perishable'
);
CREATE TYPE water_schedule_enum AS ENUM (
  'Daily', 'Every Other Day', 'Every Third Day', 'Twice Daily', 'Thrice Daily'
);
CREATE TYPE user_role_enum AS ENUM ('Edit', 'Respond');
CREATE TYPE fungicide_used_enum AS ENUM ('Yes', 'No');

-- Create pilot_programs table
CREATE TABLE pilot_programs (
  program_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status program_status_enum NOT NULL,
  total_submissions INTEGER DEFAULT 0,
  total_sites INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create sites table
CREATE TABLE sites (
  site_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type site_type_enum NOT NULL,
  total_petris INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create submissions table
CREATE TABLE submissions (
  submission_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  temperature NUMERIC(5, 2) NOT NULL,
  humidity NUMERIC(5, 2) NOT NULL,
  airflow airflow_enum NOT NULL,
  odor_distance odor_distance_enum NOT NULL,
  weather weather_enum NOT NULL,
  notes VARCHAR(255),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create petri_observations table
CREATE TABLE petri_observations (
  observation_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  petri_code VARCHAR(50) NOT NULL,
  image_url TEXT NOT NULL,
  plant_type plant_type_enum NOT NULL,
  watering_schedule VARCHAR(100) NOT NULL,
  fungicide_used fungicide_used_enum NOT NULL,
  surrounding_water_schedule water_schedule_enum NOT NULL,
  notes VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create pilot_program_users junction table for access control
CREATE TABLE pilot_program_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES pilot_programs(program_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role_enum NOT NULL DEFAULT 'Respond',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (program_id, user_id)
);

-- Add column update triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_pilot_programs
BEFORE UPDATE ON pilot_programs
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_updated_at_sites
BEFORE UPDATE ON sites
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_updated_at_submissions
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_updated_at_petri_observations
BEFORE UPDATE ON petri_observations
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- Add program_id to submissions when inserted
CREATE OR REPLACE FUNCTION set_submission_program_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT program_id INTO NEW.program_id FROM sites WHERE site_id = NEW.site_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_submission_program_id
BEFORE INSERT ON submissions
FOR EACH ROW
EXECUTE PROCEDURE set_submission_program_id();

-- Add site_id to petri_observations when inserted
CREATE OR REPLACE FUNCTION set_petri_site_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT site_id INTO NEW.site_id FROM submissions WHERE submission_id = NEW.submission_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_petri_site_id
BEFORE INSERT ON petri_observations
FOR EACH ROW
EXECUTE PROCEDURE set_petri_site_id();

-- Create function for updating status based on date
CREATE OR REPLACE FUNCTION update_program_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_date <= CURRENT_DATE AND NEW.end_date >= CURRENT_DATE THEN
    NEW.status := 'active';
  ELSE
    NEW.status := 'inactive';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_program_status
BEFORE INSERT OR UPDATE OF start_date, end_date ON pilot_programs
FOR EACH ROW
EXECUTE PROCEDURE update_program_status();

-- Create functions for incrementing counters
CREATE OR REPLACE FUNCTION increment_pilot_program_sites(p_program_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE pilot_programs
  SET total_sites = total_sites + 1
  WHERE program_id = p_program_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_pilot_program_submissions(p_program_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE pilot_programs
  SET total_submissions = total_submissions + 1
  WHERE program_id = p_program_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_site_petris(s_site_id UUID, petri_count INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE sites
  SET total_petris = total_petris + petri_count
  WHERE site_id = s_site_id;
END;
$$ LANGUAGE plpgsql;

-- Create storage bucket for petri images using direct INSERT
-- First create the bucket
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('petri-images', 'petri-images', TRUE, FALSE, NULL, NULL);

-- Add comments for documentation
COMMENT ON TABLE pilot_programs IS 'Parent table storing Pilot Program details.';
COMMENT ON TABLE sites IS 'Stores sites within a Pilot Program.';
COMMENT ON TABLE submissions IS 'Stores submissions per site, including temp/RH data.';
COMMENT ON TABLE petri_observations IS 'Stores petri images and observations per submission.';
COMMENT ON TABLE pilot_program_users IS 'Junction table linking users to accessible Pilot Programs.';

COMMENT ON COLUMN pilot_programs.program_id IS 'Unique identifier (UUID).';
COMMENT ON COLUMN pilot_programs.name IS 'Pilot Program name.';
COMMENT ON COLUMN pilot_programs.description IS 'Program description.';
COMMENT ON COLUMN pilot_programs.start_date IS 'Start date.';
COMMENT ON COLUMN pilot_programs.end_date IS 'End date.';
COMMENT ON COLUMN pilot_programs.status IS 'Status (active/inactive).';
COMMENT ON COLUMN pilot_programs.total_submissions IS 'Roll-up count of submissions across all child sites.';
COMMENT ON COLUMN pilot_programs.total_sites IS 'Roll-up count of sites in the program.';

COMMENT ON COLUMN sites.program_id IS 'FK to pilot_programs.program_id.';
COMMENT ON COLUMN submissions.site_id IS 'FK to sites.site_id.';
COMMENT ON COLUMN petri_observations.submission_id IS 'FK to submissions.submission_id.';
COMMENT ON COLUMN pilot_program_users.program_id IS 'FK to pilot_programs.program_id.';
COMMENT ON COLUMN pilot_program_users.user_id IS 'FK to auth.users.id.';

-- Create Row Level Security policies
-- Enable RLS on all tables
ALTER TABLE pilot_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE petri_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_program_users ENABLE ROW LEVEL SECURITY;

-- Policy for pilot_programs - user can only see programs they have access to
CREATE POLICY pilot_programs_policy ON pilot_programs
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  );

-- Policy for sites - user can only see sites of programs they have access to
CREATE POLICY sites_policy ON sites
  USING (
    program_id IN (
      SELECT program_id FROM pilot_program_users
      WHERE user_id = auth.uid()
    )
  );

-- Policy for submissions - user can only see submissions of sites they have access to
CREATE POLICY submissions_policy ON submissions
  USING (
    site_id IN (
      SELECT sites.site_id FROM sites
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    )
  );

-- Policy for petri_observations - user can only see observations of submissions they have access to
CREATE POLICY petri_observations_policy ON petri_observations
  USING (
    submission_id IN (
      SELECT submissions.submission_id FROM submissions
      JOIN sites ON submissions.site_id = sites.site_id
      JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
      WHERE pilot_program_users.user_id = auth.uid()
    )
  );

-- Policy for pilot_program_users - user can only see their own records
CREATE POLICY pilot_program_users_policy ON pilot_program_users
  USING (user_id = auth.uid());

-- Insert policies for users with 'Edit' role
CREATE POLICY pilot_programs_insert ON pilot_programs FOR INSERT WITH CHECK (TRUE);

CREATE POLICY sites_insert ON sites FOR INSERT WITH CHECK (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Edit'
  )
);

CREATE POLICY submissions_insert ON submissions FOR INSERT WITH CHECK (
  site_id IN (
    SELECT sites.site_id FROM sites
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
  )
);

CREATE POLICY petri_observations_insert ON petri_observations FOR INSERT WITH CHECK (
  submission_id IN (
    SELECT submissions.submission_id FROM submissions
    JOIN sites ON submissions.site_id = sites.site_id
    JOIN pilot_program_users ON sites.program_id = pilot_program_users.program_id
    WHERE pilot_program_users.user_id = auth.uid()
  )
);

CREATE POLICY pilot_program_users_insert ON pilot_program_users FOR INSERT WITH CHECK (
  program_id IN (
    SELECT program_id FROM pilot_program_users
    WHERE user_id = auth.uid() AND role = 'Edit'
  )
);

-- Create storage policies for the petri-images bucket
-- Policy for authenticated users to insert objects
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'petri-images' AND
    auth.role() = 'authenticated'
  );

-- Policy for authenticated users to select objects
CREATE POLICY "Authenticated users can view" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'petri-images' AND
    auth.role() = 'authenticated'
  );

-- Policy for public access to view objects
CREATE POLICY "Public can view" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'petri-images'
  );