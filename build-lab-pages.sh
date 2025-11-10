#!/bin/bash
set -e

# 1. SiteSessions.tsx
cat > src/pages/lab/SiteSessions.tsx << 'EOFPAGE'
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CompanySwitcher } from '../../components/lab/CompanySwitcher';
import { SiteSelector } from '../../components/lab/SiteSelector';
import { DateInSiteTzPicker } from '../../components/lab/DateInSiteTzPicker';
import { SessionSummaryCard } from '../../components/lab/SessionSummaryCard';
import { DeviceWakeGrid } from '../../components/lab/DeviceWakeGrid';
import { ImageDrawer } from '../../components/lab/ImageDrawer';
import { useMultiTableRealtime } from '../../hooks/useRealtimeThrottle';
import { todayInSiteTz, dayRangeInSiteTz } from '../../lib/timezone';
import { toast } from 'react-toastify';
import { useUserRole } from '../../hooks/useUserRole';

export default function SiteSessions() {
  const { userRole } = useUserRole();
  const isSuperAdmin = userRole === 'super_admin';

  const [siteId, setSiteId] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [selectedDate, setSelectedDate] = useState(todayInSiteTz('UTC'));
  
  const [session, setSession] = useState<any>(null);
  const [payloads, setPayloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  // Fetch session and payloads
  const fetchData = async () => {
    if (!siteId) return;

    setLoading(true);
    try {
      const { start, end } = dayRangeInSiteTz(selectedDate, timezone);

      // Get session
      const { data: sessionData, error: sessionError } = await supabase
        .from('vw_site_day_sessions')
        .select('*')
        .eq('site_id', siteId)
        .gte('session_start_time', start)
        .lte('session_end_time', end)
        .maybeSingle();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      if (sessionData) {
        // Get payloads
        const { data: payloadData, error: payloadError } = await supabase
          .from('vw_session_payloads')
          .select('*')
          .eq('session_id', sessionData.session_id)
          .order('captured_at', { ascending: false });

        if (payloadError) throw payloadError;
        setPayloads(payloadData || []);
      } else {
        setPayloads([]);
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(\`Failed to load session data: \${error.message}\`);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [siteId, selectedDate]);

  // Realtime updates
  useMultiTableRealtime(
    supabase,
    ['device_wake_payloads', 'device_images', 'petri_observations'],
    fetchData,
    250
  );

  const handleSiteChange = (newSiteId: string, newTimezone: string) => {
    setSiteId(newSiteId);
    setTimezone(newTimezone);
    setSelectedDate(todayInSiteTz(newTimezone));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Site Sessions</h1>
        <p className="mt-2 text-sm text-gray-600">
          Real-time monitoring of device wake sessions and image transmissions
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {isSuperAdmin && <CompanySwitcher />}
          <SiteSelector value={siteId} onChange={handleSiteChange} />
          {siteId && (
            <DateInSiteTzPicker
              value={selectedDate}
              timezone={timezone}
              onChange={setSelectedDate}
            />
          )}
        </div>
        {siteId && (
          <div className="mt-2 text-xs text-gray-500">
            All times local to {timezone}
          </div>
        )}
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      )}

      {!loading && !siteId && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          Select a site to view its session data
        </div>
      )}

      {!loading && siteId && !session && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          No session found for selected date
        </div>
      )}

      {!loading && session && (
        <>
          <div className="mb-6">
            <SessionSummaryCard session={session} />
          </div>

          <DeviceWakeGrid
            payloads={payloads}
            timezone={timezone}
            onRowClick={setSelectedImageId}
          />
        </>
      )}

      {/* Image Drawer */}
      {selectedImageId && (
        <ImageDrawer
          imageId={selectedImageId}
          timezone={timezone}
          onClose={() => setSelectedImageId(null)}
        />
      )}
    </div>
  );
}
EOFPAGE

echo "✅ SiteSessions.tsx"

# 2. IngestFeed.tsx
cat > src/pages/lab/IngestFeed.tsx << 'EOFPAGE'
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
      toast.error(\`Failed to load feed: \${error.message}\`);
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
EOFPAGE

echo "✅ IngestFeed.tsx"
echo "✅ All Lab pages created successfully!"

