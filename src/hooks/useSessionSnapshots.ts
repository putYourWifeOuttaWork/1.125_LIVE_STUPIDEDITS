import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SessionWakeSnapshot } from '../lib/types';
import { toast } from 'react-toastify';

export function useSessionSnapshots(sessionId: string | null) {
  const [snapshots, setSnapshots] = useState<SessionWakeSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSnapshots([]);
      return;
    }

    fetchSnapshots();
  }, [sessionId]);

  const fetchSnapshots = async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('session_wake_snapshots')
        .select('*')
        .eq('session_id', sessionId)
        .order('wake_number', { ascending: true });

      if (fetchError) throw fetchError;

      setSnapshots((data || []) as SessionWakeSnapshot[]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch snapshots');
      setError(error);
      console.error('Error fetching session snapshots:', error);
      toast.error(`Failed to load session snapshots: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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

      // Refetch all snapshots to include the new one
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
