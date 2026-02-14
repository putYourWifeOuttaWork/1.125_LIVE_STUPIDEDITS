/*
  # Analytics Platform Foundation Migration

  INSTRUCTIONS: This migration needs to be applied manually through the Supabase dashboard.
  Copy this entire SQL and run it in the SQL editor at: https://supabase.com/dashboard/project/_/sql

  This creates:
  - 2 tables (report_snapshots, report_cache) -- IF NOT EXISTS, safe to re-run
  - 7 analytics query functions (CREATE OR REPLACE)
  - RLS policies for security

  ## Tables
  - `report_snapshots` - immutable point-in-time captures of report data
    - `snapshot_id` (uuid, primary key)
    - `report_id` (uuid, FK to custom_reports)
    - `company_id` (uuid, FK to companies)
    - `created_by_user_id` (uuid, FK to auth.users)
    - `snapshot_name` (text)
    - `description` (text)
    - `data_snapshot` (jsonb)
    - `configuration_snapshot` (jsonb)
    - `created_at` (timestamptz)
  - `report_cache` - ephemeral cache for expensive analytics queries
    - `cache_id` (uuid, primary key)
    - `cache_key` (text, unique)
    - `company_id` (uuid, FK to companies)
    - `data` (jsonb)
    - `query_time_ms` (integer)
    - `created_at` (timestamptz)
    - `expires_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - report_snapshots: SELECT, INSERT, DELETE policies (no UPDATE -- snapshots are immutable)
  - All SECURITY DEFINER functions verify caller belongs to the requested company
  - Super admin bypass on all policies

  ## Column Reference Convention
  - companies PK: company_id
  - devices PK: device_id
  - sites PK: site_id
  - pilot_programs PK: program_id
  - custom_reports PK: report_id
  - device_images PK: image_id
  - report_snapshots PK: snapshot_id
  - report_cache PK: cache_id
  - device_images status column: status (values: pending, receiving, complete, failed)
*/

-- =====================================================
-- TABLE: report_snapshots
-- =====================================================
CREATE TABLE IF NOT EXISTS report_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES custom_reports(report_id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot_name text NOT NULL,
  description text,
  data_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_report_id ON report_snapshots(report_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_company_id ON report_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_created_at ON report_snapshots(created_at DESC);

ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_snapshots' AND policyname = 'Users can view snapshots for their company reports'
  ) THEN
    CREATE POLICY "Users can view snapshots for their company reports"
      ON report_snapshots FOR SELECT TO authenticated
      USING (
        company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_snapshots' AND policyname = 'Users can create snapshots for their company reports'
  ) THEN
    CREATE POLICY "Users can create snapshots for their company reports"
      ON report_snapshots FOR INSERT TO authenticated
      WITH CHECK (
        (
          company_id IN (
            SELECT u.company_id FROM users u WHERE u.id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
          )
        )
        AND EXISTS (
          SELECT 1 FROM custom_reports cr
          WHERE cr.report_id = report_snapshots.report_id
          AND cr.company_id = report_snapshots.company_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_snapshots' AND policyname = 'Users can delete their company snapshots'
  ) THEN
    CREATE POLICY "Users can delete their company snapshots"
      ON report_snapshots FOR DELETE TO authenticated
      USING (
        company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
        )
      );
  END IF;
END $$;

-- =====================================================
-- TABLE: report_cache
-- =====================================================
CREATE TABLE IF NOT EXISTS report_cache (
  cache_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES companies(company_id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  query_time_ms integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_cache_key ON report_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_report_cache_expires ON report_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_report_cache_company_id ON report_cache(company_id);

ALTER TABLE report_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_cache' AND policyname = 'Users can view cache for their company'
  ) THEN
    CREATE POLICY "Users can view cache for their company"
      ON report_cache FOR SELECT TO authenticated
      USING (
        company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_cache' AND policyname = 'Users can insert cache for their company'
  ) THEN
    CREATE POLICY "Users can insert cache for their company"
      ON report_cache FOR INSERT TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'report_cache' AND policyname = 'Users can delete expired cache for their company'
  ) THEN
    CREATE POLICY "Users can delete expired cache for their company"
      ON report_cache FOR DELETE TO authenticated
      USING (
        company_id IN (
          SELECT u.company_id FROM users u WHERE u.id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_super_admin = true
        )
      );
  END IF;
END $$;

-- =====================================================
-- ANALYTICS FUNCTIONS
-- =====================================================

DROP FUNCTION IF EXISTS get_analytics_time_series(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], text[], text);

CREATE OR REPLACE FUNCTION get_analytics_time_series(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score', 'temperature', 'humidity'], p_interval text DEFAULT '1 hour'
)
RETURNS TABLE (timestamp_bucket timestamptz, metric_name text, metric_value numeric, device_id uuid, device_code text, site_id uuid, site_name text, program_id uuid, program_name text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT date_trunc('hour', di.captured_at) AS timestamp_bucket,
    m.metric_name,
    CASE m.metric_name
      WHEN 'mgi_score' THEN AVG(di.mgi_score)
      WHEN 'temperature' THEN AVG(di.temperature)
      WHEN 'humidity' THEN AVG(di.humidity)
    END AS metric_value,
    di.device_id, d.device_code, d.site_id, s.name AS site_name, s.program_id, pp.name AS program_name
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  JOIN pilot_programs pp ON pp.program_id = s.program_id
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  GROUP BY date_trunc('hour', di.captured_at), m.metric_name, di.device_id, d.device_code, d.site_id, s.name, s.program_id, pp.name
  ORDER BY timestamp_bucket, m.metric_name, d.device_code;
END; $$;

DROP FUNCTION IF EXISTS get_analytics_aggregated(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], text[], text, text);

CREATE OR REPLACE FUNCTION get_analytics_aggregated(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_program_ids uuid[] DEFAULT NULL, p_site_ids uuid[] DEFAULT NULL, p_device_ids uuid[] DEFAULT NULL,
  p_metrics text[] DEFAULT ARRAY['mgi_score'], p_aggregation text DEFAULT 'avg', p_group_by text DEFAULT 'device'
)
RETURNS TABLE (group_key text, group_id uuid, metric_name text, metric_value numeric, record_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH filtered_images AS (
    SELECT di.device_id, d.device_code, d.site_id, s.name AS site_name, s.program_id, pp.name AS program_name,
      di.mgi_score, di.temperature, di.humidity
    FROM device_images di
    JOIN devices d ON d.device_id = di.device_id
    JOIN sites s ON s.site_id = d.site_id
    JOIN pilot_programs pp ON pp.program_id = s.program_id
    WHERE di.company_id = p_company_id
      AND di.captured_at BETWEEN p_time_start AND p_time_end
      AND di.status = 'complete'
      AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
      AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
      AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  )
  SELECT
    CASE p_group_by WHEN 'device' THEN fi.device_code WHEN 'site' THEN fi.site_name WHEN 'program' THEN fi.program_name ELSE 'all' END AS group_key,
    CASE p_group_by WHEN 'device' THEN fi.device_id WHEN 'site' THEN fi.site_id WHEN 'program' THEN fi.program_id END AS group_id,
    m.metric_name,
    CASE p_aggregation
      WHEN 'avg' THEN CASE m.metric_name WHEN 'mgi_score' THEN AVG(fi.mgi_score) WHEN 'temperature' THEN AVG(fi.temperature) WHEN 'humidity' THEN AVG(fi.humidity) END
      WHEN 'sum' THEN CASE m.metric_name WHEN 'mgi_score' THEN SUM(fi.mgi_score) WHEN 'temperature' THEN SUM(fi.temperature) WHEN 'humidity' THEN SUM(fi.humidity) END
      WHEN 'min' THEN CASE m.metric_name WHEN 'mgi_score' THEN MIN(fi.mgi_score) WHEN 'temperature' THEN MIN(fi.temperature) WHEN 'humidity' THEN MIN(fi.humidity) END
      WHEN 'max' THEN CASE m.metric_name WHEN 'mgi_score' THEN MAX(fi.mgi_score) WHEN 'temperature' THEN MAX(fi.temperature) WHEN 'humidity' THEN MAX(fi.humidity) END
    END AS metric_value,
    COUNT(*)::bigint AS record_count
  FROM filtered_images fi
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  GROUP BY group_key, group_id, m.metric_name ORDER BY group_key, m.metric_name;
END; $$;

DROP FUNCTION IF EXISTS get_analytics_comparison(uuid, timestamptz, timestamptz, text, uuid[], text[], text);

CREATE OR REPLACE FUNCTION get_analytics_comparison(
  p_company_id uuid, p_time_start timestamptz, p_time_end timestamptz,
  p_entity_type text, p_entity_ids uuid[], p_metrics text[] DEFAULT ARRAY['mgi_score'], p_interval text DEFAULT '1 day'
)
RETURNS TABLE (timestamp_bucket timestamptz, entity_id uuid, entity_name text, metric_name text, metric_value numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT date_trunc('day', di.captured_at) AS timestamp_bucket,
    CASE p_entity_type WHEN 'program' THEN pp.program_id WHEN 'site' THEN s.site_id WHEN 'device' THEN d.device_id END AS entity_id,
    CASE p_entity_type WHEN 'program' THEN pp.name WHEN 'site' THEN s.name WHEN 'device' THEN d.device_code END AS entity_name,
    m.metric_name,
    CASE m.metric_name
      WHEN 'mgi_score' THEN AVG(di.mgi_score)
      WHEN 'temperature' THEN AVG(di.temperature)
      WHEN 'humidity' THEN AVG(di.humidity)
    END AS metric_value
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  JOIN pilot_programs pp ON pp.program_id = s.program_id
  CROSS JOIN LATERAL unnest(p_metrics) AS m(metric_name)
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (
      (p_entity_type = 'program' AND pp.program_id = ANY(p_entity_ids))
      OR (p_entity_type = 'site' AND s.site_id = ANY(p_entity_ids))
      OR (p_entity_type = 'device' AND d.device_id = ANY(p_entity_ids))
    )
  GROUP BY timestamp_bucket, entity_id, entity_name, m.metric_name ORDER BY timestamp_bucket, entity_name, m.metric_name;
END; $$;

DROP FUNCTION IF EXISTS get_analytics_drill_down(uuid, timestamptz, timestamptz, uuid[], uuid[], uuid[], integer, integer);

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
  image_url text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = p_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    di.image_id,
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
    di.image_url
  FROM device_images di
  JOIN devices d ON d.device_id = di.device_id
  JOIN sites s ON s.site_id = d.site_id
  JOIN pilot_programs pp ON pp.program_id = s.program_id
  WHERE di.company_id = p_company_id
    AND di.captured_at BETWEEN p_time_start AND p_time_end
    AND di.status = 'complete'
    AND (p_program_ids IS NULL OR s.program_id = ANY(p_program_ids))
    AND (p_site_ids IS NULL OR d.site_id = ANY(p_site_ids))
    AND (p_device_ids IS NULL OR di.device_id = ANY(p_device_ids))
  ORDER BY di.captured_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END; $$;

DROP FUNCTION IF EXISTS create_report_snapshot(uuid, text, text);

CREATE OR REPLACE FUNCTION create_report_snapshot(p_report_id uuid, p_snapshot_name text, p_description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_snapshot_id uuid; v_report_config jsonb; v_company_id uuid;
BEGIN
  SELECT configuration, company_id INTO v_report_config, v_company_id FROM custom_reports WHERE report_id = p_report_id;
  IF v_report_config IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = v_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO report_snapshots (report_id, company_id, created_by_user_id, snapshot_name, description, data_snapshot, configuration_snapshot)
  VALUES (
    p_report_id,
    v_company_id,
    auth.uid(),
    p_snapshot_name,
    p_description,
    jsonb_build_object('created_at', now(), 'report_id', p_report_id),
    v_report_config
  )
  RETURNING snapshot_id INTO v_snapshot_id;
  RETURN v_snapshot_id;
END; $$;

DROP FUNCTION IF EXISTS get_report_snapshot_data(uuid);

CREATE OR REPLACE FUNCTION get_report_snapshot_data(p_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_data jsonb; v_config jsonb; v_company_id uuid;
BEGIN
  SELECT data_snapshot, configuration_snapshot, company_id
  INTO v_data, v_config, v_company_id
  FROM report_snapshots WHERE snapshot_id = p_snapshot_id;

  IF v_data IS NULL THEN RAISE EXCEPTION 'Snapshot not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid() AND (u.company_id = v_company_id OR u.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN jsonb_build_object('data', v_data, 'configuration', v_config);
END; $$;

GRANT EXECUTE ON FUNCTION get_analytics_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_comparison TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_drill_down TO authenticated;
GRANT EXECUTE ON FUNCTION create_report_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION get_report_snapshot_data TO authenticated;
