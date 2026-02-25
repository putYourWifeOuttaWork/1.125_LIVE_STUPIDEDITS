import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useActiveCompany } from './useActiveCompany';
import { acknowledgeAlert as acknowledgeAlertService } from '../services/alertService';

export interface AlertNotification {
  alert_id: string;
  device_id: string;
  alert_type: string;
  alert_category: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  actual_value: number | null;
  threshold_value: number | null;
  triggered_at: string;
  site_id: string | null;
  site_name: string | null;
  program_id: string | null;
  program_name: string | null;
  company_id: string | null;
  session_id: string | null;
  metadata: {
    device_code?: string;
    [key: string]: unknown;
  };
}

export function useAlertNotifications() {
  const { activeCompanyId, isSuperAdmin } = useActiveCompany();
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!activeCompanyId) {
      setAlerts([]);
      setAlertCount(0);
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('device_alerts')
        .select('alert_id, device_id, alert_type, alert_category, severity, message, actual_value, threshold_value, triggered_at, site_id, site_name, program_id, program_name, company_id, session_id, metadata')
        .is('resolved_at', null)
        .eq('company_id', activeCompanyId)
        .order('triggered_at', { ascending: false })
        .limit(20);

      const { data, error } = await query;
      if (error) throw error;

      setAlerts(data || []);
      setAlertCount(data?.length || 0);
    } catch (err) {
      console.error('Error fetching alert notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  const fetchCount = useCallback(async () => {
    if (!activeCompanyId) {
      setAlertCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('device_alerts')
        .select('alert_id', { count: 'exact', head: true })
        .is('resolved_at', null)
        .eq('company_id', activeCompanyId);

      if (error) throw error;
      setAlertCount(count || 0);
    } catch (err) {
      console.error('Error fetching alert count:', err);
    }
  }, [activeCompanyId]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    const result = await acknowledgeAlertService(alertId, 'Acknowledged via notification center');
    if (result.success) {
      setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
      setAlertCount(prev => Math.max(0, prev - 1));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('alert-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_alerts',
          filter: activeCompanyId ? `company_id=eq.${activeCompanyId}` : undefined,
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompanyId, fetchAlerts]);

  return {
    alerts,
    alertCount,
    loading,
    acknowledgeAlert,
    refetch: fetchAlerts,
  };
}
