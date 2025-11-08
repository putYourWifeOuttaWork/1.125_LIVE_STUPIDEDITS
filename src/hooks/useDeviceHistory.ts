import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  DeviceHistory,
  DeviceWakeSession,
  DeviceEventCategory,
  EventSeverity,
  DeviceSessionStatus
} from '../lib/types';

interface UseDeviceHistoryProps {
  deviceId?: string;
  siteId?: string;
  programId?: string;
}

interface UseDeviceHistoryResult {
  history: DeviceHistory[];
  sessions: DeviceWakeSession[];
  loading: boolean;
  error: string | null;
  fetchHistory: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  filterHistory: (filters: HistoryFilterOptions) => Promise<void>;
  filterSessions: (filters: SessionFilterOptions) => Promise<void>;
  exportHistoryCsv: () => Promise<string | null>;
  exportSessionsCsv: () => Promise<string | null>;
  currentFilters: HistoryFilterOptions;
  currentSessionFilters: SessionFilterOptions;
}

export interface HistoryFilterOptions {
  startDate?: string;
  endDate?: string;
  categories?: DeviceEventCategory[];
  severityLevels?: EventSeverity[];
  userId?: string;
  hasErrors?: boolean;
  searchText?: string;
  limit?: number;
  offset?: number;
}

export interface SessionFilterOptions {
  startDate?: string;
  endDate?: string;
  status?: DeviceSessionStatus[];
  withErrors?: boolean;
  successOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function useDeviceHistory({
  deviceId,
  siteId,
  programId
}: UseDeviceHistoryProps): UseDeviceHistoryResult {
  const [history, setHistory] = useState<DeviceHistory[]>([]);
  const [sessions, setSessions] = useState<DeviceWakeSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFilters, setCurrentFilters] = useState<HistoryFilterOptions>({});
  const [currentSessionFilters, setCurrentSessionFilters] = useState<SessionFilterOptions>({});

  const fetchHistory = async () => {
    if (!deviceId && !siteId && !programId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('get_device_history', {
        p_device_id: deviceId || null,
        p_site_id: siteId || null,
        p_program_id: programId || null,
        p_start_date: null,
        p_end_date: null,
        p_categories: null,
        p_severity_levels: null,
        p_user_id: null,
        p_has_errors: null,
        p_search_text: null,
        p_limit: 25,
        p_offset: 0
      });

      if (error) throw error;
      setHistory(data || []);
      setCurrentFilters({});
    } catch (err) {
      console.error('Error fetching device history:', err);
      setError('Failed to load device history');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    if (!deviceId && !siteId && !programId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('get_device_sessions', {
        p_device_id: deviceId || null,
        p_site_id: siteId || null,
        p_program_id: programId || null,
        p_start_date: null,
        p_end_date: null,
        p_status: null,
        p_with_errors: null,
        p_success_only: null,
        p_limit: 25,
        p_offset: 0
      });

      if (error) throw error;
      setSessions(data || []);
      setCurrentSessionFilters({});
    } catch (err) {
      console.error('Error fetching device sessions:', err);
      setError('Failed to load device sessions');
    } finally {
      setLoading(false);
    }
  };

  const filterHistory = async (filters: HistoryFilterOptions) => {
    if (!deviceId && !siteId && !programId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('get_device_history', {
        p_device_id: deviceId || null,
        p_site_id: siteId || null,
        p_program_id: programId || null,
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_categories: filters.categories || null,
        p_severity_levels: filters.severityLevels || null,
        p_user_id: filters.userId || null,
        p_has_errors: filters.hasErrors || null,
        p_search_text: filters.searchText || null,
        p_limit: filters.limit || 25,
        p_offset: filters.offset || 0
      });

      if (error) throw error;
      setHistory(data || []);
      setCurrentFilters(filters);
    } catch (err) {
      console.error('Error filtering device history:', err);
      setError('Failed to filter device history');
    } finally {
      setLoading(false);
    }
  };

  const filterSessions = async (filters: SessionFilterOptions) => {
    if (!deviceId && !siteId && !programId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('get_device_sessions', {
        p_device_id: deviceId || null,
        p_site_id: siteId || null,
        p_program_id: programId || null,
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_status: filters.status || null,
        p_with_errors: filters.withErrors || null,
        p_success_only: filters.successOnly || null,
        p_limit: filters.limit || 25,
        p_offset: filters.offset || 0
      });

      if (error) throw error;
      setSessions(data || []);
      setCurrentSessionFilters(filters);
    } catch (err) {
      console.error('Error filtering device sessions:', err);
      setError('Failed to filter device sessions');
    } finally {
      setLoading(false);
    }
  };

  const exportHistoryCsv = async (): Promise<string | null> => {
    if (!deviceId && !siteId && !programId) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('export_device_history_csv', {
        p_device_id: deviceId || null,
        p_site_id: siteId || null,
        p_program_id: programId || null,
        p_start_date: currentFilters.startDate || null,
        p_end_date: currentFilters.endDate || null,
        p_categories: currentFilters.categories || null,
        p_severity_levels: currentFilters.severityLevels || null
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error exporting device history:', err);
      setError('Failed to export device history');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const exportSessionsCsv = async (): Promise<string | null> => {
    if (!deviceId && !siteId && !programId) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('export_device_sessions_csv', {
        p_device_id: deviceId || null,
        p_site_id: siteId || null,
        p_program_id: programId || null,
        p_start_date: currentSessionFilters.startDate || null,
        p_end_date: currentSessionFilters.endDate || null
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error exporting device sessions:', err);
      setError('Failed to export device sessions');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchSessions();
  }, [deviceId, siteId, programId]);

  return {
    history,
    sessions,
    loading,
    error,
    fetchHistory,
    fetchSessions,
    filterHistory,
    filterSessions,
    exportHistoryCsv,
    exportSessionsCsv,
    currentFilters,
    currentSessionFilters
  };
}

export default useDeviceHistory;
