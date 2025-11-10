import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CompanySwitcher } from '../../components/lab/CompanySwitcher';
import { LiveFeedTable } from '../../components/lab/LiveFeedTable';
import { CopyButtons } from '../../components/lab/CopyButtons';
import { useMultiTableRealtime } from '../../hooks/useRealtimeThrottle';
import { toast } from 'react-toastify';
import { useUserRole } from '../../hooks/useUserRole';

export default function IngestFeed() {
  const { userRole } = useUserRole();
  const isSuperAdmin = userRole === 'super_admin';

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timezone] = useState('UTC'); // Could make this dynamic based on user preference

  // Fetch live feed
  const fetchFeed = async () => {
    try {
      const { data, error } = await supabase
        .from('vw_ingest_live')
        .select('*')
        .order('ts', { ascending: false })
        .limit(500);

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error('Error fetching feed:', error);
      toast.error(`Failed to load feed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchFeed();
  }, []);

  // Realtime updates
  useMultiTableRealtime(
    supabase,
    ['device_wake_payloads', 'device_images', 'petri_observations'],
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
