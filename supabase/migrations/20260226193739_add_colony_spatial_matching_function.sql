/*
  # Add Colony Spatial Matching Function

  Creates `fn_match_colony_tracks` which links individual mold detections
  across consecutive images from the same device using nearest-neighbor
  spatial matching.

  1. New Functions
    - `fn_match_colony_tracks(p_image_id uuid, p_device_id uuid, p_company_id uuid)`
      Greedy nearest-neighbor matcher that:
      - Fetches new detections for the given image
      - Fetches the most recent previous detections for the same device
      - Pairs detections within a pixel-distance threshold (default 40px)
      - Assigns existing track_id to matched detections
      - Creates new colony_tracks rows for unmatched detections
      - Increments consecutive_misses for tracks not seen in new image
      - Marks tracks as 'lost' after 3 consecutive misses

  2. Important Notes
    - Uses SECURITY DEFINER so edge functions (service role) can call it
    - Distance threshold of 40px works for fixed-camera 1280x1024 images
    - Growth factor is calculated as latest_area / initial_area
    - The function is idempotent; re-running it for the same image
      will not create duplicate tracks
*/

CREATE OR REPLACE FUNCTION fn_match_colony_tracks(
  p_image_id uuid,
  p_device_id uuid,
  p_company_id uuid,
  p_distance_threshold numeric DEFAULT 40.0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_detections jsonb;
  v_prev_image_id uuid;
  v_prev_detections jsonb;
  v_new_det jsonb;
  v_prev_det jsonb;
  v_best_dist numeric;
  v_best_prev_id text;
  v_best_track_id uuid;
  v_dist numeric;
  v_matched_prev_ids text[] := '{}';
  v_matched_count integer := 0;
  v_new_track_count integer := 0;
  v_lost_count integer := 0;
  v_new_track_id uuid;
  v_area numeric;
  v_captured_at timestamptz;
BEGIN
  SELECT captured_at INTO v_captured_at
  FROM device_images
  WHERE image_id = p_image_id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'detection_id', detection_id,
    'x', x,
    'y', y,
    'width', width,
    'height', height,
    'area', area,
    'track_id', track_id
  ))
  INTO v_new_detections
  FROM colony_detection_details
  WHERE image_id = p_image_id;

  IF v_new_detections IS NULL OR jsonb_array_length(v_new_detections) = 0 THEN
    RETURN jsonb_build_object(
      'matched', 0, 'new_tracks', 0, 'lost', 0, 'total_detections', 0
    );
  END IF;

  SELECT DISTINCT cdd.image_id
  INTO v_prev_image_id
  FROM colony_detection_details cdd
  WHERE cdd.device_id = p_device_id
    AND cdd.captured_at < v_captured_at
  ORDER BY cdd.image_id
  LIMIT 1;

  IF v_prev_image_id IS NULL THEN
    FOR v_new_det IN SELECT * FROM jsonb_array_elements(v_new_detections)
    LOOP
      IF (v_new_det->>'track_id') IS NOT NULL THEN
        CONTINUE;
      END IF;

      v_area := (v_new_det->>'area')::numeric;
      v_new_track_id := gen_random_uuid();

      INSERT INTO colony_tracks (
        track_id, device_id, company_id, first_seen_image_id,
        first_seen_at, last_seen_at, detection_count,
        initial_area, latest_area, growth_factor,
        avg_x, avg_y, status, consecutive_misses
      ) VALUES (
        v_new_track_id, p_device_id, p_company_id, p_image_id,
        v_captured_at, v_captured_at, 1,
        v_area, v_area, 1.0,
        (v_new_det->>'x')::numeric, (v_new_det->>'y')::numeric,
        'active', 0
      );

      UPDATE colony_detection_details
      SET track_id = v_new_track_id
      WHERE id = (v_new_det->>'id')::uuid;

      v_new_track_count := v_new_track_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
      'matched', 0,
      'new_tracks', v_new_track_count,
      'lost', 0,
      'total_detections', jsonb_array_length(v_new_detections)
    );
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'detection_id', detection_id,
    'x', x,
    'y', y,
    'area', area,
    'track_id', track_id
  ))
  INTO v_prev_detections
  FROM colony_detection_details
  WHERE image_id = v_prev_image_id
    AND track_id IS NOT NULL;

  FOR v_new_det IN SELECT * FROM jsonb_array_elements(v_new_detections)
  LOOP
    IF (v_new_det->>'track_id') IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_best_dist := p_distance_threshold + 1;
    v_best_prev_id := NULL;
    v_best_track_id := NULL;

    IF v_prev_detections IS NOT NULL THEN
      FOR v_prev_det IN SELECT * FROM jsonb_array_elements(v_prev_detections)
      LOOP
        IF (v_prev_det->>'id')::text = ANY(v_matched_prev_ids) THEN
          CONTINUE;
        END IF;

        v_dist := sqrt(
          power((v_new_det->>'x')::numeric - (v_prev_det->>'x')::numeric, 2) +
          power((v_new_det->>'y')::numeric - (v_prev_det->>'y')::numeric, 2)
        );

        IF v_dist < v_best_dist THEN
          v_best_dist := v_dist;
          v_best_prev_id := (v_prev_det->>'id')::text;
          v_best_track_id := (v_prev_det->>'track_id')::uuid;
        END IF;
      END LOOP;
    END IF;

    IF v_best_track_id IS NOT NULL AND v_best_dist <= p_distance_threshold THEN
      UPDATE colony_detection_details
      SET track_id = v_best_track_id
      WHERE id = (v_new_det->>'id')::uuid;

      v_area := (v_new_det->>'area')::numeric;

      UPDATE colony_tracks
      SET
        last_seen_at = v_captured_at,
        detection_count = detection_count + 1,
        latest_area = v_area,
        growth_factor = CASE WHEN initial_area > 0 THEN v_area / initial_area ELSE 1.0 END,
        avg_x = (avg_x * detection_count + (v_new_det->>'x')::numeric) / (detection_count + 1),
        avg_y = (avg_y * detection_count + (v_new_det->>'y')::numeric) / (detection_count + 1),
        consecutive_misses = 0,
        status = 'active',
        updated_at = now()
      WHERE track_id = v_best_track_id;

      v_matched_prev_ids := array_append(v_matched_prev_ids, v_best_prev_id);
      v_matched_count := v_matched_count + 1;
    ELSE
      v_area := (v_new_det->>'area')::numeric;
      v_new_track_id := gen_random_uuid();

      INSERT INTO colony_tracks (
        track_id, device_id, company_id, first_seen_image_id,
        first_seen_at, last_seen_at, detection_count,
        initial_area, latest_area, growth_factor,
        avg_x, avg_y, status, consecutive_misses
      ) VALUES (
        v_new_track_id, p_device_id, p_company_id, p_image_id,
        v_captured_at, v_captured_at, 1,
        v_area, v_area, 1.0,
        (v_new_det->>'x')::numeric, (v_new_det->>'y')::numeric,
        'active', 0
      );

      UPDATE colony_detection_details
      SET track_id = v_new_track_id
      WHERE id = (v_new_det->>'id')::uuid;

      v_new_track_count := v_new_track_count + 1;
    END IF;
  END LOOP;

  UPDATE colony_tracks
  SET
    consecutive_misses = consecutive_misses + 1,
    status = CASE WHEN consecutive_misses + 1 >= 3 THEN 'lost' ELSE status END,
    updated_at = now()
  WHERE device_id = p_device_id
    AND status = 'active'
    AND track_id NOT IN (
      SELECT DISTINCT cdd.track_id
      FROM colony_detection_details cdd
      WHERE cdd.image_id = p_image_id
        AND cdd.track_id IS NOT NULL
    );

  GET DIAGNOSTICS v_lost_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'matched', v_matched_count,
    'new_tracks', v_new_track_count,
    'lost', v_lost_count,
    'total_detections', jsonb_array_length(v_new_detections)
  );
END;
$$;
