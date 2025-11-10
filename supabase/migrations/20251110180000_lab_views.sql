/*
  # Lab Views for Device Monitoring

  1. New Views
    - `vw_site_day_sessions` - Site device sessions with metrics
    - `vw_session_payloads` - Device wake payloads for a session
    - `vw_images_observations` - Device images linked to observations
    - `vw_ingest_live` - Live feed of all device ingestion events

  2. Security
    - All views use SECURITY INVOKER to respect RLS
    - Views filter by company_id through RLS on underlying tables
*/

-- 1. Site Day Sessions View
-- Shows session-level metrics for a site on a given day
CREATE OR REPLACE VIEW public.vw_site_day_sessions
WITH (security_invoker = true)
AS
SELECT
  sds.session_id,
  sds.company_id,
  sds.program_id,
  sds.site_id,
  sds.session_date,
  sds.session_start_time,
  sds.session_end_time,
  sds.status,
  sds.expected_wake_count,
  sds.completed_wake_count,
  sds.failed_wake_count,
  sds.extra_wake_count,
  si.site_name,
  si.timezone,
  si.active_device_count
FROM public.site_device_sessions sds
JOIN public.sites si ON si.site_id = sds.site_id;

-- 2. Session Payloads View
-- Shows all device wake payloads for a session
CREATE OR REPLACE VIEW public.vw_session_payloads
WITH (security_invoker = true)
AS
SELECT
  dwp.payload_id,
  dwp.session_id,
  dwp.device_id,
  dwp.captured_at,
  dwp.received_at,
  dwp.wake_status,
  dwp.battery_voltage,
  dwp.signal_strength,
  d.device_name,
  d.device_mac,
  d.device_type,
  -- Count images for this payload
  (
    SELECT COUNT(*)
    FROM public.device_images di
    WHERE di.payload_id = dwp.payload_id
  ) as image_count,
  -- Count complete images
  (
    SELECT COUNT(*)
    FROM public.device_images di
    WHERE di.payload_id = dwp.payload_id
    AND di.image_status = 'complete'
  ) as complete_image_count
FROM public.device_wake_payloads dwp
JOIN public.devices d ON d.device_id = dwp.device_id;

-- 3. Images and Observations View
-- Shows device images with their linked observations
CREATE OR REPLACE VIEW public.vw_images_observations
WITH (security_invoker = true)
AS
SELECT
  di.image_id,
  di.device_id,
  di.payload_id,
  di.image_name,
  di.captured_at,
  di.received_at,
  di.total_chunks,
  di.received_chunks,
  di.image_status,
  di.image_url,
  di.retry_count,
  di.resent_received_at,
  d.device_name,
  d.device_mac,
  -- Observation linkage
  po.observation_id,
  po.submission_id
FROM public.device_images di
JOIN public.devices d ON d.device_id = di.device_id
LEFT JOIN public.petri_observations po ON po.image_id = di.image_id;

-- 4. Live Ingest Feed View
-- Shows recent ingestion events across all types
CREATE OR REPLACE VIEW public.vw_ingest_live
WITH (security_invoker = true)
AS
-- Device wake payloads
SELECT
  dwp.payload_id as id,
  'payload' as kind,
  dwp.received_at as ts,
  d.device_name,
  d.device_mac,
  dwp.wake_status as status,
  NULL::text as image_name,
  NULL::integer as chunks_received,
  NULL::integer as total_chunks
FROM public.device_wake_payloads dwp
JOIN public.devices d ON d.device_id = dwp.device_id

UNION ALL

-- Device images
SELECT
  di.image_id as id,
  'image' as kind,
  di.received_at as ts,
  d.device_name,
  d.device_mac,
  di.image_status as status,
  di.image_name,
  di.received_chunks as chunks_received,
  di.total_chunks
FROM public.device_images di
JOIN public.devices d ON d.device_id = di.device_id

UNION ALL

-- Petri observations
SELECT
  po.observation_id as id,
  'observation' as kind,
  po.created_at as ts,
  d.device_name,
  d.device_mac,
  'linked' as status,
  di.image_name,
  NULL::integer as chunks_received,
  NULL::integer as total_chunks
FROM public.petri_observations po
JOIN public.device_images di ON di.image_id = po.image_id
JOIN public.devices d ON d.device_id = di.device_id;
