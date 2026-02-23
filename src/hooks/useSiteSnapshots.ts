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

      processedSnapshots = applyLOCF(processedSnapshots);

      if (aggregated && processedSnapshots.length > 0) {
        processedSnapshots = aggregateSnapshotsByDay(processedSnapshots, snapshotsPerDay);
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

  const applyLOCF = (allSnapshots: SessionWakeSnapshot[]): SessionWakeSnapshot[] => {
    if (allSnapshots.length === 0) return [];

    const deviceStateCache = new Map<string, any>();

    const carryForward = (newVal: any, cachedVal: any) =>
      newVal !== null && newVal !== undefined ? newVal : cachedVal;

    return allSnapshots.map((snapshot) => {
      try {
        const raw = typeof snapshot.site_state === 'string'
          ? JSON.parse(snapshot.site_state)
          : snapshot.site_state;

        const rawDevices: any[] = Array.isArray(raw) ? raw : (raw?.devices || []);

        rawDevices.forEach((device: any) => {
          const id = device.device_id;
          const cached = deviceStateCache.get(id) || {};
          const pos = device.position;
          const hasPos = pos && pos.x != null && pos.y != null;

          deviceStateCache.set(id, {
            device_id: id,
            device_code: carryForward(device.device_code, cached.device_code),
            device_name: carryForward(device.device_name, cached.device_name),
            position: cached.position || (hasPos ? pos : null),
            status: carryForward(device.status, cached.status) || 'active',
            last_seen_at: device.last_seen_at || cached.last_seen_at,
            battery_health_percent: carryForward(device.battery_health_percent, cached.battery_health_percent),
            telemetry: {
              latest_temperature: carryForward(device.telemetry?.temperature, cached.telemetry?.latest_temperature),
              latest_humidity: carryForward(device.telemetry?.humidity, cached.telemetry?.latest_humidity),
              latest_pressure: carryForward(device.telemetry?.pressure, cached.telemetry?.latest_pressure),
            },
            mgi_state: {
              latest_mgi_score: carryForward(device.mgi_state?.current_mgi, cached.mgi_state?.latest_mgi_score),
              mgi_velocity: carryForward(device.mgi_state?.mgi_velocity?.per_hour ?? device.mgi_state?.mgi_velocity, cached.mgi_state?.mgi_velocity),
            },
          });
        });

        const completeDevices = Array.from(deviceStateCache.values())
          .filter((d: any) => d.position && d.position.x != null && d.position.y != null);

        return {
          ...snapshot,
          site_state: { devices: completeDevices },
        } as SessionWakeSnapshot;
      } catch {
        return snapshot;
      }
    });
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
