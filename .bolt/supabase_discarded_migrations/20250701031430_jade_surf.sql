/*
  # Image Analysis Features
  
  1. New Features
    - Create RPC function to fetch image observations from both petri and gasifier tables
    - Create user_analysis_images table for storing user workspace images
    - Create storage bucket and policies for analysis images
    
  2. Purpose
    - Enable comprehensive image analysis capabilities
    - Support image annotation and workspace management
    - Allow users to save and organize their analytical work
*/

-- Create function to get image observations from both petri and gasifier tables
CREATE OR REPLACE FUNCTION public.get_image_observations(
  p_program_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_submission_id UUID DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_observation_type TEXT DEFAULT NULL, -- 'petri', 'gasifier', or NULL for both
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_petri_observations JSONB;
  v_gasifier_observations JSONB;
  v_total_count INTEGER;
  v_petri_count INTEGER;
  v_gasifier_count INTEGER;
BEGIN
  -- Query petri observations if observation_type is NULL or 'petri'
  IF p_observation_type IS NULL OR p_observation_type = 'petri' THEN
    WITH filtered_petri AS (
      SELECT 
        po.observation_id,
        po.petri_code AS code,
        po.image_url,
        po.notes,
        po.fungicide_used,
        po.surrounding_water_schedule,
        po.placement,
        po.placement_dynamics,
        po."Visual Assessment" AS visual_assessment,
        po."Growth Index (MGI)" AS growth_index,
        po.plant_type,
        po.outdoor_temperature,
        po.outdoor_humidity,
        po.created_at,
        po.updated_at,
        po.is_image_split,
        po.is_split_source,
        po.split_processed,
        po.main_petri_id,
        po.phase_observation_settings,
        s.submission_id,
        s.global_submission_id,
        s.temperature AS submission_temperature,
        s.humidity AS submission_humidity,
        s.weather,
        s.created_at AS submission_date,
        sites.name AS site_name,
        sites.site_id,
        pp.name AS program_name,
        pp.program_id,
        'petri' AS observation_type,
        u.email AS creator_email,
        u.full_name AS creator_name
      FROM 
        petri_observations po
      JOIN
        submissions s ON po.submission_id = s.submission_id
      JOIN
        sites ON s.site_id = sites.site_id
      JOIN
        pilot_programs pp ON s.program_id = pp.program_id
      LEFT JOIN
        users u ON s.created_by = u.id
      WHERE 
        -- Apply filters only if they're provided
        (p_program_id IS NULL OR pp.program_id = p_program_id) AND
        (p_site_id IS NULL OR sites.site_id = p_site_id) AND
        (p_submission_id IS NULL OR s.submission_id = p_submission_id) AND
        (p_start_date IS NULL OR s.created_at >= p_start_date) AND
        (p_end_date IS NULL OR s.created_at <= p_end_date) AND
        -- Skip child split records (only show the source record)
        (po.main_petri_id IS NULL OR po.is_split_source = TRUE) AND
        -- Don't show split records without images
        (po.is_split_source IS NOT TRUE OR po.image_url IS NOT NULL) AND
        -- Search across code, site name, program name, and notes
        (p_search_query IS NULL OR 
          po.petri_code ILIKE '%' || p_search_query || '%' OR
          sites.name ILIKE '%' || p_search_query || '%' OR
          pp.name ILIKE '%' || p_search_query || '%' OR
          COALESCE(po.notes, '') ILIKE '%' || p_search_query || '%' OR
          CAST(COALESCE(s.global_submission_id, 0) AS TEXT) = p_search_query)
    ),
    petri_count AS (
      SELECT COUNT(*) AS count FROM filtered_petri
    )
    SELECT 
      jsonb_build_object(
        'observations', COALESCE(jsonb_agg(filtered_petri.*), '[]'::jsonb),
        'count', (SELECT count FROM petri_count)
      ) INTO v_petri_observations
    FROM 
      filtered_petri
    ORDER BY 
      filtered_petri.created_at DESC
    LIMIT 
      CASE WHEN p_observation_type IS NULL THEN p_limit / 2 ELSE p_limit END
    OFFSET 
      CASE WHEN p_observation_type IS NULL THEN p_offset / 2 ELSE p_offset END;
    
    -- Get total petri count
    v_petri_count := (v_petri_observations->>'count')::INTEGER;
  ELSE
    -- If not querying petri, set empty result
    v_petri_observations := jsonb_build_object(
      'observations', '[]'::jsonb,
      'count', 0
    );
    v_petri_count := 0;
  END IF;

  -- Query gasifier observations if observation_type is NULL or 'gasifier'
  IF p_observation_type IS NULL OR p_observation_type = 'gasifier' THEN
    WITH filtered_gasifier AS (
      SELECT 
        go.observation_id,
        go.gasifier_code AS code,
        go.image_url,
        go.notes,
        go.chemical_type,
        go.measure,
        go.anomaly,
        go.placement_height,
        go.directional_placement,
        go.placement_strategy,
        go.outdoor_temperature,
        go.outdoor_humidity,
        go.created_at,
        go.updated_at,
        s.submission_id,
        s.global_submission_id,
        s.temperature AS submission_temperature,
        s.humidity AS submission_humidity,
        s.weather,
        s.created_at AS submission_date,
        sites.name AS site_name,
        sites.site_id,
        pp.name AS program_name,
        pp.program_id,
        'gasifier' AS observation_type,
        u.email AS creator_email,
        u.full_name AS creator_name
      FROM 
        gasifier_observations go
      JOIN
        submissions s ON go.submission_id = s.submission_id
      JOIN
        sites ON s.site_id = sites.site_id
      JOIN
        pilot_programs pp ON s.program_id = pp.program_id
      LEFT JOIN
        users u ON s.created_by = u.id
      WHERE 
        -- Apply filters only if they're provided
        (p_program_id IS NULL OR pp.program_id = p_program_id) AND
        (p_site_id IS NULL OR sites.site_id = p_site_id) AND
        (p_submission_id IS NULL OR s.submission_id = p_submission_id) AND
        (p_start_date IS NULL OR s.created_at >= p_start_date) AND
        (p_end_date IS NULL OR s.created_at <= p_end_date) AND
        -- Search across code, site name, program name, and notes
        (p_search_query IS NULL OR 
          go.gasifier_code ILIKE '%' || p_search_query || '%' OR
          sites.name ILIKE '%' || p_search_query || '%' OR
          pp.name ILIKE '%' || p_search_query || '%' OR
          COALESCE(go.notes, '') ILIKE '%' || p_search_query || '%' OR
          CAST(COALESCE(s.global_submission_id, 0) AS TEXT) = p_search_query)
    ),
    gasifier_count AS (
      SELECT COUNT(*) AS count FROM filtered_gasifier
    )
    SELECT 
      jsonb_build_object(
        'observations', COALESCE(jsonb_agg(filtered_gasifier.*), '[]'::jsonb),
        'count', (SELECT count FROM gasifier_count)
      ) INTO v_gasifier_observations
    FROM 
      filtered_gasifier
    ORDER BY 
      filtered_gasifier.created_at DESC
    LIMIT 
      CASE WHEN p_observation_type IS NULL THEN p_limit / 2 ELSE p_limit END
    OFFSET 
      CASE WHEN p_observation_type IS NULL THEN p_offset / 2 ELSE p_offset END;
    
    -- Get total gasifier count
    v_gasifier_count := (v_gasifier_observations->>'count')::INTEGER;
  ELSE
    -- If not querying gasifier, set empty result
    v_gasifier_observations := jsonb_build_object(
      'observations', '[]'::jsonb,
      'count', 0
    );
    v_gasifier_count := 0;
  END IF;

  -- Calculate total count
  v_total_count := v_petri_count + v_gasifier_count;

  -- Combine results
  v_result := jsonb_build_object(
    'petri', v_petri_observations,
    'gasifier', v_gasifier_observations,
    'total_count', v_total_count
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_image_observations TO authenticated;

-- Create table for user analysis images
CREATE TABLE IF NOT EXISTS public.user_analysis_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  original_observation_id UUID NOT NULL,
  original_observation_type TEXT NOT NULL CHECK (original_observation_type IN ('petri', 'gasifier')),
  image_url TEXT NOT NULL,
  original_image_url TEXT NOT NULL,
  name TEXT NOT NULL,
  folder_path TEXT DEFAULT '',
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_analysis_images ENABLE ROW LEVEL SECURITY;

-- Create policy so users can only see and manipulate their own analysis images
CREATE POLICY "Users can view their own analysis images"
  ON public.user_analysis_images
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own analysis images"
  ON public.user_analysis_images
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analysis images"
  ON public.user_analysis_images
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analysis images"
  ON public.user_analysis_images
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER set_updated_at_user_analysis_images
BEFORE UPDATE ON public.user_analysis_images
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add indices
CREATE INDEX idx_user_analysis_images_user_id ON public.user_analysis_images (user_id);
CREATE INDEX idx_user_analysis_images_original_observation_id ON public.user_analysis_images (original_observation_id);
CREATE INDEX idx_user_analysis_images_folder_path ON public.user_analysis_images (folder_path);

-- Create storage bucket for analysis images
INSERT INTO storage.buckets (id, name, public)
VALUES ('analysis-images', 'analysis-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
CREATE POLICY "Users can upload their own analysis images"
  ON storage.objects 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    bucket_id = 'analysis-images' AND 
    (auth.uid())::text = SPLIT_PART(name, '/', 1)
  );

CREATE POLICY "Users can update their own analysis images"
  ON storage.objects 
  FOR UPDATE 
  TO authenticated
  USING (
    bucket_id = 'analysis-images' AND 
    (auth.uid())::text = SPLIT_PART(name, '/', 1)
  );

CREATE POLICY "Users can delete their own analysis images"
  ON storage.objects 
  FOR DELETE 
  TO authenticated
  USING (
    bucket_id = 'analysis-images' AND 
    (auth.uid())::text = SPLIT_PART(name, '/', 1)
  );

CREATE POLICY "Analysis images are publicly accessible"
  ON storage.objects 
  FOR SELECT 
  TO public
  USING (bucket_id = 'analysis-images');