import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SessionWakeSnapshot } from '../lib/types';
import { toast } from 'react-toastify';

export function useSiteSnapshots(siteId: string | null, programId: string | null) {
  const [snapshots, setSnapshots] = useState<SessionWakeSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!siteId || !programId) {
      setSnapshots([]);
      return;
    }

    fetchSnapshots();
  }, [siteId, programId]);

  const fetchSnapshots = async () => {
    if (!siteId || !programId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('session_wake_snapshots')
        .select('*')
        .eq('site_id', siteId)
        .eq('program_id', programId)
        .order('wake_round_start', { ascending: true });

      if (fetchError) throw fetchError;

      setSnapshots((data || []) as SessionWakeSnapshot[]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch site snapshots');
      setError(error);
      console.error('Error fetching site snapshots:', error);
      toast.error(`Failed to load site snapshots: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return {
    snapshots,
    loading,
    error,
    refetch: fetchSnapshots,
  };
}
