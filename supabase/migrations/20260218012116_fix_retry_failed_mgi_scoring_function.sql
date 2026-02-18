/*
  # Fix fn_retry_failed_mgi_scoring cron function

  1. Bug Fixes
    - CTE scoping: `retry_candidates` was defined in RETURN QUERY but referenced
      in a separate PERFORM statement where it doesn't exist
    - Config access: replaced `current_setting('app.supabase_url')` / `current_setting('app.supabase_service_role_key')`
      with `get_app_secret('supabase_url')` / `get_app_secret('service_role_key')` which actually exist in app_secrets table
    - The function now materializes candidates into a temp table so both the RETURN QUERY
      and the net.http_post loop can reference them

  2. Behavior
    - Still picks up failed, stale in_progress (>5min), and stale pending (>2min) images
    - Still limited to 10 per invocation
    - Fires net.http_post to score_mgi_image edge function for each candidate
*/

CREATE OR REPLACE FUNCTION fn_retry_failed_mgi_scoring()
RETURNS TABLE(image_id UUID, status TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := get_app_secret('supabase_url');
  v_service_key := get_app_secret('service_role_key');

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'fn_retry_failed_mgi_scoring: missing app_secrets (supabase_url or service_role_key)';
    RETURN;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _retry_candidates (
    img_id UUID,
    img_url TEXT,
    scoring_status TEXT
  ) ON COMMIT DROP;

  TRUNCATE _retry_candidates;

  INSERT INTO _retry_candidates (img_id, img_url, scoring_status)
  SELECT
    di.image_id,
    di.image_url,
    di.mgi_scoring_status
  FROM device_images di
  WHERE
    di.status = 'complete'
    AND di.image_url IS NOT NULL
    AND (
      di.mgi_scoring_status = 'failed'
      OR (
        di.mgi_scoring_status = 'in_progress'
        AND di.mgi_scoring_started_at < NOW() - INTERVAL '5 minutes'
      )
      OR (
        di.mgi_scoring_status = 'pending'
        AND di.received_at < NOW() - INTERVAL '2 minutes'
      )
    )
  LIMIT 10;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/score_mgi_image',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'image_id', rc.img_id,
      'image_url', rc.img_url
    )
  )
  FROM _retry_candidates rc;

  RETURN QUERY
  SELECT
    rc.img_id,
    rc.scoring_status,
    'retrying'::TEXT
  FROM _retry_candidates rc;
END;
$$;
