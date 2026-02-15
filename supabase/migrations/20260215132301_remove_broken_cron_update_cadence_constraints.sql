/*
  # Remove broken cron, update cadence constraints, set timezones

  1. Removed
    - hourly-snapshot-generation cron job (broken, never succeeded)

  2. Updated
    - generate-site-snapshots cron from hourly to every 15 minutes
    - snapshot_cadence_per_day constraint expanded to allow 48 and 96
    - snapshot_cadence_hours constraint minimum lowered to 0.25 (15 min)
    - Active IoT sites set to 96 snapshots per day (every 15 min)
    - All sites with null timezone set to America/New_York

  3. Important Notes
    - is_snapshot_due() already handles the math correctly for any cadence value
    - Does NOT touch MQTT service or device communication code
*/

SELECT cron.unschedule('hourly-snapshot-generation');

SELECT cron.unschedule('generate-site-snapshots');
SELECT cron.schedule(
  'generate-site-snapshots',
  '*/15 * * * *',
  $$SELECT generate_scheduled_snapshots();$$
);

ALTER TABLE sites
  DROP CONSTRAINT IF EXISTS sites_snapshot_cadence_per_day_check;

ALTER TABLE sites
  ADD CONSTRAINT sites_snapshot_cadence_per_day_check
  CHECK (snapshot_cadence_per_day = ANY (ARRAY[1, 3, 6, 12, 24, 48, 96]));

ALTER TABLE sites
  DROP CONSTRAINT IF EXISTS sites_snapshot_cadence_hours_check;

ALTER TABLE sites
  ADD CONSTRAINT sites_snapshot_cadence_hours_check
  CHECK (snapshot_cadence_hours >= 0.25 AND snapshot_cadence_hours <= 24);

UPDATE sites
SET snapshot_cadence_per_day = 96,
    snapshot_cadence_hours = 1
WHERE site_id IN (
  '7a8b6abb-94e8-42af-b7ab-bae0ae0a85c5',
  '4a21ccd9-56c5-48b2-90ca-c5fb756803d6',
  '6f324a67-6e03-4d0f-a3da-df68d8e70a10'
);

UPDATE sites
SET timezone = 'America/New_York'
WHERE timezone IS NULL;
