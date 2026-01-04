import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SessionWakeSnapshot } from '../lib/types';
import { toast } from 'react-toastify';

interface UseSiteSnapshotsOptions {
  aggregated?: boolean;
  snapshotsPerDay?: number;
}

export function useSiteSnapshots(
  siteId: string | null,
  programId: string | null,
  options: UseSiteSnapshotsOptions = {}
) {
  const { aggregated = false, snapshotsPerDay = 4 } = options;
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

      let processedSnapshots = (data || []) as SessionWakeSnapshot[];

      // Apply aggregation if requested
      if (aggregated && processedSnapshots.length > 0) {
        processedSnapshots = aggregateSnapshotsByDay(processedSnapshots, snapshotsPerDay);
        console.log(`[useSiteSnapshots] Aggregated ${data?.length || 0} snapshots to ${processedSnapshots.length} (${snapshotsPerDay} per day)`);
      }

      setSnapshots(processedSnapshots);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch site snapshots');
      setError(error);
      console.error('Error fetching site snapshots:', error);
      toast.error(`Failed to load site snapshots: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const aggregateSnapshotsByDay = (
    allSnapshots: SessionWakeSnapshot[],
    targetPerDay: number
  ): SessionWakeSnapshot[] => {
    if (allSnapshots.length === 0) return [];

    // Group snapshots by day
    const snapshotsByDay = new Map<string, SessionWakeSnapshot[]>();

    allSnapshots.forEach((snapshot) => {
      const date = snapshot.wake_round_start.split('T')[0];
      if (!snapshotsByDay.has(date)) {
        snapshotsByDay.set(date, []);
      }
      snapshotsByDay.get(date)!.push(snapshot);
    });

    // Sample evenly from each day
    const aggregated: SessionWakeSnapshot[] = [];

    snapshotsByDay.forEach((daySnapshots, date) => {
      if (daySnapshots.length <= targetPerDay) {
        // If day has fewer snapshots than target, include all
        aggregated.push(...daySnapshots);
      } else {
        // Evenly sample from the day
        const step = daySnapshots.length / targetPerDay;
        for (let i = 0; i < targetPerDay; i++) {
          const index = Math.floor(i * step);
          aggregated.push(daySnapshots[index]);
        }
      }
    });

    // Sort by wake_round_start to maintain chronological order
    return aggregated.sort((a, b) =>
      a.wake_round_start.localeCompare(b.wake_round_start)
    );
  };

  return {
    snapshots,
    loading,
    error,
    refetch: fetchSnapshots,
  };
}
