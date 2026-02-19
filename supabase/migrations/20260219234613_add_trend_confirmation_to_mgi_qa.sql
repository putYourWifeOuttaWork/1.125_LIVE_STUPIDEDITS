/*
  # Add Trend Confirmation to MGI QA System

  1. Schema Changes
    - `mgi_qa_thresholds` table: add `trend_confirmation_threshold` column (integer, default 2)
      - Number of consecutive consistent Roboflow scores required before auto-accepting
        a flagged level shift without human review

  2. New Functions
    - `fn_check_trend_confirmation(p_device_id uuid)` -- called after each plausible score
      is accepted. Looks for pending reviews on the same device and checks whether
      subsequent accepted scores confirm a real level shift.
      - For each pending review:
        - Gets the original (flagged) score and the pre-flag context median
        - Checks N subsequent images (N = trend_confirmation_threshold) that were
          scored AFTER the flagged image and accepted by the plausibility gate
        - A subsequent score "confirms" the shift if it is closer to the original
          flagged score than to the pre-flag context median
        - If enough consecutive confirming scores exist, the review is auto-resolved
          and the original Roboflow score is restored

  3. Important Notes
    - Default threshold of 2 provides faster acceptance with slightly higher risk
    - Only non-critical priority reviews are eligible for trend confirmation
    - The function returns a summary of resolved review IDs for logging
    - Uses SECURITY DEFINER to access device_images and mgi_review_queue
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mgi_qa_thresholds'
      AND column_name = 'trend_confirmation_threshold'
  ) THEN
    ALTER TABLE mgi_qa_thresholds
      ADD COLUMN trend_confirmation_threshold integer NOT NULL DEFAULT 2;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_check_trend_confirmation(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_review RECORD;
  v_resolved_ids uuid[] := '{}';
  v_checked_count int := 0;
  v_threshold int;
  v_company_id uuid;
  v_site_id uuid;
  v_qa_details jsonb;
  v_median numeric;
  v_subsequent RECORD;
  v_confirm_count int;
  v_confirming_ids uuid[];
  v_confirming_scores numeric[];
BEGIN
  SELECT d.company_id INTO v_company_id
  FROM devices d WHERE d.device_id = p_device_id;

  SELECT sd.site_id INTO v_site_id
  FROM site_devices sd
  WHERE sd.device_id = p_device_id AND sd.is_active = true
  LIMIT 1;

  v_threshold := NULL;

  IF v_site_id IS NOT NULL THEN
    SELECT t.trend_confirmation_threshold INTO v_threshold
    FROM mgi_qa_thresholds t
    WHERE t.company_id = v_company_id
      AND t.site_id = v_site_id
      AND t.is_active = true;
  END IF;

  IF v_threshold IS NULL AND v_company_id IS NOT NULL THEN
    SELECT t.trend_confirmation_threshold INTO v_threshold
    FROM mgi_qa_thresholds t
    WHERE t.company_id = v_company_id
      AND t.site_id IS NULL
      AND t.is_active = true;
  END IF;

  v_threshold := COALESCE(v_threshold, 2);

  IF v_threshold < 1 THEN
    RETURN jsonb_build_object(
      'resolved', 0,
      'checked', 0,
      'threshold', v_threshold,
      'reason', 'trend_confirmation_disabled'
    );
  END IF;

  FOR v_review IN
    SELECT
      rq.review_id,
      rq.image_id,
      rq.original_score,
      rq.adjusted_score,
      rq.qa_details,
      rq.priority,
      di.captured_at AS flagged_captured_at
    FROM mgi_review_queue rq
    JOIN device_images di ON di.image_id = rq.image_id
    WHERE rq.device_id = p_device_id
      AND rq.status = 'pending'
      AND rq.priority != 'critical'
    ORDER BY di.captured_at ASC
  LOOP
    v_checked_count := v_checked_count + 1;

    v_median := NULL;
    IF v_review.qa_details IS NOT NULL AND v_review.qa_details ? 'median' THEN
      v_median := (v_review.qa_details->>'median')::numeric;
    END IF;

    IF v_median IS NULL THEN
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY sub.mgi_score)
      INTO v_median
      FROM (
        SELECT di2.mgi_score
        FROM device_images di2
        WHERE di2.device_id = p_device_id
          AND di2.mgi_score IS NOT NULL
          AND di2.image_id != v_review.image_id
          AND di2.captured_at < v_review.flagged_captured_at
          AND di2.mgi_qa_status NOT IN ('pending_review')
        ORDER BY di2.captured_at DESC
        LIMIT 5
      ) sub;
    END IF;

    IF v_median IS NULL THEN
      CONTINUE;
    END IF;

    v_confirm_count := 0;
    v_confirming_ids := '{}';
    v_confirming_scores := '{}';

    FOR v_subsequent IN
      SELECT di3.image_id, di3.mgi_score, di3.mgi_original_score, di3.captured_at
      FROM device_images di3
      WHERE di3.device_id = p_device_id
        AND di3.captured_at > v_review.flagged_captured_at
        AND di3.mgi_score IS NOT NULL
        AND di3.mgi_qa_status IN ('accepted', 'admin_confirmed')
        AND di3.image_id != v_review.image_id
      ORDER BY di3.captured_at ASC
    LOOP
      IF ABS(v_subsequent.mgi_score - v_review.original_score)
         < ABS(v_subsequent.mgi_score - v_median)
      THEN
        v_confirm_count := v_confirm_count + 1;
        v_confirming_ids := array_append(v_confirming_ids, v_subsequent.image_id);
        v_confirming_scores := array_append(v_confirming_scores, v_subsequent.mgi_score);
      ELSE
        v_confirm_count := 0;
        v_confirming_ids := '{}';
        v_confirming_scores := '{}';
      END IF;

      IF v_confirm_count >= v_threshold THEN
        EXIT;
      END IF;
    END LOOP;

    IF v_confirm_count >= v_threshold THEN
      UPDATE device_images
      SET
        mgi_score = v_review.original_score,
        mgi_original_score = v_review.original_score,
        mgi_adjusted_score = NULL,
        mgi_qa_status = 'accepted',
        mgi_qa_method = 'trend_confirmed',
        mgi_qa_details = jsonb_build_object(
          'trend_confirmed_at', now(),
          'threshold_used', v_threshold,
          'confirming_count', v_confirm_count,
          'confirming_image_ids', to_jsonb(v_confirming_ids),
          'confirming_scores', to_jsonb(v_confirming_scores),
          'pre_flag_median', v_median,
          'original_score', v_review.original_score,
          'previous_adjusted_score', v_review.adjusted_score
        ),
        mgi_reviewed_at = now()
      WHERE image_id = v_review.image_id;

      UPDATE mgi_review_queue
      SET
        status = 'auto_resolved',
        reviewed_at = now(),
        review_notes = format(
          'Auto-resolved by trend confirmation. %s consecutive scores confirmed the level shift from median %s to %s. Confirming scores: %s',
          v_confirm_count,
          round(v_median, 4),
          round(v_review.original_score, 4),
          array_to_string(
            ARRAY(SELECT round(s, 4)::text FROM unnest(v_confirming_scores) AS s),
            ', '
          )
        )
      WHERE review_id = v_review.review_id;

      UPDATE admin_notifications
      SET is_read = true
      WHERE reference_id = v_review.review_id::text
        AND reference_type = 'mgi_review_queue'
        AND is_read = false;

      v_resolved_ids := array_append(v_resolved_ids, v_review.review_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'resolved', array_length(v_resolved_ids, 1),
    'resolved_review_ids', to_jsonb(v_resolved_ids),
    'checked', v_checked_count,
    'threshold', v_threshold,
    'device_id', p_device_id
  );
END;
$fn$;
