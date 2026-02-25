import { supabase } from '../lib/supabaseClient';
import { createLogger } from '../utils/logger';

const log = createLogger('AlertService');

export interface AcknowledgeResult {
  success: boolean;
  count?: number;
  error?: string;
}

export interface BatchFilterParams {
  companyId: string;
  severities?: string[];
  categories?: string[];
  siteId?: string;
  dateRangeStart?: string;
  searchQuery?: string;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function acknowledgeAlert(alertId: string, notes = 'Acknowledged by user'): Promise<AcknowledgeResult> {
  try {
    const userId = await getCurrentUserId();

    const updatePayload: Record<string, unknown> = {
      resolved_at: new Date().toISOString(),
      resolution_notes: notes,
    };
    if (userId) {
      updatePayload.resolved_by_user_id = userId;
    }

    const { error } = await supabase
      .from('device_alerts')
      .update(updatePayload)
      .eq('alert_id', alertId);

    if (error) throw error;
    return { success: true, count: 1 };
  } catch (err: any) {
    log.error('Error acknowledging alert:', err);
    return { success: false, error: err.message || 'Failed to acknowledge alert' };
  }
}

export async function batchAcknowledgeAlerts(
  alertIds: string[],
  notes = 'Batch acknowledged by user'
): Promise<AcknowledgeResult> {
  try {
    if (alertIds.length === 0) {
      return { success: true, count: 0 };
    }

    const { data, error } = await supabase.rpc('batch_acknowledge_alerts', {
      p_alert_ids: alertIds,
      p_notes: notes,
    });

    if (error) throw error;
    return { success: true, count: data as number };
  } catch (err: any) {
    log.error('Error batch acknowledging alerts:', err);
    return { success: false, error: err.message || 'Failed to batch acknowledge alerts' };
  }
}

export async function batchAcknowledgeByFilter(
  params: BatchFilterParams,
  notes = 'Batch acknowledged by user'
): Promise<AcknowledgeResult> {
  try {
    const { data, error } = await supabase.rpc('batch_acknowledge_alerts_by_filter', {
      p_company_id: params.companyId,
      p_severities: params.severities?.length ? params.severities : null,
      p_categories: params.categories?.length ? params.categories : null,
      p_site_id: params.siteId || null,
      p_date_range_start: params.dateRangeStart || null,
      p_search_query: params.searchQuery || null,
      p_notes: notes,
    });

    if (error) throw error;
    return { success: true, count: data as number };
  } catch (err: any) {
    log.error('Error batch acknowledging alerts by filter:', err);
    return { success: false, error: err.message || 'Failed to batch acknowledge alerts' };
  }
}
