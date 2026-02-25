/*
  # Add Batch Acknowledge Alerts RPC

  1. New Functions
    - `batch_acknowledge_alerts(alert_ids UUID[], notes TEXT)`
      - Resolves multiple alerts in a single call
      - Sets resolved_at, resolution_notes, and resolved_by_user_id
      - Validates caller belongs to the same company as the alerts
      - Returns count of updated rows

    - `batch_acknowledge_alerts_by_filter(...)`
      - Resolves all alerts matching the given filter criteria
      - Same security validation as above
      - Accepts: company_id, severities, categories, site_id, date_range_start, search_query
      - Returns count of updated rows

  2. Security
    - Both functions use SECURITY DEFINER to bypass RLS for the batch UPDATE
    - Both functions validate auth.uid() is not null (user must be authenticated)
    - Both functions restrict updates to alerts matching the caller's company_id
    - Only unresolved alerts (resolved_at IS NULL) are affected
*/

CREATE OR REPLACE FUNCTION batch_acknowledge_alerts(
  p_alert_ids UUID[],
  p_notes TEXT DEFAULT 'Batch acknowledged by user'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE device_alerts
  SET
    resolved_at = now(),
    resolution_notes = p_notes,
    resolved_by_user_id = v_user_id
  WHERE alert_id = ANY(p_alert_ids)
    AND resolved_at IS NULL
    AND company_id IN (
      SELECT company_id FROM public.users WHERE id = v_user_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION batch_acknowledge_alerts_by_filter(
  p_company_id UUID,
  p_severities TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_site_id UUID DEFAULT NULL,
  p_date_range_start TIMESTAMPTZ DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT 'Batch acknowledged by user'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_company_id NOT IN (
    SELECT company_id FROM public.users WHERE id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Access denied: company mismatch';
  END IF;

  UPDATE device_alerts
  SET
    resolved_at = now(),
    resolution_notes = p_notes,
    resolved_by_user_id = v_user_id
  WHERE resolved_at IS NULL
    AND company_id = p_company_id
    AND (p_severities IS NULL OR severity = ANY(p_severities))
    AND (p_categories IS NULL OR alert_category = ANY(p_categories))
    AND (p_site_id IS NULL OR site_id = p_site_id)
    AND (p_date_range_start IS NULL OR triggered_at >= p_date_range_start)
    AND (
      p_search_query IS NULL
      OR message ILIKE '%' || p_search_query || '%'
      OR site_name ILIKE '%' || p_search_query || '%'
      OR metadata->>'device_code' ILIKE '%' || p_search_query || '%'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
