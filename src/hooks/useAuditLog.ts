import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AuditLogEntry, HistoryEventType, DeviceEventCategory } from '../lib/types';

interface UseAuditLogProps {
  programId: string;
  siteId?: string;
  includeDeviceEvents?: boolean;
}

interface UseAuditLogResult {
  auditLogs: any[];
  loading: boolean;
  error: string | null;
  fetchAuditLogs: () => Promise<void>;
  filterLogs: (
    objectType?: string,
    eventType?: HistoryEventType,
    userId?: string,
    deviceCategories?: DeviceEventCategory[],
    startDate?: string,
    endDate?: string
  ) => Promise<void>;
  exportAuditLogsCsv: () => Promise<string | null>;
}

export function useAuditLog({ programId, siteId, includeDeviceEvents = true }: UseAuditLogProps): UseAuditLogResult {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFilters, setCurrentFilters] = useState<{
    objectType?: string,
    eventType?: HistoryEventType,
    userId?: string,
    deviceCategories?: DeviceEventCategory[],
    startDate?: string,
    endDate?: string
  }>({});

  const fetchAuditLogs = async () => {
    if (!programId) {
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the new separate audit history functions (no device events)
      const functionName = siteId ? 'get_site_audit_history' : 'get_program_audit_history';
      const params = siteId
        ? {
            p_site_id: siteId,
            p_start_date: null,
            p_end_date: null,
            p_event_types: null,
            p_limit: 100
          }
        : {
            p_program_id: programId,
            p_start_date: null,
            p_end_date: null,
            p_event_types: null,
            p_limit: 100
          };

      const { data, error } = await supabase.rpc(functionName, params);

      if (error) throw error;
      setAuditLogs(data || []);

      setCurrentFilters({});
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      const errorMessage = err?.message || err?.details || 'Failed to load audit logs';
      setError(`Failed to load audit logs: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = async (
    objectType?: string,
    eventType?: HistoryEventType,
    userId?: string,
    deviceCategories?: DeviceEventCategory[],
    startDate?: string,
    endDate?: string
  ) => {
    if (!programId) {
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the new separate audit history functions (no device events)
      const functionName = siteId ? 'get_site_audit_history' : 'get_program_audit_history';
      const params = siteId
        ? {
            p_site_id: siteId,
            p_start_date: startDate || null,
            p_end_date: endDate || null,
            p_event_types: eventType ? [eventType] : null,
            p_limit: 100
          }
        : {
            p_program_id: programId,
            p_start_date: startDate || null,
            p_end_date: endDate || null,
            p_event_types: eventType ? [eventType] : null,
            p_limit: 100
          };

      const { data, error } = await supabase.rpc(functionName, params);

      if (error) throw error;
      setAuditLogs(data || []);

      setCurrentFilters({ objectType, eventType, userId, deviceCategories, startDate, endDate });
    } catch (err: any) {
      console.error('Error filtering audit logs:', err);
      const errorMessage = err?.message || err?.details || 'Failed to filter audit logs';
      setError(`Failed to filter audit logs: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const exportAuditLogsCsv = async (): Promise<string | null> => {
    if (!programId) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .rpc('export_filtered_audit_history_csv', {
          p_program_id: programId,
          p_site_id: siteId || null,
          p_object_type: currentFilters.objectType || null,
          p_event_type: currentFilters.eventType || null,
          p_user_id: currentFilters.userId || null
        });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Error exporting audit logs:', err);
      const errorMessage = err?.message || err?.details || 'Failed to export audit logs';
      setError(`Failed to export audit logs: ${errorMessage}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [programId, siteId]);

  return {
    auditLogs,
    loading,
    error,
    fetchAuditLogs,
    filterLogs,
    exportAuditLogsCsv
  };
}

export default useAuditLog;