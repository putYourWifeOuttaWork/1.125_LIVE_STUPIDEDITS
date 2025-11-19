-- Add snapshot_cadence_per_day to sites
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS snapshot_cadence_per_day integer NOT NULL DEFAULT 3 CHECK (snapshot_cadence_per_day IN (1, 3, 6, 12, 24));

COMMENT ON COLUMN public.sites.snapshot_cadence_per_day IS 'Number of snapshots to generate per day (1, 3, 6, 12, or 24). Determines how often site state is captured for analytics.';
