import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AuditLogEntry, HistoryEventType } from '../lib/types';

interface UseAuditLogProps {
  programId: string;
  siteId?: string; // Make siteId optional
}

interface UseAuditLogResult {
  auditLogs: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  fetchAuditLogs: () => Promise<void>;
  filterLogs: (objectType?: string, eventType?: HistoryEventType, userId?: string) => Promise<void>;
  exportAuditLogsCsv: () => Promise<string | null>;
}

export function useAuditLog({ programId, siteId }: UseAuditLogProps): UseAuditLogResult {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFilters, setCurrentFilters] = useState<{
    objectType?: string,
    eventType?: HistoryEventType,
    userId?: string
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
      const { data, error } = await supabase
        .rpc('get_filtered_audit_history', {
          p_program_id: programId,
          p_site_id: siteId || null,
          p_object_type: null,
          p_event_type: null,
          p_user_id: null,
          p_limit: 100
        });

      if (error) throw error;
      setAuditLogs(data || []);
      setCurrentFilters({}); // Reset filters
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = async (objectType?: string, eventType?: HistoryEventType, userId?: string) => {
    if (!programId) {
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .rpc('get_filtered_audit_history', {
          p_program_id: programId,
          p_site_id: siteId || null,
          p_object_type: objectType || null,
          p_event_type: eventType || null,
          p_user_id: userId || null,
          p_limit: 100
        });

      if (error) throw error;
      setAuditLogs(data || []);
      setCurrentFilters({ objectType, eventType, userId });
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