/*
  # Add Bulk MGI Review Completion Function

  1. New Functions
    - `fn_bulk_complete_mgi_reviews` - Processes multiple MGI review queue items
      in a single transaction with the same decision, optional admin score, and notes.
      Wraps the same core logic as `fn_complete_mgi_review` for each item.

  2. Parameters
    - `p_review_ids` (uuid[]) - Array of review IDs to process
    - `p_admin_user_id` (uuid) - The admin performing the review
    - `p_decision` (text) - One of: confirm_adjusted, override_with_value, confirm_original, dismiss
    - `p_admin_score` (numeric, optional) - Required when decision is override_with_value
    - `p_notes` (text, optional) - Shared review notes applied to all items

  3. Returns
    - JSON object with: total, succeeded, failed, and per-item results array

  4. Security
    - SECURITY DEFINER to match fn_complete_mgi_review privileges
*/

CREATE OR REPLACE FUNCTION public.fn_bulk_complete_mgi_reviews(
  p_review_ids uuid[],
  p_admin_user_id uuid,
  p_decision text,
  p_admin_score numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_results jsonb[] := '{}';
  v_succeeded int := 0;
  v_failed int := 0;
  v_total int;
BEGIN
  v_total := array_length(p_review_ids, 1);

  IF v_total IS NULL OR v_total = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'total', 0,
      'succeeded', 0,
      'failed', 0,
      'results', '[]'::jsonb
    );
  END IF;

  FOREACH v_id IN ARRAY p_review_ids LOOP
    v_result := public.fn_complete_mgi_review(
      p_review_id   := v_id,
      p_admin_user_id := p_admin_user_id,
      p_decision     := p_decision,
      p_admin_score  := p_admin_score,
      p_notes        := p_notes
    );

    IF (v_result ->> 'success')::boolean THEN
      v_succeeded := v_succeeded + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;

    v_results := array_append(v_results, v_result || jsonb_build_object('review_id', v_id));
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_failed = 0,
    'total', v_total,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'results', to_jsonb(v_results)
  );
END;
$function$;
