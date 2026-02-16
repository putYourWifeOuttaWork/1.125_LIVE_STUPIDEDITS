/*
  # Retrospective MGI Outlier Scan Function

  1. New Functions
    - `fn_retrospective_mgi_scan` - Scans historical device_images through the existing
      plausibility detection logic and flags outliers into the review queue.

  2. Purpose
    - Allows admins to retroactively check all previously-scored images for statistical
      outliers that predate the QA system deployment.
    - Supports dry_run mode (report only, no writes) and live mode (flags + queue inserts).
    - Reuses `fn_check_mgi_plausibility` -- no duplicated detection logic.

  3. Parameters
    - p_company_id  (optional) - filter to a single company
    - p_site_id     (optional) - filter to a single site
    - p_device_id   (optional) - filter to a single device
    - p_date_from   (optional) - earliest captured_at to scan
    - p_date_to     (optional) - latest captured_at to scan
    - p_limit       (integer)  - max images to scan per invocation (default 500)
    - p_dry_run     (boolean)  - if true, only report findings without writing

  4. Returns
    - JSONB: { total_scanned, total_flagged, flagged_items[], skipped_already_reviewed, dry_run }

  5. Important Notes
    - Skips images already in mgi_review_queue (no duplicates)
    - Skips images with mgi_qa_status != 'accepted' (already under review)
    - Does NOT change mgi_score values -- detection only
    - Creates admin_notifications for each flagged item when not in dry_run mode
*/

CREATE OR REPLACE FUNCTION public.fn_retrospective_mgi_scan(
  p_company_id uuid DEFAULT NULL,
  p_site_id uuid DEFAULT NULL,
  p_device_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_image RECORD;
  v_result jsonb;
  v_total_scanned integer := 0;
  v_total_flagged integer := 0;
  v_skipped_already integer := 0;
  v_flagged_items jsonb := '[]'::jsonb;
  v_priority text;
  v_z_score numeric;
  v_growth_rate numeric;
  v_new_review_id uuid;
  v_device_code text;
BEGIN
  FOR v_image IN
    SELECT
      di.image_id,
      di.device_id,
      di.mgi_score,
      di.captured_at,
      di.company_id,
      di.site_id,
      di.program_id,
      di.site_device_session_id,
      di.mgi_qa_status,
      d.device_code
    FROM device_images di
    JOIN devices d ON d.device_id = di.device_id
    WHERE di.mgi_score IS NOT NULL
      AND (p_company_id IS NULL OR di.company_id = p_company_id)
      AND (p_site_id IS NULL OR di.site_id = p_site_id)
      AND (p_device_id IS NULL OR di.device_id = p_device_id)
      AND (p_date_from IS NULL OR di.captured_at >= p_date_from)
      AND (p_date_to IS NULL OR di.captured_at <= p_date_to)
    ORDER BY di.captured_at ASC
    LIMIT p_limit
  LOOP
    v_total_scanned := v_total_scanned + 1;

    IF v_image.mgi_qa_status != 'accepted' THEN
      v_skipped_already := v_skipped_already + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM mgi_review_queue rq WHERE rq.image_id = v_image.image_id
    ) THEN
      v_skipped_already := v_skipped_already + 1;
      CONTINUE;
    END IF;

    v_result := fn_check_mgi_plausibility(
      v_image.device_id,
      v_image.mgi_score,
      v_image.captured_at
    );

    IF (v_result->>'plausible')::boolean = false THEN
      v_z_score := COALESCE((v_result->>'modified_z_score')::numeric, 0);
      v_growth_rate := COALESCE((v_result->>'growth_rate_per_hour')::numeric, 0);

      IF ABS(v_z_score) > 7 OR v_growth_rate > 0.05 THEN
        v_priority := 'critical';
      ELSIF ABS(v_z_score) > 5 OR v_growth_rate > 0.03 THEN
        v_priority := 'high';
      ELSE
        v_priority := 'normal';
      END IF;

      v_total_flagged := v_total_flagged + 1;

      v_flagged_items := v_flagged_items || jsonb_build_object(
        'image_id', v_image.image_id,
        'device_id', v_image.device_id,
        'device_code', v_image.device_code,
        'score', v_image.mgi_score,
        'captured_at', v_image.captured_at,
        'median', (v_result->>'median')::numeric,
        'modified_z_score', v_z_score,
        'growth_rate_per_hour', v_growth_rate,
        'flag_reasons', v_result->'flag_reasons',
        'priority', v_priority,
        'method', v_result->>'method'
      );

      IF NOT p_dry_run THEN
        v_new_review_id := gen_random_uuid();

        INSERT INTO mgi_review_queue (
          review_id, image_id, device_id, company_id, program_id,
          site_id, session_id, original_score, adjusted_score,
          qa_method, qa_details, neighbor_image_ids, thresholds_used,
          status, priority
        ) VALUES (
          v_new_review_id,
          v_image.image_id,
          v_image.device_id,
          v_image.company_id,
          v_image.program_id,
          v_image.site_id,
          v_image.site_device_session_id,
          v_image.mgi_score,
          (v_result->>'adjusted_score')::numeric,
          'retrospective_scan_' || COALESCE(v_result->>'method', 'unknown'),
          v_result,
          CASE
            WHEN v_result->'context_image_ids' IS NOT NULL
            THEN ARRAY(SELECT jsonb_array_elements_text(v_result->'context_image_ids'))::uuid[]
            ELSE NULL
          END,
          v_result->'thresholds_used',
          'pending',
          v_priority
        );

        UPDATE device_images
        SET
          mgi_qa_status = 'pending_review',
          mgi_original_score = mgi_score,
          mgi_adjusted_score = (v_result->>'adjusted_score')::numeric,
          mgi_qa_method = 'retrospective_scan',
          mgi_qa_details = jsonb_build_object(
            'scan_type', 'retrospective',
            'scanned_at', now(),
            'plausibility_result', v_result
          )
        WHERE image_id = v_image.image_id;

        INSERT INTO admin_notifications (
          notification_id,
          notification_type,
          reference_id,
          reference_type,
          title,
          body,
          severity,
          company_id,
          site_id,
          status
        ) VALUES (
          gen_random_uuid(),
          'mgi_review_required',
          v_new_review_id,
          'mgi_review',
          format('Retrospective outlier: %s (score %.2f)', v_image.device_code, v_image.mgi_score),
          format(
            'Historical scan flagged image from %s. Score %.4f vs median %.4f (z=%.1f). Reasons: %s',
            v_image.device_code,
            v_image.mgi_score,
            COALESCE((v_result->>'median')::numeric, 0),
            v_z_score,
            v_result->>'flag_reasons'
          ),
          v_priority,
          v_image.company_id,
          v_image.site_id,
          'unread'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_scanned', v_total_scanned,
    'total_flagged', v_total_flagged,
    'skipped_already_reviewed', v_skipped_already,
    'flagged_items', v_flagged_items,
    'dry_run', p_dry_run,
    'ran_at', now()
  );
END;
$function$;
