-- Ensure pg_cron extension is available
DO $$
BEGIN
  -- Create the extension if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  END IF;
  
  -- Check if we successfully created the extension or if it already exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule the job if the extension exists
    SELECT cron.schedule(
      'auto-create-daily-sessions',  -- job name
      '1 0 * * *',                   -- cron schedule (1 minute past midnight, every day)
      $$SELECT auto_create_daily_sessions()$$
    );
    
    -- Add a comment about the scheduled job
    COMMENT ON TABLE cron.job IS 'Scheduled jobs including auto-create-daily-sessions which runs at 1 minute past midnight daily to create unclaimed sessions for all active sites.';
  ELSE
    -- If extension creation failed, raise a warning but continue
    RAISE WARNING 'pg_cron extension not available. Daily sessions will need to be scheduled externally.';
    
    -- Create a placeholder function that can be called from an external scheduler
    -- This is just a fallback in case pg_cron isn't available
    CREATE OR REPLACE FUNCTION trigger_daily_sessions()
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      RETURN auto_create_daily_sessions();
    END;
    $$;
    
    GRANT EXECUTE ON FUNCTION trigger_daily_sessions() TO service_role;
    
    COMMENT ON FUNCTION trigger_daily_sessions IS 'Function to be called daily by an external scheduler to create unclaimed sessions if pg_cron is not available.';
  END IF;
END
$$;