/*
  # Auto-notify on Alert Creation

  Automatically trigger notification system when new alerts are created
*/

-- Function to trigger alert notification via Edge Function
CREATE OR REPLACE FUNCTION notify_alert_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call Edge Function asynchronously via pg_net (if available) or http extension
  -- For now, we'll use a simple approach with Supabase Edge Functions

  PERFORM
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/notify_alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'alert_id', NEW.id
      )
    );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the alert creation
    RAISE WARNING 'Failed to trigger notification for alert %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger (only for new unacknowledged alerts)
DROP TRIGGER IF EXISTS trigger_notify_alert_created ON device_alerts;

CREATE TRIGGER trigger_notify_alert_created
  AFTER INSERT ON device_alerts
  FOR EACH ROW
  WHEN (NEW.is_acknowledged = false)
  EXECUTE FUNCTION notify_alert_created();

-- Alternative: Manual notification function for testing
CREATE OR REPLACE FUNCTION manually_notify_alert(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- This function can be called manually to test notifications
  -- Example: SELECT manually_notify_alert('alert-id-here');

  PERFORM
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/notify_alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'alert_id', p_alert_id
      )
    );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Notification triggered for alert ' || p_alert_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;
