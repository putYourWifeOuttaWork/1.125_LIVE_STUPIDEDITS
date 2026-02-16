import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SessionWakeSnapshot } from '../lib/types';
import { toast } from 'react-toastify';

interface UseSessionSnapshotsOptions {
  pollIntervalMs?: number | null;
}

export function useSessionSnapshots(
  sessionId: string | null,
  options?: UseSessionSnapshotsOptions
) {
  const [snapshots, setSnapshots] = useState<SessionWakeSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const fetchSnapshots = useCallback(async (isPolling = false) => {
    if (!sessionId) return;

    if (!isPolling) {
      setLoading(true);
    }
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('session_wake_snapshots')
        .select('*')
        .eq('session_id', sessionId)
        .order('wake_number', { ascending: true });

      if (fetchError) throw fetchError;

      if (isMountedRef.current) {
        setSnapshots((data || []) as SessionWakeSnapshot[]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const error = err instanceof Error ? err : new Error('Failed to fetch snapshots');
      setError(error);
      console.error('Error fetching session snapshots:', error);
      if (!isPolling) {
        toast.error(`Failed to load session snapshots: ${error.message}`);
      }
    } finally {
      if (isMountedRef.current && !isPolling) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSnapshots([]);
      return;
    }

    fetchSnapshots();
  }, [sessionId, fetchSnapshots]);

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    const pollMs = options?.pollIntervalMs;
    if (pollMs && pollMs > 0 && sessionId) {
      pollIntervalRef.current = setInterval(() => {
        fetchSnapshots(true);
      }, pollMs);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [options?.pollIntervalMs, sessionId, fetchSnapshots]);

  const generateSnapshot = async (wakeNumber: number) => {
    if (!sessionId) return null;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'generate_session_wake_snapshot',
        {
          p_session_id: sessionId,
          p_wake_number: wakeNumber,
        }
      );

      if (rpcError) throw rpcError;

      await fetchSnapshots();

      return data as SessionWakeSnapshot;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate snapshot');
      console.error('Error generating snapshot:', error);
      toast.error(`Failed to generate snapshot: ${error.message}`);
      return null;
    }
  };

  return {
    snapshots,
    loading,
    error,
    refetch: fetchSnapshots,
    generateSnapshot,
  };
}
