/*
  # Analytics Platform Foundation Migration

  INSTRUCTIONS: This migration needs to be applied manually through the Supabase dashboard.
  Copy this entire SQL and run it in the SQL editor at: https://supabase.com/dashboard/project/_/sql

  This creates:
  - 2 new tables (report_snapshots, report_cache)
  - 7 analytics query functions
  - RLS policies for security
*/

-- =====================================================
-- TABLE: report_snapshots
-- =====================================================
CREATE TABLE IF NOT EXISTS report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_name text NOT NULL,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  time_range_start timestamptz NOT NULL,
  time_range_end timestamptz NOT NULL,
  data_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  cached_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  notes text
);

-- Add snapshot_date column if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_snapshots' AND column_name = 'snapshot_date'
  ) THEN
    ALTER TABLE report_snapshots ADD COLUMN snapshot_date timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_report_snapshots_report_id ON report_snapshots(report_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_company_id ON report_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_date ON report_snapshots(snapshot_date DESC);

ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots for their company reports"
  ON report_snapshots FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM user_company_roles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create snapshots for their company reports"
  ON report_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM user_company_roles WHERE user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM custom_reports cr WHERE cr.id = report_id AND cr.company_id = company_id)
  );

CREATE POLICY "Users can delete their company's snapshots"
  ON report_snapshots FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM user_company_roles WHERE user_id = auth.uid()));

-- =====================================================
-- TABLE: report_cache
-- =====================================================
CREATE TABLE IF NOT EXISTS report_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query_params jsonb NOT NULL,
  result_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_report_cache_key ON report_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_report_cache_expires ON report_cache(expires_at);

ALTER TABLE report_cache ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ANALYTICS FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION get_analytics_time_series(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score', 'temperature', 'humidity'], p_interval text DEFAULT '1 hour'
)
RETURNS TABLE (timestamp_bucket timestamptz, metric_name text, metric_value numeric, device_id uuid, device_code text, site_id uuid, site_name text, program_id uuid, program_name text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT date_trunc('hour', di.captured_at) AS timestamp_bucket, unnest(p_metrics) AS metric_name,
    CASE unnest(p_metrics) WHEN 'mgi_score' THEN AVG(di.mgi_score) WHEN 'temperature' THEN AVG(di.temperature) WHEN 'humidity' THEN AVG(di.humidity) END AS metric_value,
    di.device_id, d.device_code, d.site_id, s.name AS site_name, s.program_id, pp.name AS program_name
  FROM device_images di
  JOIN devices d ON d.id = di.device_id JOIN sites s ON s.site_id = d.site_id JOIN pilot_programs pp ON pp.program_id = s.program_id
  WHERE di.company_id = p_company_id AND di.captured_at BETWEEN p_time_start AND p_time_end AND di.processing_status = 'completed'
    AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  GROUP BY date_trunc('hour', di.captured_at), di.device_id, d.device_code, d.site_id, s.name, s.program_id, pp.name
  ORDER BY timestamp_bucket, metric_name, d.device_code;
END; $$;

CREATE OR REPLACE FUNCTION get_analytics_aggregated(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score'], p_aggregation text DEFAULT 'avg', p_group_by text DEFAULT 'device'
)
RETURNS TABLE (group_key text, group_id uuid, metric_name text, metric_value numeric, record_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH filtered_images AS (
    SELECT di.device_id, d.device_code, d.site_id, s.name AS site_name, s.program_id, pp.name AS program_name,
      di.mgi_score, di.temperature, di.humidity
    FROM device_images di
    JOIN devices d ON d.id = di.device_id JOIN sites s ON s.id = d.site_id JOIN pilot_programs pp ON pp.id = s.program_id
    WHERE di.company_id = p_company_id AND di.captured_at BETWEEN p_time_start AND p_time_end AND di.processing_status = 'completed'
      AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
      AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
      AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  )
  SELECT
    CASE p_group_by WHEN 'device' THEN fi.device_code WHEN 'site' THEN fi.site_name WHEN 'program' THEN fi.program_name ELSE 'all' END AS group_key,
    CASE p_group_by WHEN 'device' THEN fi.device_id WHEN 'site' THEN fi.site_id WHEN 'program' THEN fi.program_id END AS group_id,
    unnest(p_metrics) AS metric_name,
    CASE p_aggregation
      WHEN 'avg' THEN CASE unnest(p_metrics) WHEN 'mgi_score' THEN AVG(fi.mgi_score) WHEN 'temperature' THEN AVG(fi.temperature) WHEN 'humidity' THEN AVG(fi.humidity) END
      WHEN 'sum' THEN CASE unnest(p_metrics) WHEN 'mgi_score' THEN SUM(fi.mgi_score) WHEN 'temperature' THEN SUM(fi.temperature) WHEN 'humidity' THEN SUM(fi.humidity) END
      WHEN 'min' THEN CASE unnest(p_metrics) WHEN 'mgi_score' THEN MIN(fi.mgi_score) WHEN 'temperature' THEN MIN(fi.temperature) WHEN 'humidity' THEN MIN(fi.humidity) END
      WHEN 'max' THEN CASE unnest(p_metrics) WHEN 'mgi_score' THEN MAX(fi.mgi_score) WHEN 'temperature' THEN MAX(fi.temperature) WHEN 'humidity' THEN MAX(fi.humidity) END
    END AS metric_value,
    COUNT(*)::bigint AS record_count
  FROM filtered_images fi
  GROUP BY group_key, group_id ORDER BY group_key, metric_name;
END; $$;

CREATE OR REPLACE FUNCTION get_analytics_comparison(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_entity_type text, p_entity_ids uuid[], p_metrics text[] DEFAULT ARRAY['mgi_score'], p_interval text DEFAULT '1 day'
)
RETURNS TABLE (timestamp_bucket timestamptz, entity_id uuid, entity_name text, metric_name text, metric_value numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT date_trunc('day', di.captured_at) AS timestamp_bucket,
    CASE p_entity_type WHEN 'program' THEN pp.id WHEN 'site' THEN s.id WHEN 'device' THEN d.id END AS entity_id,
    CASE p_entity_type WHEN 'program' THEN pp.name WHEN 'site' THEN s.name WHEN 'device' THEN d.device_code END AS entity_name,
    unnest(p_metrics) AS metric_name,
    CASE unnest(p_metrics) WHEN 'mgi_score' THEN AVG(di.mgi_score) WHEN 'temperature' THEN AVG(di.temperature) WHEN 'humidity' THEN AVG(di.humidity) END AS metric_value
  FROM device_images di
  JOIN devices d ON d.id = di.device_id JOIN sites s ON s.site_id = d.site_id JOIN pilot_programs pp ON pp.program_id = s.program_id
  WHERE di.company_id = p_company_id AND di.captured_at BETWEEN p_time_start AND p_time_end AND di.processing_status = 'completed'
    AND ((p_entity_type = 'program' AND pp.id = ANY(p_entity_ids)) OR (p_entity_type = 'site' AND s.id = ANY(p_entity_ids)) OR (p_entity_type = 'device' AND d.id = ANY(p_entity_ids)))
  GROUP BY timestamp_bucket, entity_id, entity_name ORDER BY timestamp_bucket, entity_name, metric_name;
END; $$;

CREATE OR REPLACE FUNCTION get_analytics_drill_down(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  image_id uuid,
  device_id uuid,
  device_code text,
  site_id uuid,
  site_name text,
  program_id uuid,
  program_name text,
  site_device_session_id uuid,
  wake_payload_id uuid,
  captured_at timestamptz,
  mgi_score numeric,
  temperature numeric,
  humidity numeric,
  image_url text,
  detection_count integer
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.id AS image_id,
    di.device_id,
    d.device_code,
    s.site_id,
    s.name AS site_name,
    pp.program_id,
    pp.name AS program_name,
    di.site_device_session_id,
    di.wake_payload_id,
    di.captured_at,
    di.mgi_score,
    di.temperature,
    di.humidity,
    di.image_url,
    di.detection_count
  FROM device_images di
  JOIN devices d ON d.id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  JOIN pilot_programs pp ON pp.program_id = s.program_id
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.processing_status = 'completed'
    AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  ORDER BY di.captured_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END; $$;

CREATE OR REPLACE FUNCTION create_report_snapshot(p_report_id uuid, p_snapshot_name text, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_snapshot_id uuid; v_report_config jsonb; v_company_id uuid; v_snapshot_data jsonb;
BEGIN
  SELECT config, company_id INTO v_report_config, v_company_id FROM custom_reports WHERE id = p_report_id;
  IF v_report_config IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  v_snapshot_data := jsonb_build_object('created_at', now(), 'report_id', p_report_id, 'config', v_report_config);
  INSERT INTO report_snapshots (report_id, company_id, snapshot_name, time_range_start, time_range_end, cached_results, created_by, notes)
  VALUES (p_report_id, v_company_id, p_snapshot_name, (v_report_config->>'time_start')::timestamptz, (v_report_config->>'time_end')::timestamptz, v_snapshot_data, auth.uid(), p_notes)
  RETURNING id INTO v_snapshot_id;
  RETURN v_snapshot_id;
END; $$;

CREATE OR REPLACE FUNCTION get_report_snapshot_data(p_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cached_results jsonb; v_company_id uuid;
BEGIN
  SELECT cached_results, company_id INTO v_cached_results, v_company_id FROM report_snapshots WHERE id = p_snapshot_id;
  IF v_cached_results IS NULL THEN RAISE EXCEPTION 'Snapshot not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_company_roles WHERE user_id = auth.uid() AND company_id = v_company_id) THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN v_cached_results;
END; $$;

GRANT EXECUTE ON FUNCTION get_analytics_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_comparison TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_drill_down TO authenticated;
GRANT EXECUTE ON FUNCTION create_report_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION get_report_snapshot_data TO authenticated;
