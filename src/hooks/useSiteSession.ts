import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';

interface SiteSession {
  session_id: string;
  site_id: string;
  program_id: string;
  session_date: string;
  session_status: string;
  total_wakes_expected: number;
  wakes_completed: number;
  created_at: string;
}

export function useSiteSession(siteId: string | null, programId: string | null) {
  const [currentSession, setCurrentSession] = useState<SiteSession | null>(null);
  const [allSessions, setAllSessions] = useState<SiteSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!siteId || !programId) {
      setCurrentSession(null);
      setAllSessions([]);
      return;
    }

    fetchSessions();
  }, [siteId, programId]);

  const fetchSessions = async () => {
    if (!siteId || !programId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('site_device_sessions')
        .select('*')
        .eq('site_id', siteId)
        .eq('program_id', programId)
        .order('session_date', { ascending: false });

      if (fetchError) throw fetchError;

      const sessions = (data || []) as SiteSession[];
      setAllSessions(sessions);

      // Set the most recent session as current
      if (sessions.length > 0) {
        setCurrentSession(sessions[0]);
      } else {
        setCurrentSession(null);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch sessions');
      setError(error);
      console.error('Error fetching site sessions:', error);
      toast.error(`Failed to load site sessions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const selectSession = (sessionId: string) => {
    const session = allSessions.find((s) => s.session_id === sessionId);
    if (session) {
      setCurrentSession(session);
    }
  };

  return {
    currentSession,
    allSessions,
    loading,
    error,
    refetch: fetchSessions,
    selectSession,
  };
}
