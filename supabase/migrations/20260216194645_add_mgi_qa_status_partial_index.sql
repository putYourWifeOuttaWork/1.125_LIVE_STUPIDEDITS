/*
  # Add partial index on mgi_qa_status for efficient review queue queries

  1. New Indexes
    - Partial index on `device_images.mgi_qa_status` WHERE status is NOT 'accepted'
      - Covers 'flagged', 'adjusted', 'pending_review', 'admin_confirmed', 'admin_overridden'
      - Keeps index small since most images will be 'accepted'

  2. Important Notes
    - This index accelerates the MGI Review Queue page queries
    - Only non-accepted statuses are indexed for efficiency
*/

CREATE INDEX IF NOT EXISTS idx_device_images_mgi_qa_non_accepted
  ON device_images (mgi_qa_status)
  WHERE mgi_qa_status IS NOT NULL AND mgi_qa_status != 'accepted';
