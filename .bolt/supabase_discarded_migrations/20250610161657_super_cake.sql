-- Since we can't create the actual function in a migration, we'll just add a placeholder comment
COMMENT ON FUNCTION expire_incomplete_sessions IS 
'This function should be called by a scheduled Edge Function at 11:59 PM to expire sessions that are still open from the current day.';

COMMENT ON FUNCTION cleanup_incomplete_observations IS 
'This function should be called by a scheduled Edge Function after expiring sessions to clean up incomplete observations.';