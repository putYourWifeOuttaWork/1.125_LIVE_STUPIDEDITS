/*
  # Notification System Foundation

  1. New Tables
    - `user_notification_preferences`
      - Per-user notification channel preferences
      - Alert type routing rules
      - Quiet hours configuration

    - `notification_delivery_log`
      - Tracks all notification attempts
      - Success/failure status
      - Delivery metadata

    - `alert_escalation_rules`
      - Company-level escalation rules
      - Time-based escalation logic
      - Channel escalation paths

  2. Enhancements to Existing Tables
    - `device_alerts`
      - Add notification_sent_at timestamp
      - Add notification_channels JSON array
      - Add last_notified_at for de-duplication

  3. Security
    - Enable RLS on all new tables
    - Users can manage their own preferences
    - Only company admins can configure escalation rules
    - Notification logs visible to company members
*/

-- =====================================================
-- USER NOTIFICATION PREFERENCES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,

  -- Channel Preferences
  email_enabled boolean DEFAULT true,
  email_address text,

  browser_enabled boolean DEFAULT true,
  push_subscription jsonb,

  sms_enabled boolean DEFAULT false,
  phone_number text,

  -- Alert Type Preferences
  alert_types jsonb DEFAULT '["critical", "high", "medium"]'::jsonb,

  -- Quiet Hours
  quiet_hours_enabled boolean DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_timezone text DEFAULT 'UTC',

  -- Delivery Preferences
  digest_mode boolean DEFAULT false,
  digest_frequency text DEFAULT 'hourly',

  -- Alert Grouping
  min_notification_interval interval DEFAULT '5 minutes',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, company_id)
);

-- =====================================================
-- NOTIFICATION DELIVERY LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  alert_id uuid REFERENCES device_alerts(alert_id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,

  channel text NOT NULL CHECK (channel IN ('email', 'browser', 'sms', 'in_app')),
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'delivered', 'read')),

  subject text,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,

  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_message text,

  external_id text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_alert_id ON notification_delivery_log(alert_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_user_id ON notification_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_company_id ON notification_delivery_log(company_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_status ON notification_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_created_at ON notification_delivery_log(created_at DESC);

-- =====================================================
-- ALERT ESCALATION RULES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS alert_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,

  alert_severity text[] DEFAULT ARRAY['critical', 'high'],
  trigger_after interval DEFAULT '15 minutes',

  escalation_channels jsonb DEFAULT '["email", "browser", "sms"]'::jsonb,

  notify_company_admins boolean DEFAULT true,
  notify_super_admins boolean DEFAULT true,
  notify_user_ids uuid[],

  active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- ENHANCE DEVICE_ALERTS TABLE
-- =====================================================
ALTER TABLE device_alerts
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_channels jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_device_alerts_notification_sent_at ON device_alerts(notification_sent_at) WHERE notification_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_alerts_last_notified_at ON device_alerts(last_notified_at);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification preferences"
  ON user_notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON user_notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON user_notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Company admins can view all company notification preferences"
  ON user_notification_preferences FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.company_id = user_notification_preferences.company_id
      AND (users.is_company_admin = true OR users.is_super_admin = true)
    )
  );

ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification logs"
  ON notification_delivery_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Company admins can view company notification logs"
  ON notification_delivery_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.company_id = notification_delivery_log.company_id
      AND (users.is_company_admin = true OR users.is_super_admin = true)
    )
  );

CREATE POLICY "Service role can insert notification logs"
  ON notification_delivery_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update notification logs"
  ON notification_delivery_log FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE alert_escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view escalation rules"
  ON alert_escalation_rules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.company_id = alert_escalation_rules.company_id
    )
  );

CREATE POLICY "Company admins can manage escalation rules"
  ON alert_escalation_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.company_id = alert_escalation_rules.company_id
      AND (users.is_company_admin = true OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.company_id = alert_escalation_rules.company_id
      AND (users.is_company_admin = true OR users.is_super_admin = true)
    )
  );

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_notification_preferences(
  p_user_id uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_preferences jsonb;
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  SELECT to_jsonb(unp.*) INTO v_preferences
  FROM user_notification_preferences unp
  WHERE unp.user_id = p_user_id
  AND unp.company_id = p_company_id;

  IF v_preferences IS NULL THEN
    v_preferences := jsonb_build_object(
      'user_id', p_user_id,
      'company_id', p_company_id,
      'email_enabled', true,
      'email_address', v_user_email,
      'browser_enabled', true,
      'sms_enabled', false,
      'alert_types', '["critical", "high", "medium"]'::jsonb,
      'quiet_hours_enabled', false,
      'digest_mode', false,
      'min_notification_interval', '5 minutes'
    );
  ELSE
    IF v_preferences->>'email_address' IS NULL THEN
      v_preferences := jsonb_set(v_preferences, '{email_address}', to_jsonb(v_user_email));
    END IF;
  END IF;

  RETURN v_preferences;
END;
$$;

CREATE OR REPLACE FUNCTION should_send_notification(
  p_user_id uuid,
  p_company_id uuid,
  p_alert_severity text,
  p_channel text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefs jsonb;
  v_alert_types jsonb;
  v_quiet_hours_enabled boolean;
  v_quiet_start time;
  v_quiet_end time;
  v_quiet_tz text;
  v_current_time time;
  v_in_quiet_hours boolean := false;
  v_last_notification timestamptz;
  v_min_interval interval;
BEGIN
  v_prefs := get_user_notification_preferences(p_user_id, p_company_id);

  IF NOT (v_prefs->>p_channel || '_enabled')::boolean THEN
    RETURN false;
  END IF;

  v_alert_types := v_prefs->'alert_types';
  IF NOT (v_alert_types ? p_alert_severity) THEN
    RETURN false;
  END IF;

  IF p_alert_severity != 'critical' THEN
    v_quiet_hours_enabled := (v_prefs->>'quiet_hours_enabled')::boolean;

    IF v_quiet_hours_enabled THEN
      v_quiet_start := (v_prefs->>'quiet_hours_start')::time;
      v_quiet_end := (v_prefs->>'quiet_hours_end')::time;
      v_quiet_tz := v_prefs->>'quiet_hours_timezone';

      v_current_time := (now() AT TIME ZONE v_quiet_tz)::time;

      IF v_quiet_start < v_quiet_end THEN
        v_in_quiet_hours := v_current_time >= v_quiet_start AND v_current_time < v_quiet_end;
      ELSE
        v_in_quiet_hours := v_current_time >= v_quiet_start OR v_current_time < v_quiet_end;
      END IF;

      IF v_in_quiet_hours THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  v_min_interval := (v_prefs->>'min_notification_interval')::interval;

  SELECT MAX(created_at) INTO v_last_notification
  FROM notification_delivery_log
  WHERE user_id = p_user_id
  AND channel = p_channel
  AND status IN ('sent', 'delivered');

  IF v_last_notification IS NOT NULL THEN
    IF now() - v_last_notification < v_min_interval THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION log_notification(
  p_alert_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_channel text,
  p_subject text,
  p_message text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO notification_delivery_log (
    alert_id,
    user_id,
    company_id,
    channel,
    status,
    subject,
    message,
    metadata
  ) VALUES (
    p_alert_id,
    p_user_id,
    p_company_id,
    p_channel,
    'pending',
    p_subject,
    p_message,
    p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_notification_status(
  p_log_id uuid,
  p_status text,
  p_external_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notification_delivery_log
  SET
    status = p_status,
    external_id = COALESCE(p_external_id, external_id),
    error_message = p_error_message,
    sent_at = CASE WHEN p_status = 'sent' AND sent_at IS NULL THEN now() ELSE sent_at END,
    delivered_at = CASE WHEN p_status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
    failed_at = CASE WHEN p_status = 'failed' AND failed_at IS NULL THEN now() ELSE failed_at END,
    read_at = CASE WHEN p_status = 'read' AND read_at IS NULL THEN now() ELSE read_at END
  WHERE id = p_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_notification_prefs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_notification_preferences_timestamp
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_prefs_timestamp();

CREATE TRIGGER update_alert_escalation_rules_timestamp
  BEFORE UPDATE ON alert_escalation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_prefs_timestamp();
