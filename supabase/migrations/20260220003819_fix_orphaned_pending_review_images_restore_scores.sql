/*
  # Restore original Roboflow scores for orphaned pending-review images

  1. Problem
    - 81 device_images have mgi_qa_status = 'pending_review' but no matching
      mgi_review_queue entry (caused by a field-name mismatch in the
      score_mgi_image edge function that made the insert silently fail)
    - Their displayed mgi_score is stuck at the auto-corrected median (~0.35)
      instead of the real Roboflow score (0.65-0.95)

  2. Fix
    - For every orphaned image, restore mgi_score and mgi_adjusted_score
      to the original Roboflow score (mgi_original_score)
    - Set mgi_qa_status to 'accepted'
    - Preserve mgi_original_score and mgi_qa_details for audit trail

  3. Scope
    - Only affects images where mgi_qa_status = 'pending_review'
      AND no mgi_review_queue row exists
    - Does NOT touch images that have a proper review queue entry
*/

UPDATE device_images
SET
  mgi_score          = mgi_original_score,
  mgi_adjusted_score = mgi_original_score,
  mgi_qa_status      = 'accepted'
WHERE mgi_qa_status = 'pending_review'
  AND mgi_original_score IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM mgi_review_queue rq
    WHERE rq.image_id = device_images.image_id
  );
