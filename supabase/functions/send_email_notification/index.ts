import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EmailNotificationPayload {
  log_id: string;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  alert_data: {
    device_name: string;
    device_code?: string;
    alert_type: string;
    severity: string;
    message: string;
    threshold_value?: number;
    current_value?: number;
    detected_at: string;
    site_name?: string;
    company_name?: string;
  };
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// HTML Email Template
function generateEmailHTML(data: EmailNotificationPayload): string {
  const { alert_data } = data;

  const severityColors = {
    critical: '#DC2626',
    high: '#EA580C',
    medium: '#F59E0B',
    low: '#10B981'
  };

  const severityColor = severityColors[alert_data.severity as keyof typeof severityColors] || '#6B7280';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F3F4F6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 3px solid ${severityColor};">
              <h1 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
                Device Alert Notification
              </h1>
              ${alert_data.company_name ? `<p style="margin: 8px 0 0 0; color: #6B7280; font-size: 14px;">${alert_data.company_name}</p>` : ''}
            </td>
          </tr>

          <!-- Alert Badge -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <div style="display: inline-block; background-color: ${severityColor}; color: #FFFFFF; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${alert_data.severity} - ${alert_data.alert_type}
              </div>
            </td>
          </tr>

          <!-- Alert Message -->
          <tr>
            <td style="padding: 16px 32px;">
              <p style="margin: 0; color: #111827; font-size: 16px; line-height: 1.6;">
                ${alert_data.message}
              </p>
            </td>
          </tr>

          <!-- Device Details -->
          <tr>
            <td style="padding: 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border-radius: 6px; padding: 16px;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="8" cellspacing="0">
                      <tr>
                        <td style="color: #6B7280; font-size: 14px; width: 40%;">Device</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 500;">
                          ${alert_data.device_name}${alert_data.device_code ? ` (${alert_data.device_code})` : ''}
                        </td>
                      </tr>
                      ${alert_data.site_name ? `
                      <tr>
                        <td style="color: #6B7280; font-size: 14px;">Site</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 500;">${alert_data.site_name}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="color: #6B7280; font-size: 14px;">Detected At</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 500;">${new Date(alert_data.detected_at).toLocaleString()}</td>
                      </tr>
                      ${alert_data.current_value !== undefined ? `
                      <tr>
                        <td style="color: #6B7280; font-size: 14px;">Current Value</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 500;">${alert_data.current_value}</td>
                      </tr>
                      ` : ''}
                      ${alert_data.threshold_value !== undefined ? `
                      <tr>
                        <td style="color: #6B7280; font-size: 14px;">Threshold</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 500;">${alert_data.threshold_value}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Button -->
          <tr>
            <td style="padding: 8px 32px 32px 32px;">
              <a href="${SUPABASE_URL.replace('https://', 'https://app.')}/devices"
                 style="display: inline-block; background-color: #2563EB; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                View Device Dashboard
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #6B7280; font-size: 12px; line-height: 1.5;">
                You received this alert because you have notifications enabled for ${alert_data.severity} severity alerts.
                <br><br>
                To manage your notification preferences, visit your <a href="${SUPABASE_URL.replace('https://', 'https://app.')}/profile" style="color: #2563EB; text-decoration: none;">user profile settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Plain text fallback
function generateEmailText(data: EmailNotificationPayload): string {
  const { alert_data } = data;
  return `
DEVICE ALERT NOTIFICATION
${alert_data.company_name || ''}

[${alert_data.severity.toUpperCase()}] ${alert_data.alert_type}

${alert_data.message}

Device: ${alert_data.device_name}${alert_data.device_code ? ` (${alert_data.device_code})` : ''}
${alert_data.site_name ? `Site: ${alert_data.site_name}` : ''}
Detected At: ${new Date(alert_data.detected_at).toLocaleString()}
${alert_data.current_value !== undefined ? `Current Value: ${alert_data.current_value}` : ''}
${alert_data.threshold_value !== undefined ? `Threshold: ${alert_data.threshold_value}` : ''}

View your device dashboard to take action.

---
You received this alert because you have notifications enabled for ${alert_data.severity} severity alerts.
To manage your notification preferences, visit your user profile settings.
  `.trim();
}

async function sendEmailWithResend(payload: EmailNotificationPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GRMTek Alerts <alerts@notifications.grmtek.com>',
        to: [payload.recipient_email],
        subject: payload.subject,
        html: generateEmailHTML(payload),
        text: generateEmailText(payload),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to send email' };
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: EmailNotificationPayload = await req.json();

    console.log('Sending email notification:', {
      log_id: payload.log_id,
      recipient: payload.recipient_email,
      subject: payload.subject,
    });

    // Send email via Resend
    const result = await sendEmailWithResend(payload);

    // Update notification log in database
    if (result.success) {
      await supabase.rpc('update_notification_status', {
        p_log_id: payload.log_id,
        p_status: 'sent',
        p_external_id: result.messageId,
      });

      console.log('Email sent successfully:', result.messageId);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email sent successfully',
          messageId: result.messageId
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Update as failed
      await supabase.rpc('update_notification_status', {
        p_log_id: payload.log_id,
        p_status: 'failed',
        p_error_message: result.error,
      });

      console.error('Email send failed:', result.error);

      return new Response(
        JSON.stringify({
          success: false,
          error: result.error
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in email notification function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
