import { createClient } from 'npm:@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ReviewPayload {
  review_id: string;
}

interface ReviewerAssignment {
  assignment_id: string;
  user_id: string;
  channels: { email?: boolean; sms?: boolean; in_app?: boolean; webhook?: boolean };
  notification_email: string | null;
  notification_phone: string | null;
  webhook_url: string | null;
  webhook_headers: Record<string, string> | null;
  user: { email: string; name: string } | null;
}

async function resolveReviewers(companyId: string, siteId: string | null): Promise<ReviewerAssignment[]> {
  if (siteId) {
    const { data: siteAssignments } = await supabase
      .from('mgi_qa_reviewer_assignments')
      .select('assignment_id, user_id, channels, notification_email, notification_phone, webhook_url, webhook_headers, user:users!mgi_qa_reviewer_assignments_user_id_fkey(email, name)')
      .eq('company_id', companyId)
      .eq('site_id', siteId)
      .eq('is_active', true);

    if (siteAssignments && siteAssignments.length > 0) {
      return siteAssignments as unknown as ReviewerAssignment[];
    }
  }

  const { data: companyAssignments } = await supabase
    .from('mgi_qa_reviewer_assignments')
    .select('assignment_id, user_id, channels, notification_email, notification_phone, webhook_url, webhook_headers, user:users!mgi_qa_reviewer_assignments_user_id_fkey(email, name)')
    .eq('company_id', companyId)
    .is('site_id', null)
    .eq('is_active', true);

  if (companyAssignments && companyAssignments.length > 0) {
    return companyAssignments as unknown as ReviewerAssignment[];
  }

  const { data: allSuperAdmins } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('is_super_admin', true)
    .eq('is_active', true);

  if (allSuperAdmins && allSuperAdmins.length > 0) {
    return allSuperAdmins.map(u => ({
      assignment_id: 'system_fallback',
      user_id: u.id,
      channels: { email: true, in_app: true, sms: false, webhook: false },
      notification_email: null,
      notification_phone: null,
      webhook_url: null,
      webhook_headers: null,
      user: { email: u.email, name: u.name },
    }));
  }

  return [];
}

async function sendInAppNotification(reviewerId: string, review: Record<string, unknown>, notification: Record<string, unknown>) {
  try {
    const { data: logId } = await supabase.rpc('log_notification', {
      p_alert_id: null,
      p_user_id: reviewerId,
      p_company_id: review.company_id,
      p_channel: 'in_app',
      p_subject: notification.title,
      p_message: notification.body,
      p_metadata: {
        notification_type: 'mgi_review_required',
        review_id: review.review_id,
        severity: notification.severity,
        link: '/mgi-review',
      },
    });

    if (logId) {
      await supabase.rpc('update_notification_status', { p_log_id: logId, p_status: 'sent' });
    }
    return true;
  } catch (e) {
    console.error(`[notify_admin_review] In-app notification failed for ${reviewerId}:`, e);
    return false;
  }
}

async function sendEmailNotification(
  recipientEmail: string,
  recipientName: string,
  review: Record<string, unknown>,
  notification: Record<string, unknown>
) {
  if (!RESEND_API_KEY) {
    console.warn('[notify_admin_review] RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GRMTek QA <qa@notifications.grmtek.com>',
        to: [recipientEmail],
        subject: `[ACTION REQUIRED] ${notification.title}`,
        html: generateQAEmailHTML(recipientName, review, notification),
        text: generateQAEmailText(recipientName, review, notification),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[notify_admin_review] Email send failed:', err);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[notify_admin_review] Email exception:', e);
    return false;
  }
}

async function sendWebhookNotification(
  webhookUrl: string,
  webhookHeaders: Record<string, string> | null,
  review: Record<string, unknown>,
  notification: Record<string, unknown>
) {
  try {
    const payload = {
      type: 'mgi_review_required',
      review_id: review.review_id,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      original_score: review.original_score,
      adjusted_score: review.adjusted_score,
      priority: review.priority,
      company_id: review.company_id,
      site_id: review.site_id,
      device_id: review.device_id,
      created_at: review.created_at,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(webhookHeaders || {}),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[notify_admin_review] Webhook failed (${response.status}):`, await response.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[notify_admin_review] Webhook exception:', e);
    return false;
  }
}

function generateQAEmailHTML(name: string, review: Record<string, unknown>, notification: Record<string, unknown>): string {
  const originalPct = ((review.original_score as number) * 100).toFixed(1);
  const adjustedPct = ((review.adjusted_score as number) * 100).toFixed(1);
  const priorityColor = review.priority === 'critical' ? '#DC2626' : review.priority === 'high' ? '#EA580C' : '#2563EB';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#F3F4F6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#FFF;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr><td style="padding:32px;border-bottom:3px solid ${priorityColor};">
    <div style="display:inline-block;background:${priorityColor};color:#FFF;padding:6px 14px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">ACTION REQUIRED - DATA QUALITY REVIEW</div>
    <h1 style="margin:16px 0 0;color:#111;font-size:20px;">${notification.title}</h1>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${notification.body}</p>
    <table width="100%" style="background:#F9FAFB;border-radius:6px;padding:16px;" cellpadding="8" cellspacing="0">
      <tr><td style="color:#6B7280;font-size:14px;width:40%;">Original Score</td><td style="color:#DC2626;font-size:14px;font-weight:600;">${originalPct}%</td></tr>
      <tr><td style="color:#6B7280;font-size:14px;">Auto-Corrected To</td><td style="color:#059669;font-size:14px;font-weight:600;">${adjustedPct}%</td></tr>
      <tr><td style="color:#6B7280;font-size:14px;">Priority</td><td style="color:${priorityColor};font-size:14px;font-weight:600;text-transform:uppercase;">${review.priority}</td></tr>
      <tr><td style="color:#6B7280;font-size:14px;">Detection Method</td><td style="color:#111;font-size:14px;">${review.qa_method}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:8px 32px 32px;">
    <a href="#" style="display:inline-block;background:#2563EB;color:#FFF;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;">Review in Dashboard</a>
  </td></tr>
  <tr><td style="padding:24px 32px;border-top:1px solid #E5E7EB;">
    <p style="margin:0;color:#9CA3AF;font-size:12px;">This is an internal QA notification for GRMTek super administrators.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function generateQAEmailText(name: string, review: Record<string, unknown>, notification: Record<string, unknown>): string {
  return `ACTION REQUIRED - DATA QUALITY REVIEW

${notification.title}

Hi ${name},

${notification.body}

Original Score: ${((review.original_score as number) * 100).toFixed(1)}%
Auto-Corrected To: ${((review.adjusted_score as number) * 100).toFixed(1)}%
Priority: ${(review.priority as string).toUpperCase()}
Detection: ${review.qa_method}

Please review this flagged score in the MGI Review dashboard.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { review_id }: ReviewPayload = await req.json();

    if (!review_id) {
      throw new Error('Missing required field: review_id');
    }

    console.log('[notify_admin_review] Processing review:', review_id);

    const { data: review, error: reviewError } = await supabase
      .from('mgi_review_queue')
      .select('*')
      .eq('review_id', review_id)
      .maybeSingle();

    if (reviewError || !review) {
      throw new Error(`Review not found: ${reviewError?.message || 'no data'}`);
    }

    const { data: notification } = await supabase
      .from('admin_notifications')
      .select('*')
      .eq('reference_id', review_id)
      .eq('reference_type', 'mgi_review_queue')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!notification) {
      console.warn('[notify_admin_review] No admin_notification found for review:', review_id);
    }

    const notifData = notification || {
      title: `MGI Outlier flagged for review (${review_id})`,
      body: `Original: ${((review.original_score as number) * 100).toFixed(1)}%, Adjusted: ${((review.adjusted_score as number) * 100).toFixed(1)}%`,
      severity: review.priority === 'critical' ? 'critical' : 'info',
    };

    const reviewers = await resolveReviewers(review.company_id, review.site_id);
    console.log(`[notify_admin_review] Resolved ${reviewers.length} reviewer(s)`);

    const results = { in_app: 0, email: 0, webhook: 0, failed: 0 };
    const deliveryLog: Record<string, string[]>[] = [];

    for (const reviewer of reviewers) {
      const channels = reviewer.channels || { in_app: true };
      const sentChannels: string[] = [];

      if (channels.in_app !== false) {
        const ok = await sendInAppNotification(reviewer.user_id, review, notifData);
        if (ok) { results.in_app++; sentChannels.push('in_app'); } else { results.failed++; }
      }

      if (channels.email) {
        const email = reviewer.notification_email || reviewer.user?.email;
        const name = reviewer.user?.name || 'Admin';
        if (email) {
          const ok = await sendEmailNotification(email, name, review, notifData);
          if (ok) { results.email++; sentChannels.push('email'); } else { results.failed++; }
        }
      }

      if (channels.webhook && reviewer.webhook_url) {
        const ok = await sendWebhookNotification(reviewer.webhook_url, reviewer.webhook_headers, review, notifData);
        if (ok) { results.webhook++; sentChannels.push('webhook'); } else { results.failed++; }
      }

      deliveryLog.push({ [reviewer.user_id]: sentChannels });
    }

    if (notification) {
      await supabase
        .from('admin_notifications')
        .update({
          status: 'sent',
          target_assignments: deliveryLog,
        })
        .eq('notification_id', notification.notification_id);
    }

    await supabase
      .from('mgi_review_queue')
      .update({ notifications_sent_to: deliveryLog })
      .eq('review_id', review_id);

    console.log('[notify_admin_review] Dispatch complete:', results);

    return new Response(
      JSON.stringify({ success: true, review_id, reviewers_notified: reviewers.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[notify_admin_review] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
