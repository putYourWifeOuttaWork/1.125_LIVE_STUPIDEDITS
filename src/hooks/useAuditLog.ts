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
      if (includeDeviceEvents && siteId) {
        const { data, error } = await supabase
          .rpc('get_site_history_with_devices', {
            p_site_id: siteId,
            p_start_date: null,
            p_end_date: null,
            p_event_types: null,
            p_device_categories: null,
            p_limit: 100
          });

        if (error) throw error;
        setAuditLogs(data || []);
      } else if (includeDeviceEvents && !siteId) {
        const { data, error } = await supabase
          .rpc('get_program_history_with_devices', {
            p_program_id: programId,
            p_start_date: null,
            p_end_date: null,
            p_event_types: null,
            p_device_categories: null,
            p_limit: 100
          });

        if (error) throw error;
        setAuditLogs(data || []);
      } else {
        // Fallback to regular audit log query - for now just return empty
        // This would need the original get_filtered_audit_history function
        console.warn('Device events disabled, returning empty audit logs');
        setAuditLogs([]);
      }

      setCurrentFilters({});
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError('Failed to load audit logs');
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
      if (includeDeviceEvents && siteId) {
        const { data, error } = await supabase
          .rpc('get_site_history_with_devices', {
            p_site_id: siteId,
            p_start_date: startDate || null,
            p_end_date: endDate || null,
            p_event_types: eventType ? [eventType] : null,
            p_device_categories: deviceCategories || null,
            p_limit: 100
          });

        if (error) throw error;
        setAuditLogs(data || []);
      } else if (includeDeviceEvents && !siteId) {
        const { data, error } = await supabase
          .rpc('get_program_history_with_devices', {
            p_program_id: programId,
            p_start_date: startDate || null,
            p_end_date: endDate || null,
            p_event_types: eventType ? [eventType] : null,
            p_device_categories: deviceCategories || null,
            p_limit: 100
          });

        if (error) throw error;
        setAuditLogs(data || []);
      } else {
        // Fallback to regular audit log query - for now just return empty
        console.warn('Device events disabled, filtering not supported without device events');
        setAuditLogs([]);
      }

      setCurrentFilters({ objectType, eventType, userId, deviceCategories, startDate, endDate });
    } catch (err) {
      console.error('Error filtering audit logs:', err);
      setError('Failed to filter audit logs');
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
    } catch (err) {
      console.error('Error exporting audit logs:', err);
      setError('Failed to export audit logs');
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