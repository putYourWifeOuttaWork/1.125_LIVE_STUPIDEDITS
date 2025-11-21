import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Activity, AlertTriangle, Image as ImageIcon, Thermometer, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { SessionWakeSnapshot } from '../lib/types';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import SiteMapAnalyticsViewer from '../components/lab/SiteMapAnalyticsViewer';
import { TimelineController } from '../components/lab/TimelineController';
import { toast } from 'react-toastify';

interface SessionData {
  session_id: string;
  session_date: string;
  site_id: string;
  program_id: string;
  company_id: string;
  status: string;
  total_wake_count: number;
  total_images_count: number;
  total_alerts_count: number;
  site: {
    name: string;
    site_code: string;
    length: number;
    width: number;
  };
  pilot_program: {
    name: string;
  };
}

export default function SiteSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);
  const [snapshots, setSnapshots] = useState<SessionWakeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(0);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [zoneMode, setZoneMode] = useState<'none' | 'temperature' | 'humidity' | 'battery'>('temperature');

  // Easing function for smooth transitions
  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Interpolate between two values
  const lerp = (start: number | null, end: number | null, progress: number): number | null => {
    if (start === null || end === null) return end;
    const easedProgress = easeInOutCubic(progress);
    return start + (end - start) * easedProgress;
  };

  // Transform snapshot data with smooth transitions
  const displayDevices = useMemo(() => {
    if (snapshots.length === 0) return [];

    const currentSnapshot = snapshots[currentSnapshotIndex];
    if (!currentSnapshot || !currentSnapshot.site_state) return [];

    try {
      const currentState = typeof currentSnapshot.site_state === 'string'
        ? JSON.parse(currentSnapshot.site_state)
        : currentSnapshot.site_state;

      const currentDevices = currentState.devices || [];

      // Get next snapshot for interpolation
      const nextSnapshot = snapshots[currentSnapshotIndex + 1];
      const nextState = nextSnapshot?.site_state
        ? (typeof nextSnapshot.site_state === 'string'
            ? JSON.parse(nextSnapshot.site_state)
            : nextSnapshot.site_state)
        : null;
      const nextDevices = nextState?.devices || [];

      // Create a map of next device states by device_id
      const nextDeviceMap = new Map(
        nextDevices.map((d: any) => [d.device_id, d])
      );

      const transformedDevices = currentDevices
        .filter((d: any) => d.position && d.position.x !== null && d.position.y !== null)
        .map((d: any) => {
          const nextDevice = nextDeviceMap.get(d.device_id);

          // Interpolate values if we're transitioning and next device exists
          const temperature = transitionProgress < 1 && nextDevice
            ? lerp(d.telemetry?.latest_temperature, nextDevice.telemetry?.latest_temperature, transitionProgress)
            : d.telemetry?.latest_temperature ?? null;

          const humidity = transitionProgress < 1 && nextDevice
            ? lerp(d.telemetry?.latest_humidity, nextDevice.telemetry?.latest_humidity, transitionProgress)
            : d.telemetry?.latest_humidity ?? null;

          const mgi_score = transitionProgress < 1 && nextDevice
            ? lerp(d.mgi_state?.latest_mgi_score, nextDevice.mgi_state?.latest_mgi_score, transitionProgress)
            : d.mgi_state?.latest_mgi_score ?? null;

          const battery_level = transitionProgress < 1 && nextDevice
            ? lerp(d.battery_health_percent, nextDevice.battery_health_percent, transitionProgress)
            : d.battery_health_percent ?? null;

          return {
            device_id: d.device_id,
            device_code: d.device_code,
            device_name: d.device_name || d.device_code,
            x: d.position.x,
            y: d.position.y,
            battery_level,
            status: d.status || 'active',
            last_seen: d.last_seen_at || null,
            temperature,
            humidity,
            mgi_score,
            mgi_velocity: d.mgi_state?.mgi_velocity ?? null,
          };
        });

      return transformedDevices;
    } catch (error) {
      console.error('Error parsing snapshot data:', error);
      return [];
    }
  }, [snapshots, currentSnapshotIndex, transitionProgress]);

  // Animate transitions between snapshots
  useEffect(() => {
    if (snapshots.length === 0) return;

    setTransitionProgress(0);

    const transitionDuration = 500;
    const frameRate = 60;
    const totalFrames = (transitionDuration / 1000) * frameRate;
    const increment = 1 / totalFrames;

    let frame = 0;
    const animationInterval = setInterval(() => {
      frame++;
      const progress = Math.min(frame * increment, 1);
      setTransitionProgress(progress);

      if (progress >= 1) {
        clearInterval(animationInterval);
      }
    }, 1000 / frameRate);

    return () => clearInterval(animationInterval);
  }, [currentSnapshotIndex]);

  // Load session and snapshots
  useEffect(() => {
    if (!sessionId) return;

    const loadSessionData = async () => {
      setLoading(true);
      try {
        // Fetch session data
        const { data: sessionData, error: sessionError } = await supabase
          .from('site_device_sessions')
          .select(`
            session_id,
            session_date,
            site_id,
            program_id,
            company_id,
            status,
            total_wake_count,
            total_images_count,
            total_alerts_count,
            site:sites(name, site_code, length, width),
            pilot_program:pilot_programs(name)
          `)
          .eq('session_id', sessionId)
          .single();

        if (sessionError) throw sessionError;
        setSession(sessionData as any);

        // Fetch snapshots for this specific session
        const { data: snapshotData, error: snapshotError } = await supabase
          .from('session_wake_snapshots')
          .select('*')
          .eq('session_id', sessionId)
          .order('wake_round_start', { ascending: true });

        if (snapshotError) throw snapshotError;
        setSnapshots((snapshotData || []) as SessionWakeSnapshot[]);

      } catch (error) {
        console.error('Error loading session data:', error);
        toast.error('Failed to load session data');
      } finally {
        setLoading(false);
      }
    };

    loadSessionData();
  }, [sessionId]);

  if (loading) {
    return <LoadingScreen message="Loading session details..." />;
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-gray-600 mb-4">The requested session could not be found.</p>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go Back
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentSnapshot = snapshots[currentSnapshotIndex];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                to={`/sites/${session.site_id}/submissions`}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Site
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {session.site.name} - Session Detail
                </h1>
                <p className="text-sm text-gray-600">
                  {format(new Date(session.session_date), 'MMMM d, yyyy')} • {session.pilot_program.name}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                session.status === 'completed' ? 'bg-green-100 text-green-800' :
                session.status === 'active' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {session.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Session Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Wakes This Session</p>
                  <p className="text-2xl font-bold text-gray-900">{session.total_wake_count || 0}</p>
                </div>
                <Activity className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Images Collected</p>
                  <p className="text-2xl font-bold text-gray-900">{session.total_images_count || 0}</p>
                </div>
                <ImageIcon className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Alerts Triggered</p>
                  <p className="text-2xl font-bold text-gray-900">{session.total_alerts_count || 0}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Temperature</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {currentSnapshot?.avg_temperature?.toFixed(1) || '--'}°F
                  </p>
                </div>
                <Thermometer className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline Controls */}
        {snapshots.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-gray-600" />
                  <h2 className="text-lg font-semibold">Session Timeline</h2>
                  {currentSnapshot && (
                    <span className="text-sm text-gray-600">
                      (Wake #{currentSnapshot.wake_number} - {format(new Date(currentSnapshot.wake_round_start), 'h:mm a')})
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TimelineController
                totalWakes={snapshots.length}
                currentWake={currentSnapshotIndex + 1}
                onWakeChange={(wakeNum) => setCurrentSnapshotIndex(Math.max(0, Math.min(snapshots.length - 1, wakeNum - 1)))}
                wakeTimestamps={snapshots.map(s => s.wake_round_start)}
                autoPlaySpeed={2000}
              />
            </CardContent>
          </Card>
        )}

        {/* Site Map */}
        {displayDevices.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-5 h-5 text-gray-600" />
                  <h2 className="text-lg font-semibold">Site Map</h2>
                  <span className="text-sm text-gray-600">
                    {session.site.name} • {session.site.length}ft × {session.site.width}ft
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Zones:
                  <select
                    value={zoneMode}
                    onChange={(e) => setZoneMode(e.target.value as any)}
                    className="ml-2 px-2 py-1 border border-gray-300 rounded"
                  >
                    <option value="temperature">Temperature</option>
                    <option value="humidity">Humidity</option>
                    <option value="battery">Battery</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SiteMapAnalyticsViewer
                siteLength={session.site.length}
                siteWidth={session.site.width}
                siteName={session.site.name}
                devices={displayDevices}
                showControls={false}
                height={500}
                zoneMode={zoneMode}
              />
            </CardContent>
          </Card>
        )}

        {snapshots.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Snapshots Available</h3>
              <p className="text-gray-600">
                This session doesn't have any wake snapshots yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
