/*
  # Add MGI Audit Log and Bulk Score Browser Actions

  1. Schema Changes
    - `device_images`: Add `mgi_audit_log` JSONB column (default '[]')
      - Append-only array tracking every QA status change, score override, and export event
      - Each entry contains: action, old/new values, changed_by, changed_at, method, notes
    - GIN index on `mgi_audit_log` for efficient querying

  2. New Functions
    - `fn_bulk_score_browser_action`: Bulk QA status change or score override on selected images
      - Accepts array of image IDs, action type, new value, admin user, notes
      - Appends audit entries to mgi_audit_log for each affected row
      - Recalculates velocities for score overrides
    - `fn_log_bulk_export`: Records export events in the audit trail
      - Accepts array of image IDs, admin user, export format
      - Appends export audit entries without modifying score/status data

  3. Security
    - Both functions use SECURITY DEFINER with search_path set to public
    - Caller must pass authenticated user ID
*/

-- 1. Add mgi_audit_log column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_images' AND column_name = 'mgi_audit_log'
  ) THEN
    ALTER TABLE device_images ADD COLUMN mgi_audit_log jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_images_mgi_audit_log
  ON device_images USING gin (mgi_audit_log);

-- 2. Bulk score browser action function
CREATE OR REPLACE FUNCTION fn_bulk_score_browser_action(
  p_image_ids uuid[],
  p_action text,
  p_new_qa_status text DEFAULT NULL,
  p_new_score numeric DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_image record;
  v_audit_entry jsonb;
  v_succeeded int := 0;
  v_failed int := 0;
  v_total int;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  v_total := coalesce(array_length(p_image_ids, 1), 0);

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'total', 0, 'succeeded', 0, 'failed', 0, 'errors', '[]'::jsonb
    );
  END IF;

  IF p_action NOT IN ('set_qa_status', 'override_score') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Invalid action. Must be set_qa_status or override_score'
    );
  END IF;

  IF p_action = 'set_qa_status' AND p_new_qa_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_new_qa_status is required for set_qa_status');
  END IF;

  IF p_action = 'override_score' AND (p_new_score IS NULL OR p_new_score < 0 OR p_new_score > 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_new_score must be between 0 and 1');
  END IF;

  FOREACH v_id IN ARRAY p_image_ids LOOP
    BEGIN
      SELECT image_id, device_id, mgi_score, mgi_original_score,
             mgi_qa_status, mgi_audit_log,
             company_id, program_id, site_id, site_device_session_id, captured_at
      INTO v_image
      FROM device_images
      WHERE image_id = v_id;

      IF NOT FOUND THEN
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_object('image_id', v_id, 'error', 'Image not found');
        CONTINUE;
      END IF;

      IF p_action = 'set_qa_status' THEN
        v_audit_entry := jsonb_build_object(
          'action', 'qa_status_change',
          'old_value', coalesce(v_image.mgi_qa_status, 'accepted'),
          'new_value', p_new_qa_status,
          'changed_by', p_admin_user_id,
          'changed_at', now()::text,
          'method', 'bulk_score_browser',
          'notes', coalesce(p_notes, '')
        );

        UPDATE device_images
        SET mgi_qa_status = p_new_qa_status,
            mgi_reviewed_by = p_admin_user_id,
            mgi_reviewed_at = now(),
            mgi_review_notes = coalesce(p_notes, mgi_review_notes),
            mgi_audit_log = coalesce(mgi_audit_log, '[]'::jsonb) || jsonb_build_array(v_audit_entry)
        WHERE image_id = v_id;

        v_succeeded := v_succeeded + 1;

      ELSIF p_action = 'override_score' THEN
        IF v_image.mgi_score IS NULL THEN
          v_failed := v_failed + 1;
          v_errors := v_errors || jsonb_build_object('image_id', v_id, 'error', 'No MGI score to override');
          CONTINUE;
        END IF;

        v_audit_entry := jsonb_build_object(
          'action', 'score_override',
          'old_score', v_image.mgi_score,
          'new_score', p_new_score,
          'old_qa_status', coalesce(v_image.mgi_qa_status, 'accepted'),
          'new_qa_status', 'admin_overridden',
          'changed_by', p_admin_user_id,
          'changed_at', now()::text,
          'method', 'bulk_score_browser',
          'notes', coalesce(p_notes, '')
        );

        IF v_image.mgi_original_score IS NULL THEN
          UPDATE device_images
          SET mgi_original_score = mgi_score
          WHERE image_id = v_id;
        END IF;

        UPDATE device_images
        SET mgi_score = p_new_score,
            mgi_qa_status = 'admin_overridden',
            mgi_qa_method = 'bulk_override',
            mgi_reviewed_by = p_admin_user_id,
            mgi_reviewed_at = now(),
            mgi_review_notes = coalesce(p_notes, mgi_review_notes),
            mgi_qa_details = jsonb_build_object(
              'override_from', v_image.mgi_score,
              'override_to', p_new_score,
              'overridden_by', p_admin_user_id,
              'overridden_at', now()::text,
              'source', 'bulk_score_browser'
            ),
            mgi_audit_log = coalesce(mgi_audit_log, '[]'::jsonb) || jsonb_build_array(v_audit_entry)
        WHERE image_id = v_id;

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

        v_succeeded := v_succeeded + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('image_id', v_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_failed = 0,
    'total', v_total,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;

-- 3. Log bulk export function
CREATE OR REPLACE FUNCTION fn_log_bulk_export(
  p_image_ids uuid[],
  p_admin_user_id uuid,
  p_export_format text DEFAULT 'csv'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_entry jsonb;
  v_count int;
BEGIN
  v_audit_entry := jsonb_build_object(
    'action', 'export',
    'exported_by', p_admin_user_id,
    'exported_at', now()::text,
    'export_format', p_export_format,
    'batch_size', coalesce(array_length(p_image_ids, 1), 0)
  );

  UPDATE device_images
  SET mgi_audit_log = coalesce(mgi_audit_log, '[]'::jsonb) || jsonb_build_array(v_audit_entry)
  WHERE image_id = ANY(p_image_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'images_logged', v_count,
    'export_format', p_export_format
  );
END;
$$;
