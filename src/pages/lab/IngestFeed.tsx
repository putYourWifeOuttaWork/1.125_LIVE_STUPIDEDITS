import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CompanySwitcher } from '../../components/lab/CompanySwitcher';
import { LiveFeedTable } from '../../components/lab/LiveFeedTable';
import { CopyButtons } from '../../components/lab/CopyButtons';
import { useMultiTableRealtime } from '../../hooks/useRealtimeThrottle';
import { toast } from 'react-toastify';
import { useUserRole } from '../../hooks/useUserRole';

type FilterType = 'all' | 'payloads' | 'images' | 'observations' | 'telemetry';

export default function IngestFeed() {
  const { userRole } = useUserRole();
  const isSuperAdmin = userRole === 'super_admin';

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timezone] = useState('UTC'); // Could make this dynamic based on user preference
  const [filter, setFilter] = useState<FilterType>('all');

  // Fetch live feed based on selected filter
  const fetchFeed = async () => {
    setLoading(true);
    try {
      if (filter === 'telemetry') {
        // Fetch telemetry-only data
        const { data, error } = await supabase
          .from('device_telemetry')
          .select(`
            telemetry_id,
            captured_at,
            temperature,
            humidity,
            pressure,
            gas_resistance,
            battery_voltage,
            wifi_rssi,
            device_id,
            devices!inner (
              device_name,
              device_mac,
              site_id,
              sites!inner (
                name
              )
            )
          `)
          .order('captured_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        // Transform to match event structure
        const transformedEvents = (data || []).map((t: any) => ({
          ts: t.captured_at,
          event_type: 'telemetry',
          device_name: t.devices?.device_name,
          device_mac: t.devices?.device_mac,
          site_name: t.devices?.sites?.name,
          temperature: t.temperature,
          humidity: t.humidity,
          pressure: t.pressure,
          gas_resistance: t.gas_resistance,
          battery_voltage: t.battery_voltage,
          wifi_rssi: t.wifi_rssi,
        }));

        setEvents(transformedEvents);
      } else {
        // Fetch from existing view (all/payloads/images/observations)
        let query = supabase
          .from('vw_ingest_live')
          .select('*')
          .order('ts', { ascending: false })
          .limit(500);

        // Apply filter if not 'all'
        if (filter !== 'all') {
          query = query.eq('event_type', filter);
        }

        const { data, error } = await query;

        if (error) throw error;
        setEvents(data || []);
      }
    } catch (error: any) {
      console.error('Error fetching feed:', error);
      toast.error(`Failed to load feed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchFeed();
  }, [filter]);

  // Realtime updates (include device_telemetry for telemetry filter)
  useMultiTableRealtime(
    supabase,
    ['device_wake_payloads', 'device_images', 'petri_observations', 'device_telemetry'],
    fetchFeed,
    250
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Live Ingest Feed</h1>
            <p className="mt-2 text-sm text-gray-600">
              Real-time stream of all device ingestion events (last 500)
            </p>
          </div>
          {isSuperAdmin && <CompanySwitcher />}
        </div>
      </div>

      {/* Filter Chips */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          {(['all', 'payloads', 'images', 'observations', 'telemetry'] as FilterType[]).map((filterOption) => (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === filterOption
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Live Feed */}
      <div className="mb-6">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            Loading feed...
          </div>
        ) : (
          <LiveFeedTable events={events} timezone={timezone} />
        )}
      </div>

      {/* Copy Buttons */}
      <CopyButtons />
    </div>
  );
}
