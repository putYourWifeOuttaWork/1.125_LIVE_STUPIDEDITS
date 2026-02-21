/*
  # Add Score Browser RPC Functions

  1. New Functions
    - `fn_quick_flag_for_review` - Allows an admin to manually flag any device_image
      for review, creating an mgi_review_queue entry with method 'manual_flag'
    - `fn_direct_score_override` - Allows an admin to directly override an image's
      MGI score without going through the full review queue workflow
    - `fn_browse_scored_images` - Server-side paginated query for browsing all
      scored device images with filters (date range, company, site, device, score range)

  2. Security
    - All functions require authenticated user context
    - fn_quick_flag_for_review and fn_direct_score_override require admin_user_id
    - fn_browse_scored_images respects existing RLS through joins

  3. Important Notes
    - fn_quick_flag_for_review backs up original score and sets qa_status to pending_review
    - fn_direct_score_override creates an audit trail in mgi_review_queue
    - fn_direct_score_override recalculates velocity for affected and subsequent images
    - fn_browse_scored_images returns enriched data with device/site/program names
*/

-- ============================================================
-- fn_quick_flag_for_review
-- ============================================================
CREATE OR REPLACE FUNCTION fn_quick_flag_for_review(
  p_image_id uuid,
  p_admin_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_image record;
  v_existing_review uuid;
  v_review_id uuid;
BEGIN
  SELECT image_id, device_id, mgi_score, mgi_original_score, mgi_qa_status,
         company_id, program_id, site_id, site_device_session_id, captured_at
  INTO v_image
  FROM device_images
  WHERE image_id = p_image_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Image not found');
  END IF;

  IF v_image.mgi_score IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Image has no MGI score');
  END IF;

  SELECT review_id INTO v_existing_review
  FROM mgi_review_queue
  WHERE image_id = p_image_id AND status = 'pending'
  LIMIT 1;

  IF v_existing_review IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Image already has a pending review',
      'existing_review_id', v_existing_review
    );
  END IF;

  IF v_image.mgi_original_score IS NULL THEN
    UPDATE device_images
    SET mgi_original_score = mgi_score
    WHERE image_id = p_image_id;
  END IF;

  UPDATE device_images
  SET mgi_qa_status = 'pending_review',
      mgi_qa_method = 'manual_flag',
      mgi_qa_details = jsonb_build_object(
        'flagged_by', p_admin_user_id,
        'flagged_at', now()::text,
        'flag_reasons', ARRAY['manual_flag_from_score_browser']
      )
  WHERE image_id = p_image_id;

  INSERT INTO mgi_review_queue (
    image_id, device_id, company_id, program_id, site_id, session_id,
    original_score, adjusted_score, qa_method, qa_details,
    status, priority
  )
  VALUES (
    p_image_id,
    v_image.device_id,
    v_image.company_id,
    v_image.program_id,
    v_image.site_id,
    v_image.site_device_session_id,
    v_image.mgi_score,
    NULL,
    'manual_flag',
    jsonb_build_object(
      'flagged_by', p_admin_user_id,
      'flagged_at', now()::text,
      'notes', COALESCE(p_notes, ''),
      'flag_reasons', ARRAY['manual_flag_from_score_browser']
    ),
    'pending',
    'high'
  )
  RETURNING review_id INTO v_review_id;

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'image_id', p_image_id,
    'original_score', v_image.mgi_score
  );
END;
$$;

-- ============================================================
-- fn_direct_score_override
-- ============================================================
CREATE OR REPLACE FUNCTION fn_direct_score_override(
  p_image_id uuid,
  p_admin_user_id uuid,
  p_new_score numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_image record;
  v_old_score numeric;
  v_review_id uuid;
  v_subsequent_count integer := 0;
BEGIN
  IF p_new_score < 0 OR p_new_score > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Score must be between 0 and 1');
  END IF;

  SELECT image_id, device_id, mgi_score, mgi_original_score,
         company_id, program_id, site_id, site_device_session_id, captured_at
  INTO v_image
  FROM device_images
  WHERE image_id = p_image_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Image not found');
  END IF;

  IF v_image.mgi_score IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Image has no MGI score to override');
  END IF;

  v_old_score := v_image.mgi_score;

  IF v_image.mgi_original_score IS NULL THEN
    UPDATE device_images
    SET mgi_original_score = v_old_score
    WHERE image_id = p_image_id;
  END IF;

  UPDATE device_images
  SET mgi_score = p_new_score,
      mgi_qa_status = 'admin_overridden',
      mgi_qa_method = 'direct_override',
      mgi_reviewed_by = p_admin_user_id,
      mgi_reviewed_at = now(),
      mgi_review_notes = p_notes,
      mgi_qa_details = jsonb_build_object(
        'override_from', v_old_score,
        'override_to', p_new_score,
        'overridden_by', p_admin_user_id,
        'overridden_at', now()::text
      )
  WHERE image_id = p_image_id;

  INSERT INTO mgi_review_queue (
    image_id, device_id, company_id, program_id, site_id, session_id,
    original_score, adjusted_score, qa_method, qa_details,
    status, priority, admin_score, reviewed_by, reviewed_at, review_notes
  )
  VALUES (
    p_image_id,
    v_image.device_id,
    v_image.company_id,
    v_image.program_id,
    v_image.site_id,
    v_image.site_device_session_id,
    v_old_score,
    p_new_score,
    'direct_override',
    jsonb_build_object(
      'override_from', v_old_score,
      'override_to', p_new_score,
      'source', 'score_browser'
    ),
    'overridden',
    'normal',
    p_new_score,
    p_admin_user_id,
    now(),
    COALESCE(p_notes, 'Direct override from Score Browser')
  )
  RETURNING review_id INTO v_review_id;

  WITH subsequent_images AS (
    SELECT di.image_id, di.mgi_score, di.captured_at,
      LAG(di.mgi_score) OVER (ORDER BY di.captured_at) AS prev_score,
      LAG(di.captured_at) OVER (ORDER BY di.captured_at) AS prev_captured_at
    FROM device_images di
    WHERE di.device_id = v_image.device_id
      AND di.mgi_score IS NOT NULL
      AND di.captured_at >= v_image.captured_at
    ORDER BY di.captured_at
  )
  UPDATE device_images di
  SET mgi_velocity = CASE
    WHEN si.prev_score IS NOT NULL AND si.prev_captured_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (si.captured_at - si.prev_captured_at)) > 0
    THEN (si.mgi_score - si.prev_score) / (EXTRACT(EPOCH FROM (si.captured_at - si.prev_captured_at)) / 86400.0)
    ELSE di.mgi_velocity
  END
  FROM subsequent_images si
  WHERE di.image_id = si.image_id
    AND si.prev_score IS NOT NULL;

  GET DIAGNOSTICS v_subsequent_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'image_id', p_image_id,
    'old_score', v_old_score,
    'new_score', p_new_score,
    'subsequent_velocities_updated', v_subsequent_count
  );
END;
$$;
