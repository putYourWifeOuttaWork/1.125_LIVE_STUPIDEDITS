import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  DeviceHistory,
  DeviceWakeSession,
  DeviceEventCategory,
  EventSeverity,
  DeviceSessionStatus
} from '../lib/types';
import { createLogger } from '../utils/logger';

const log = createLogger('DeviceHistory');

interface UseDeviceHistoryProps {
  deviceId?: string;
  siteId?: string;
  programId?: string;
}

export interface ProgramOption {
  program_id: string;
  name: string;
}

export interface SiteOption {
  site_id: string;
  site_name: string;
  site_code: string;
}

export interface SessionOption {
  session_id: string;
  session_date: string;
  session_label: string;
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
  totalCount: number;
  currentPage: number;
  pageSize: number;
  setPage: (page: number) => void;
  totalPages: number;
  availablePrograms: ProgramOption[];
  availableSites: SiteOption[];
  availableSessions: SessionOption[];
  loadingFilters: boolean;
  fetchAvailablePrograms: () => Promise<void>;
  fetchAvailableSites: (programId: string) => Promise<void>;
  fetchAvailableSessions: (programId: string, siteId: string) => Promise<void>;
}

export interface HistoryFilterOptions {
  startDate?: string;
  endDate?: string;
  categories?: DeviceEventCategory[];
  severityLevels?: EventSeverity[];
  userId?: string;
  hasErrors?: boolean;
  searchText?: string;
  programId?: string;
  siteId?: string;
  sessionId?: string;
  zoneId?: string;
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
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(50);
  const [availablePrograms, setAvailablePrograms] = useState<ProgramOption[]>([]);
  const [availableSites, setAvailableSites] = useState<SiteOption[]>([]);
  const [availableSessions, setAvailableSessions] = useState<SessionOption[]>([]);
  const [loadingFilters, setLoadingFilters] = useState<boolean>(false);

  const fetchHistory = async () => {
    if (!deviceId && !siteId && !programId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query device_history table directly with pagination
      let query = supabase
        .from('device_history')
        .select('*', { count: 'exact' })
        .order('event_timestamp', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }
      if (siteId) {
        query = query.eq('site_id', siteId);
      }
      if (programId) {
        query = query.eq('program_id', programId);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setHistory(data || []);
      setTotalCount(count || 0);
      setCurrentFilters({});
    } catch (err) {
      log.error('Error fetching device history:', err);
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
      // Query device_wake_sessions table directly
      let query = supabase
        .from('device_wake_sessions')
        .select('*')
        .order('wake_timestamp', { ascending: false })
        .limit(25);

      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }
      if (siteId) {
        query = query.eq('site_id', siteId);
      }
      if (programId) {
        query = query.eq('program_id', programId);
      }

      const { data, error } = await query;

      if (error) {
        // Table might not exist yet, just return empty array
        log.warn('Device wake sessions table not found:', error);
        setSessions([]);
      } else {
        setSessions(data || []);
      }
      setCurrentSessionFilters({});
    } catch (err) {
      log.error('Error fetching device sessions:', err);
      // Don't set error state, just return empty array
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const filterHistory = async (filters: HistoryFilterOptions) => {
    setLoading(true);
    setError(null);

    try {
      // Build query with filters
      let query = supabase
        .from('device_history')
        .select('*', { count: 'exact' })
        .order('event_timestamp', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      // Apply deviceId from props or filter
      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }

      // Apply additional filters
      if (filters.programId) {
        query = query.eq('program_id', filters.programId);
      } else if (programId) {
        query = query.eq('program_id', programId);
      }

      if (filters.siteId) {
        query = query.eq('site_id', filters.siteId);
      } else if (siteId) {
        query = query.eq('site_id', siteId);
      }

      if (filters.sessionId) {
        query = query.eq('session_id', filters.sessionId);
      }

      if (filters.startDate) {
        query = query.gte('event_timestamp', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('event_timestamp', filters.endDate);
      }

      if (filters.categories && filters.categories.length > 0) {
        query = query.in('event_category', filters.categories);
      }

      if (filters.severityLevels && filters.severityLevels.length > 0) {
        query = query.in('severity', filters.severityLevels);
      }

      if (filters.searchText) {
        query = query.or(`description.ilike.%${filters.searchText}%,event_type.ilike.%${filters.searchText}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setHistory(data || []);
      setTotalCount(count || 0);
      setCurrentFilters(filters);
    } catch (err) {
      log.error('Error filtering device history:', err);
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
      log.error('Error filtering device sessions:', err);
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
      log.error('Error exporting device history:', err);
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
      log.error('Error exporting device sessions:', err);
      setError('Failed to export device sessions');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailablePrograms = async () => {
    if (!deviceId) return;

    setLoadingFilters(true);
    try {
      // Get distinct programs from device_history
      const { data, error } = await supabase
        .from('device_history')
        .select('program_id')
        .eq('device_id', deviceId)
        .not('program_id', 'is', null);

      if (error) throw error;

      const uniqueProgramIds = [...new Set(data.map(d => d.program_id))];

      // Fetch program details
      const { data: programs, error: progError } = await supabase
        .from('pilot_programs')
        .select('program_id, name')
        .in('program_id', uniqueProgramIds);

      if (progError) throw progError;

      setAvailablePrograms(programs || []);
    } catch (err) {
      log.error('Error fetching programs:', err);
    } finally {
      setLoadingFilters(false);
    }
  };

  const fetchAvailableSites = async (selectedProgramId: string) => {
    if (!deviceId || !selectedProgramId) return;

    setLoadingFilters(true);
    try {
      // Get distinct sites for this program
      const { data, error } = await supabase
        .from('device_history')
        .select('site_id')
        .eq('device_id', deviceId)
        .eq('program_id', selectedProgramId)
        .not('site_id', 'is', null);

      if (error) throw error;

      const uniqueSiteIds = [...new Set(data.map(d => d.site_id))];

      // Fetch site details
      const { data: sites, error: siteError } = await supabase
        .from('sites')
        .select('site_id, site_name, site_code')
        .in('site_id', uniqueSiteIds);

      if (siteError) throw siteError;

      setAvailableSites(sites || []);
    } catch (err) {
      log.error('Error fetching sites:', err);
    } finally {
      setLoadingFilters(false);
    }
  };

  const fetchAvailableSessions = async (selectedProgramId: string, selectedSiteId: string) => {
    if (!deviceId || !selectedProgramId || !selectedSiteId) return;

    setLoadingFilters(true);
    try {
      // Get distinct sessions from site_device_sessions
      const { data, error } = await supabase
        .from('site_device_sessions')
        .select('session_id, session_date')
        .eq('device_id', deviceId)
        .eq('program_id', selectedProgramId)
        .eq('site_id', selectedSiteId)
        .order('session_date', { ascending: false });

      if (error) {
        log.warn('site_device_sessions not found, checking device_history');
        // Fallback: check for session_id in device_history
        const { data: historyData, error: histError } = await supabase
          .from('device_history')
          .select('session_id, event_timestamp')
          .eq('device_id', deviceId)
          .eq('program_id', selectedProgramId)
          .eq('site_id', selectedSiteId)
          .not('session_id', 'is', null)
          .order('event_timestamp', { ascending: false });

        if (histError) throw histError;

        // Group by session_id and take earliest timestamp
        const sessionMap = new Map<string, string>();
        historyData?.forEach(item => {
          if (item.session_id && !sessionMap.has(item.session_id)) {
            sessionMap.set(item.session_id, item.event_timestamp);
          }
        });

        const sessionOptions: SessionOption[] = Array.from(sessionMap.entries()).map(([id, timestamp]) => ({
          session_id: id,
          session_date: timestamp,
          session_label: new Date(timestamp).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        }));

        setAvailableSessions(sessionOptions);
      } else {
        const sessionOptions: SessionOption[] = (data || []).map(s => ({
          session_id: s.session_id,
          session_date: s.session_date,
          session_label: new Date(s.session_date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        }));

        setAvailableSessions(sessionOptions);
      }
    } catch (err) {
      log.error('Error fetching sessions:', err);
      setAvailableSessions([]);
    } finally {
      setLoadingFilters(false);
    }
  };

  const setPage = (page: number) => {
    setCurrentPage(page);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => {
    fetchHistory();
    fetchSessions();
  }, [deviceId, siteId, programId, currentPage]);

  useEffect(() => {
    if (deviceId) {
      fetchAvailablePrograms();
    }
  }, [deviceId]);

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
    currentSessionFilters,
    totalCount,
    currentPage,
    pageSize,
    setPage,
    totalPages,
    availablePrograms,
    availableSites,
    availableSessions,
    loadingFilters,
    fetchAvailablePrograms,
    fetchAvailableSites,
    fetchAvailableSessions
  };
}

export default useDeviceHistory;
