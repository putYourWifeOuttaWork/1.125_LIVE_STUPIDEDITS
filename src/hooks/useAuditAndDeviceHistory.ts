import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { HistoryEventType, DeviceEventCategory } from '../lib/types';

interface UseAuditAndDeviceHistoryProps {
  programId: string;
  siteId?: string;
}

interface AuditLogEntry {
  event_id: string;
  event_source: string;
  event_type: string;
  event_timestamp: string;
  description: string;
  object_type: string;
  object_id: string;
  update_type: string;
  site_id?: string;
  site_name?: string;
  user_id?: string;
  user_email?: string;
  old_data?: any;
  new_data?: any;
}

interface DeviceHistoryEntry {
  history_id: string;
  device_id: string;
  device_mac: string;
  device_name: string;
  site_id?: string;
  site_name?: string;
  session_id?: string;
  event_category: string;
  event_type: string;
  severity: string;
  event_timestamp: string;
  description: string;
  event_data?: any;
  metadata?: any;
  user_id?: string;
  user_email?: string;
}

interface UseAuditAndDeviceHistoryResult {
  auditLogs: AuditLogEntry[];
  deviceHistory: DeviceHistoryEntry[];
  auditLoading: boolean;
  deviceLoading: boolean;
  auditError: string | null;
  deviceError: string | null;
  fetchAuditLogs: () => Promise<void>;
  fetchDeviceHistory: () => Promise<void>;
  filterAuditLogs: (
    objectType?: string,
    eventType?: HistoryEventType,
    userId?: string,
    startDate?: string,
    endDate?: string
  ) => Promise<void>;
  filterDeviceHistory: (
    deviceCategories?: DeviceEventCategory[],
    severityLevels?: string[],
    startDate?: string,
    endDate?: string
  ) => Promise<void>;
  exportAuditLogsCsv: () => Promise<string | null>;
}

export function useAuditAndDeviceHistory({
  programId,
  siteId
}: UseAuditAndDeviceHistoryProps): UseAuditAndDeviceHistoryResult {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [deviceHistory, setDeviceHistory] = useState<DeviceHistoryEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(true);
  const [deviceLoading, setDeviceLoading] = useState<boolean>(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [currentAuditFilters, setCurrentAuditFilters] = useState<any>({});

  const fetchAuditLogs = async () => {
    if (!programId) {
      setAuditLogs([]);
      setAuditLoading(false);
      return;
    }

    setAuditLoading(true);
    setAuditError(null);

    try {
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
      setCurrentAuditFilters({});
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      const errorMessage = err?.message || err?.details || 'Failed to load audit logs';
      setAuditError(`Failed to load audit logs: ${errorMessage}`);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchDeviceHistory = async () => {
    if (!programId) {
      setDeviceHistory([]);
      setDeviceLoading(false);
      return;
    }

    setDeviceLoading(true);
    setDeviceError(null);

    try {
      const functionName = siteId ? 'get_site_device_history' : 'get_program_device_history';
      const params = siteId
        ? {
            p_site_id: siteId,
            p_start_date: null,
            p_end_date: null,
            p_device_categories: null,
            p_severity_levels: null,
            p_limit: 100
          }
        : {
            p_program_id: programId,
            p_start_date: null,
            p_end_date: null,
            p_device_categories: null,
            p_severity_levels: null,
            p_limit: 100
          };

      const { data, error } = await supabase.rpc(functionName, params);

      if (error) throw error;
      setDeviceHistory(data || []);
    } catch (err: any) {
      console.error('Error fetching device history:', err);
      const errorMessage = err?.message || err?.details || 'Failed to load device history';
      setDeviceError(`Failed to load device history: ${errorMessage}`);
    } finally {
      setDeviceLoading(false);
    }
  };

  const filterAuditLogs = async (
    objectType?: string,
    eventType?: HistoryEventType,
    userId?: string,
    startDate?: string,
    endDate?: string
  ) => {
    if (!programId) {
      setAuditLogs([]);
      setAuditLoading(false);
      return;
    }

    setAuditLoading(true);
    setAuditError(null);

    try {
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
      setCurrentAuditFilters({ objectType, eventType, userId, startDate, endDate });
    } catch (err: any) {
      console.error('Error filtering audit logs:', err);
      const errorMessage = err?.message || err?.details || 'Failed to filter audit logs';
      setAuditError(`Failed to filter audit logs: ${errorMessage}`);
    } finally {
      setAuditLoading(false);
    }
  };

  const filterDeviceHistory = async (
    deviceCategories?: DeviceEventCategory[],
    severityLevels?: string[],
    startDate?: string,
    endDate?: string
  ) => {
    if (!programId) {
      setDeviceHistory([]);
      setDeviceLoading(false);
      return;
    }

    setDeviceLoading(true);
    setDeviceError(null);

    try {
      const functionName = siteId ? 'get_site_device_history' : 'get_program_device_history';
      const params = siteId
        ? {
            p_site_id: siteId,
            p_start_date: startDate || null,
            p_end_date: endDate || null,
            p_device_categories: deviceCategories || null,
            p_severity_levels: severityLevels || null,
            p_limit: 100
          }
        : {
            p_program_id: programId,
            p_start_date: startDate || null,
            p_end_date: endDate || null,
            p_device_categories: deviceCategories || null,
            p_severity_levels: severityLevels || null,
            p_limit: 100
          };

      const { data, error } = await supabase.rpc(functionName, params);

      if (error) throw error;
      setDeviceHistory(data || []);
    } catch (err: any) {
      console.error('Error filtering device history:', err);
      const errorMessage = err?.message || err?.details || 'Failed to filter device history';
      setDeviceError(`Failed to filter device history: ${errorMessage}`);
    } finally {
      setDeviceLoading(false);
    }
  };

  const exportAuditLogsCsv = async (): Promise<string | null> => {
    if (!programId) {
      return null;
    }

    setAuditLoading(true);
    setAuditError(null);

    try {
      const { data, error } = await supabase
        .rpc('export_filtered_audit_history_csv', {
          p_program_id: programId,
          p_site_id: siteId || null,
          p_object_type: currentAuditFilters.objectType || null,
          p_event_type: currentAuditFilters.eventType || null,
          p_user_id: currentAuditFilters.userId || null
        });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Error exporting audit logs:', err);
      const errorMessage = err?.message || err?.details || 'Failed to export audit logs';
      setAuditError(`Failed to export audit logs: ${errorMessage}`);
      return null;
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    fetchDeviceHistory();
  }, [programId, siteId]);

  return {
    auditLogs,
    deviceHistory,
    auditLoading,
    deviceLoading,
    auditError,
    deviceError,
    fetchAuditLogs,
    fetchDeviceHistory,
    filterAuditLogs,
    filterDeviceHistory,
    exportAuditLogsCsv
  };
}

export default useAuditAndDeviceHistory;
