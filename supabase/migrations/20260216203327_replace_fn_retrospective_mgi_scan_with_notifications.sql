/*
  # Replace fn_retrospective_mgi_scan with notification support

  1. Changes
    - Drops the old overload (boolean-first parameter order)
    - Recreates with uuid-first parameter order matching the RPC call convention
    - Adds admin_notifications creation for each flagged image
    - Returns consistent field names matching the TypeScript interface

  2. Important Notes
    - This is a function replacement, no data changes
    - The function is SECURITY DEFINER to access all device_images
*/

DO $$ BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.fn_retrospective_mgi_scan(boolean, uuid, uuid, uuid, timestamptz, timestamptz, integer)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.fn_retrospective_mgi_scan(uuid, uuid, uuid, timestamptz, timestamptz, integer, boolean)';
END $$;

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
  rec RECORD;
  v_result jsonb;
  v_total_scanned integer := 0;
  v_total_flagged integer := 0;
  v_skipped integer := 0;
  v_flagged_items jsonb := '[]'::jsonb;
  v_priority text;
  v_z_score numeric;
  v_growth_rate numeric;
  v_device_code text;
  v_new_review_id uuid;
BEGIN
  FOR rec IN
    SELECT
      di.image_id,
      di.device_id,
      di.mgi_score,
      di.captured_at,
      di.company_id,
      di.site_id,
      di.program_id,
      di.site_device_session_id
    FROM device_images di
    WHERE di.mgi_score IS NOT NULL
      AND di.mgi_qa_status = 'accepted'
      AND (p_device_id IS NULL OR di.device_id = p_device_id)
      AND (p_site_id IS NULL OR di.site_id = p_site_id)
      AND (p_company_id IS NULL OR di.company_id = p_company_id)
      AND (p_date_from IS NULL OR di.captured_at >= p_date_from)
      AND (p_date_to IS NULL OR di.captured_at <= p_date_to)
      AND NOT EXISTS (
        SELECT 1 FROM mgi_review_queue rq
        WHERE rq.image_id = di.image_id
      )
    ORDER BY di.captured_at ASC
    LIMIT p_limit
  LOOP
    v_total_scanned := v_total_scanned + 1;

    v_result := fn_check_mgi_plausibility(
      rec.device_id,
      rec.mgi_score,
      rec.captured_at
    );

    IF (v_result->>'plausible')::boolean = false THEN
      v_z_score := ABS(COALESCE((v_result->>'modified_z_score')::numeric, 0));
      v_growth_rate := COALESCE((v_result->>'growth_rate_per_hour')::numeric, 0);

      IF v_z_score > 7 OR v_growth_rate > 0.05 THEN
        v_priority := 'critical';
      ELSIF v_z_score > 5 OR v_growth_rate > 0.03 THEN
        v_priority := 'high';
      ELSE
        v_priority := 'normal';
      END IF;

      SELECT COALESCE(d.device_code, d.device_id::text)
      INTO v_device_code
      FROM devices d WHERE d.device_id = rec.device_id;

      v_flagged_items := v_flagged_items || jsonb_build_object(
        'image_id', rec.image_id,
        'device_id', rec.device_id,
        'device_code', v_device_code,
        'score', rec.mgi_score,
        'captured_at', rec.captured_at,
        'median', (v_result->>'median')::numeric,
        'modified_z_score', v_z_score,
        'growth_rate_per_hour', v_growth_rate,
        'flag_reasons', v_result->'flag_reasons',
        'priority', v_priority,
        'method', v_result->>'method'
      );

      IF NOT p_dry_run THEN
        v_new_review_id := gen_random_uuid();

        UPDATE device_images
        SET
          mgi_qa_status = 'pending_review',
          mgi_original_score = rec.mgi_score,
          mgi_adjusted_score = (v_result->>'adjusted_score')::numeric,
          mgi_qa_method = 'retrospective_scan_' || COALESCE(v_result->>'method', 'unknown'),
          mgi_qa_details = jsonb_build_object(
            'scan_type', 'retrospective',
            'scan_timestamp', now(),
            'plausibility_result', v_result
          ),
          mgi_confidence = (v_result->>'confidence')::numeric
        WHERE image_id = rec.image_id;

        INSERT INTO mgi_review_queue (
          review_id, image_id, device_id, company_id, program_id,
          site_id, session_id, original_score, adjusted_score,
          qa_method, qa_details, neighbor_image_ids, thresholds_used,
          status, priority
        ) VALUES (
          v_new_review_id,
          rec.image_id,
          rec.device_id,
          rec.company_id,
          rec.program_id,
          rec.site_id,
          rec.site_device_session_id,
          rec.mgi_score,
          (v_result->>'adjusted_score')::numeric,
          'retrospective_scan_' || COALESCE(v_result->>'method', 'unknown'),
          jsonb_build_object(
            'scan_type', 'retrospective',
            'plausibility_result', v_result
          ),
          CASE
            WHEN v_result->'context_image_ids' IS NOT NULL
            THEN ARRAY(SELECT jsonb_array_elements_text(v_result->'context_image_ids'))::uuid[]
            ELSE NULL
          END,
          v_result->'thresholds_used',
          'pending',
          v_priority
        );

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
          format('Retrospective outlier: %s (score %.2f)', v_device_code, rec.mgi_score),
          format(
            'Historical scan flagged image from %s. Score %.4f vs median %.4f (z=%.1f). Reasons: %s',
            v_device_code,
            rec.mgi_score,
            COALESCE((v_result->>'median')::numeric, 0),
            v_z_score,
            v_result->>'flag_reasons'
          ),
          v_priority,
          rec.company_id,
          rec.site_id,
          'unread'
        );
      END IF;

      v_total_flagged := v_total_flagged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_scanned', v_total_scanned,
    'total_flagged', v_total_flagged,
    'skipped_already_reviewed', v_skipped,
    'flagged_items', v_flagged_items,
    'dry_run', p_dry_run,
    'ran_at', now()
  );
END;
$function$;
