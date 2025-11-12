/*
  # Phase 1: RPC Functions for Company Alert Preferences

  This migration creates RPC functions to manage company alert preferences:
  1. fn_get_company_alert_prefs - Retrieve alert preferences with intelligent defaults
  2. fn_set_company_alert_prefs - Update alert preferences with validation

  SECURITY: Both functions use SECURITY DEFINER with company membership checks
*/

-- ============================================
-- 1. GET COMPANY ALERT PREFERENCES
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_get_company_alert_prefs(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_company_id uuid;
  v_is_super_admin boolean;
  v_prefs record;
  v_result jsonb;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user's company and super admin status
  SELECT company_id, is_super_admin
  INTO v_user_company_id, v_is_super_admin
  FROM public.users
  WHERE id = v_user_id;

  -- Verify access: user must be in the company or be super admin
  IF NOT v_is_super_admin AND v_user_company_id != p_company_id THEN
    RAISE EXCEPTION 'Access denied: not authorized for this company';
  END IF;

  -- Try to get existing preferences
  SELECT *
  INTO v_prefs
  FROM public.company_alert_prefs
  WHERE company_id = p_company_id;

  IF FOUND THEN
    -- Return existing preferences
    v_result := jsonb_build_object(
      'company_id', v_prefs.company_id,
      'thresholds', v_prefs.thresholds,
      'channels', v_prefs.channels,
      'quiet_hours', v_prefs.quiet_hours,
      'updated_at', v_prefs.updated_at,
      'created_at', v_prefs.created_at
    );
  ELSE
    -- Return sensible defaults
    v_result := jsonb_build_object(
      'company_id', p_company_id,
      'thresholds', jsonb_build_object(
        'telemetry', jsonb_build_object(
          'temp_max', 40,
          'temp_min', 5,
          'rh_max', 85,
          'rh_min', 20,
          'pressure_max', 1050,
          'pressure_min', 950
        ),
        'mgi', jsonb_build_object(
          'absolute_high', 0.60,
          'absolute_critical', 0.80,
          'velocity_high', 0.25,
          'velocity_critical', 0.40,
          'speed_high_per_day', 0.12,
          'speed_critical_per_day', 0.20
        ),
        'window_days', 5,
        'alert_levels', jsonb_build_object(
          'warning', jsonb_build_object('temp', 35, 'rh', 80, 'mgi', 0.50),
          'danger', jsonb_build_object('temp', 38, 'rh', 83, 'mgi', 0.65),
          'critical', jsonb_build_object('temp', 40, 'rh', 85, 'mgi', 0.80)
        )
      ),
      'channels', jsonb_build_object(
        'email', jsonb_build_object(
          'enabled', true,
          'addresses', '[]'::jsonb,
          'alert_levels', '["warning", "danger", "critical"]'::jsonb
        ),
        'sms', jsonb_build_object(
          'enabled', false,
          'numbers', '[]'::jsonb,
          'alert_levels', '["danger", "critical"]'::jsonb
        ),
        'webhook', jsonb_build_object(
          'enabled', false,
          'url', null,
          'alert_levels', '["critical"]'::jsonb
        ),
        'in_app', jsonb_build_object(
          'enabled', true,
          'alert_levels', '["warning", "danger", "critical"]'::jsonb
        )
      ),
      'quiet_hours', null,
      'is_default', true
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_get_company_alert_prefs IS 'Retrieve company alert preferences with intelligent defaults if none exist';

-- ============================================
-- 2. SET COMPANY ALERT PREFERENCES
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_set_company_alert_prefs(
  p_company_id uuid,
  p_thresholds jsonb,
  p_channels jsonb,
  p_quiet_hours jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_company_id uuid;
  v_is_super_admin boolean;
  v_is_company_admin boolean;
  v_result record;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check user's permissions
  SELECT company_id, is_super_admin, is_company_admin
  INTO v_user_company_id, v_is_super_admin, v_is_company_admin
  FROM public.users
  WHERE id = v_user_id;

  -- Verify access: user must be company admin or super admin
  IF NOT v_is_super_admin AND NOT v_is_company_admin THEN
    RAISE EXCEPTION 'Access denied: requires company admin or super admin role';
  END IF;

  -- Verify company match (unless super admin)
  IF NOT v_is_super_admin AND v_user_company_id != p_company_id THEN
    RAISE EXCEPTION 'Access denied: not authorized for this company';
  END IF;

  -- Validate company exists
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE company_id = p_company_id) THEN
    RAISE EXCEPTION 'Company not found: %', p_company_id;
  END IF;

  -- Basic validation: ensure thresholds and channels are objects
  IF jsonb_typeof(p_thresholds) != 'object' THEN
    RAISE EXCEPTION 'Invalid thresholds: must be a JSON object';
  END IF;

  IF jsonb_typeof(p_channels) != 'object' THEN
    RAISE EXCEPTION 'Invalid channels: must be a JSON object';
  END IF;

  -- Upsert preferences
  INSERT INTO public.company_alert_prefs (
    company_id,
    thresholds,
    channels,
    quiet_hours,
    updated_at
  )
  VALUES (
    p_company_id,
    p_thresholds,
    p_channels,
    p_quiet_hours,
    now()
  )
  ON CONFLICT (company_id)
  DO UPDATE SET
    thresholds = EXCLUDED.thresholds,
    channels = EXCLUDED.channels,
    quiet_hours = EXCLUDED.quiet_hours,
    updated_at = now()
  RETURNING *
  INTO v_result;

  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Alert preferences saved successfully',
    'company_id', v_result.company_id,
    'updated_at', v_result.updated_at
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Return error response
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.fn_set_company_alert_prefs IS 'Update company alert preferences with validation (requires company admin or super admin)';

-- ============================================
-- 3. HELPER FUNCTION: Evaluate threshold breach
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_evaluate_threshold(
  p_metric_name text,
  p_metric_value numeric,
  p_thresholds jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_warning numeric;
  v_danger numeric;
  v_critical numeric;
BEGIN
  -- Extract thresholds for the metric from alert_levels
  v_warning := (p_thresholds -> 'alert_levels' -> 'warning' ->> p_metric_name)::numeric;
  v_danger := (p_thresholds -> 'alert_levels' -> 'danger' ->> p_metric_name)::numeric;
  v_critical := (p_thresholds -> 'alert_levels' -> 'critical' ->> p_metric_name)::numeric;

  -- Handle null thresholds
  IF v_critical IS NULL OR v_danger IS NULL OR v_warning IS NULL THEN
    RETURN 'normal';
  END IF;

  -- Evaluate (assumes higher values are worse - adjust logic as needed)
  IF p_metric_value >= v_critical THEN
    RETURN 'critical';
  ELSIF p_metric_value >= v_danger THEN
    RETURN 'danger';
  ELSIF p_metric_value >= v_warning THEN
    RETURN 'warning';
  ELSE
    RETURN 'normal';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_evaluate_threshold IS 'Evaluate if a metric value breaches warning/danger/critical thresholds';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Phase 1 RPC functions created successfully';
  RAISE NOTICE '   - fn_get_company_alert_prefs: Retrieve prefs with defaults';
  RAISE NOTICE '   - fn_set_company_alert_prefs: Update prefs with validation';
  RAISE NOTICE '   - fn_evaluate_threshold: Helper for threshold evaluation';
END $$;
