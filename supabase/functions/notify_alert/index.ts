import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AlertNotificationPayload {
  alert_id: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Get alert details with device and site context
async function getAlertDetails(alertId: string) {
  const { data, error } = await supabase
    .from('device_alerts')
    .select(`
      *,
      device:devices!device_alerts_device_id_fkey (
        id,
        device_code,
        site_id,
        site:sites!devices_site_id_fkey (
          id,
          name,
          company_id,
          company:companies!sites_company_id_fkey (
            id,
            name
          )
        )
      )
    `)
    .eq('id', alertId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch alert: ${error.message}`);
  }

  return data;
}

// Get users to notify based on company and alert preferences
async function getUsersToNotify(companyId: string, severity: string) {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }

  // Filter users based on their notification preferences
  const usersToNotify = [];

  for (const user of users || []) {
    // Check if user should be notified
    const { data: shouldNotify } = await supabase.rpc('should_send_notification', {
      p_user_id: user.id,
      p_company_id: companyId,
      p_alert_severity: severity,
      p_channel: 'email', // Check email first, we'll check each channel individually
    });

    if (shouldNotify) {
      // Get user preferences for all channels
      const { data: prefs } = await supabase.rpc('get_user_notification_preferences', {
        p_user_id: user.id,
        p_company_id: companyId,
      });

      usersToNotify.push({
        ...user,
        preferences: prefs,
      });
    }
  }

  return usersToNotify;
}

// Send email notification
async function sendEmailNotification(logId: string, user: any, alert: any) {
  const payload = {
    log_id: logId,
    recipient_email: user.preferences?.email_address || user.email,
    recipient_name: user.name,
    subject: `[${alert.severity.toUpperCase()}] ${alert.alert_type} - ${alert.device.site.name}`,
    alert_data: {
      device_name: alert.device.site.name,
      device_code: alert.device.device_code,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: alert.message,
      threshold_value: alert.threshold_value,
      current_value: alert.current_value,
      detected_at: alert.detected_at,
      site_name: alert.device.site.name,
      company_name: alert.device.site.company.name,
    },
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send_email_notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

// Send browser notification (push to notification_delivery_log for frontend to pick up)
async function sendBrowserNotification(user: any, alert: any, companyId: string) {
  // Check if user should receive browser notification
  const { data: shouldNotify } = await supabase.rpc('should_send_notification', {
    p_user_id: user.id,
    p_company_id: companyId,
    p_alert_severity: alert.severity,
    p_channel: 'browser',
  });

  if (!shouldNotify) {
    return null;
  }

  // Create browser notification log entry
  const logId = await supabase.rpc('log_notification', {
    p_alert_id: alert.id,
    p_user_id: user.id,
    p_company_id: companyId,
    p_channel: 'browser',
    p_subject: `${alert.alert_type} - ${alert.device.site.name}`,
    p_message: alert.message,
    p_metadata: {
      device_code: alert.device.device_code,
      site_name: alert.device.site.name,
      severity: alert.severity,
      current_value: alert.current_value,
      threshold_value: alert.threshold_value,
    },
  });

  // Mark as sent immediately (frontend will pick up via realtime)
  await supabase.rpc('update_notification_status', {
    p_log_id: logId,
    p_status: 'sent',
  });

  // If user has push subscription, send web push
  if (user.preferences?.push_subscription) {
    try {
      // TODO: Implement Web Push using push_subscription
      console.log('Would send web push to:', user.id);
    } catch (error) {
      console.error('Failed to send web push:', error);
    }
  }

  return logId;
}

// Send in-app notification (always sent, shows in notification center)
async function sendInAppNotification(user: any, alert: any, companyId: string) {
  const logId = await supabase.rpc('log_notification', {
    p_alert_id: alert.id,
    p_user_id: user.id,
    p_company_id: companyId,
    p_channel: 'in_app',
    p_subject: `${alert.alert_type} - ${alert.device.site.name}`,
    p_message: alert.message,
    p_metadata: {
      device_code: alert.device.device_code,
      site_name: alert.device.site.name,
      severity: alert.severity,
      current_value: alert.current_value,
      threshold_value: alert.threshold_value,
      device_id: alert.device_id,
    },
  });

  // Mark as sent (will be marked as read when user views it)
  await supabase.rpc('update_notification_status', {
    p_log_id: logId,
    p_status: 'sent',
  });

  return logId;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { alert_id }: AlertNotificationPayload = await req.json();

    console.log('Processing alert notification:', alert_id);

    // Get alert details
    const alert = await getAlertDetails(alert_id);

    if (!alert.device?.site?.company_id) {
      throw new Error('Alert missing company context');
    }

    const companyId = alert.device.site.company_id;

    // Get users to notify
    const users = await getUsersToNotify(companyId, alert.severity);

    console.log(`Notifying ${users.length} users for alert ${alert_id}`);

    const notifications = {
      email: 0,
      browser: 0,
      in_app: 0,
      failed: 0,
    };

    // Send notifications to each user
    for (const user of users) {
      try {
        // Always send in-app notification
        await sendInAppNotification(user, alert, companyId);
        notifications.in_app++;

        // Send email if enabled
        if (user.preferences?.email_enabled) {
          const { data: shouldSendEmail } = await supabase.rpc('should_send_notification', {
            p_user_id: user.id,
            p_company_id: companyId,
            p_alert_severity: alert.severity,
            p_channel: 'email',
          });

          if (shouldSendEmail) {
            const emailLogId = await supabase.rpc('log_notification', {
              p_alert_id: alert.id,
              p_user_id: user.id,
              p_company_id: companyId,
              p_channel: 'email',
              p_subject: `[${alert.severity.toUpperCase()}] ${alert.alert_type}`,
              p_message: alert.message,
            });

            const emailSent = await sendEmailNotification(emailLogId, user, alert);
            if (emailSent) {
              notifications.email++;
            }
          }
        }

        // Send browser notification if enabled
        if (user.preferences?.browser_enabled) {
          const browserLogId = await sendBrowserNotification(user, alert, companyId);
          if (browserLogId) {
            notifications.browser++;
          }
        }

        // TODO: SMS notifications (if enabled and critical)
        // if (user.preferences?.sms_enabled && alert.severity === 'critical') {
        //   await sendSMSNotification(user, alert, companyId);
        // }

      } catch (error) {
        console.error(`Failed to notify user ${user.id}:`, error);
        notifications.failed++;
      }
    }

    // Update alert with notification info
    const channelsSent = [];
    if (notifications.email > 0) channelsSent.push('email');
    if (notifications.browser > 0) channelsSent.push('browser');
    if (notifications.in_app > 0) channelsSent.push('in_app');

    await supabase
      .from('device_alerts')
      .update({
        notification_sent_at: new Date().toISOString(),
        last_notified_at: new Date().toISOString(),
        notification_channels: channelsSent,
        notification_count: (alert.notification_count || 0) + 1,
      })
      .eq('id', alert_id);

    console.log('Notification summary:', notifications);

    return new Response(
      JSON.stringify({
        success: true,
        alert_id,
        users_notified: users.length,
        notifications,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in notify_alert function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
