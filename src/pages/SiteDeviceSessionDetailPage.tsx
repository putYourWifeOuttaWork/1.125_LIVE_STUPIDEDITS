import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Map as MapIcon,
  MapPin,
  Camera,
  TrendingUp,
  TrendingDown,
  Thermometer,
  Droplets,
  Battery,
  Image as ImageIcon,
  AlertOctagon,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingScreen from '../components/common/LoadingScreen';
import DeviceSessionCard from '../components/devices/DeviceSessionCard';
import DeviceStatusBadge from '../components/devices/DeviceStatusBadge';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabaseClient';
import { SiteDeviceSession } from '../hooks/useSiteDeviceSessions';
import { useUserRole } from '../hooks/useUserRole';
import { useSiteSnapshots } from '../hooks/useSiteSnapshots';
import SiteMapAnalyticsViewer from '../components/lab/SiteMapAnalyticsViewer';
import { TimelineController } from '../components/lab/TimelineController';
import ZoneAnalytics from '../components/lab/ZoneAnalytics';
import { SessionWakeSnapshot } from '../lib/types';

interface DeviceSessionData {
  device_id: string;
  device_code: string;
  device_name?: string;
  hardware_version?: string;
  firmware_version?: string;
  wake_schedule_cron?: string;
  battery_voltage?: number;
  battery_health_percent?: number;
  wifi_ssid?: string;
  assigned_at: string;
  is_primary?: boolean;
  expected_wakes_in_session: number;
  actual_wakes: number;
  completed_wakes: number;
  failed_wakes: number;
  extra_wakes: number;
  wake_payloads: any[];
  images: any[];
  added_mid_session?: boolean;
}

const SiteDeviceSessionDetailPage = () => {
  const { programId, siteId, sessionId } = useParams<{
    programId: string;
    siteId: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<SiteDeviceSession | null>(null);
  const [devices, setDevices] = useState<DeviceSessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [isSessionExpiring, setIsSessionExpiring] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [siteData, setSiteData] = useState<any>(null);
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(0);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [zoneMode, setZoneMode] = useState<'none' | 'temperature' | 'humidity' | 'battery'>('temperature');

  const { role } = useUserRole();
  const canEdit = role === 'company_admin' || role === 'maintenance' || role === 'super_admin';
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch ALL snapshots for this site (site-wide, session-agnostic)
  const { snapshots: allSiteSnapshots, loading: snapshotsLoading, refetch: refetchSnapshots } = useSiteSnapshots(
    siteId || null,
    session?.program_id || null
  );

  useEffect(() => {
    if (sessionId) {
      fetchSessionData();
      fetchDevicesData();
    }
  }, [sessionId]);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('site_device_sessions')
        .select(`
          *,
          sites!inner (
            name
          ),
          pilot_programs!inner (
            name
          )
        `)
        .eq('session_id', sessionId)
        .single();

      if (error) throw error;

      setSession({
        ...data,
        site_name: data.sites?.name || 'Unknown Site',
        program_name: data.pilot_programs?.name || 'Unknown Program',
      } as SiteDeviceSession);
    } catch (error: any) {
      console.error('Error fetching session:', error);
      toast.error('Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevicesData = async () => {
    try {
      setDevicesLoading(true);
      if (!sessionId) return;

      const { data, error } = await supabase.rpc('get_session_devices_with_wakes', {
        p_session_id: sessionId
      });

      if (error) throw error;

      if (data && data.devices) {
        setDevices(data.devices);
      }
    } catch (error: any) {
      console.error('Error fetching devices:', error);
      toast.error('Failed to load device data');
    } finally {
      setDevicesLoading(false);
    }
  };

  // Fetch site data for map dimensions
  useEffect(() => {
    const fetchSiteData = async () => {
      if (!siteId) return;

      try {
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('length, width, name')
          .eq('site_id', siteId)
          .single();

        if (siteError) throw siteError;
        setSiteData(site);
      } catch (error: any) {
        console.error('Error fetching site data:', error);
      }
    };

    fetchSiteData();
  }, [siteId]);

  const handleRefresh = () => {
    fetchSessionData();
    fetchDevicesData();
    refetchSnapshots();
  };

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

  // Filter to only session's snapshots and process with site-wide LOCF
  const processedSnapshots = useMemo(() => {
    if (allSiteSnapshots.length === 0) return [];

    const processed: any[] = [];
    const deviceStateCache = new Map<string, any>(); // device_id -> last known state

    // Helper: Use new value if it's not null/undefined, otherwise keep cached
    const carryForward = (newVal: any, cachedVal: any) => {
      if (newVal !== null && newVal !== undefined) {
        return newVal;
      }
      return cachedVal;
    };

    // For nested objects, check if they have actual data
    const hasValidPosition = (pos: any) => {
      return pos && pos.x !== null && pos.x !== undefined && pos.y !== null && pos.y !== undefined;
    };

    const hasValidTelemetry = (tel: any) => {
      return tel && (tel.latest_temperature !== null || tel.latest_humidity !== null);
    };

    const hasValidMGI = (mgi: any) => {
      return mgi && (mgi.latest_mgi_score !== null || mgi.mgi_velocity !== null);
    };

    // Process ALL site snapshots (already sorted by wake_round_start)
    for (let i = 0; i < allSiteSnapshots.length; i++) {
      const snapshot = allSiteSnapshots[i];

      try {
        const siteState = typeof snapshot.site_state === 'string'
          ? JSON.parse(snapshot.site_state)
          : snapshot.site_state;

        const currentDevices = siteState?.devices || [];

        // Update cache with new data from this snapshot
        currentDevices.forEach((device: any) => {
          const deviceId = device.device_id;
          const cachedState = deviceStateCache.get(deviceId) || {};

          // Merge with LOCF rules: use new data if valid, otherwise carry forward
          // CRITICAL: Position is LOCKED once set - devices don't move during visualization
          const newPosition = cachedState.position
            ? cachedState.position  // Keep existing position (frozen)
            : (hasValidPosition(device.position) ? device.position : null); // Set initial position

          const newTelemetry = hasValidTelemetry(device.telemetry) ? {
            latest_temperature: carryForward(device.telemetry.latest_temperature, cachedState.telemetry?.latest_temperature),
            latest_humidity: carryForward(device.telemetry.latest_humidity, cachedState.telemetry?.latest_humidity),
          } : cachedState.telemetry || {};
          const newMGI = hasValidMGI(device.mgi_state) ? {
            latest_mgi_score: carryForward(device.mgi_state.latest_mgi_score, cachedState.mgi_state?.latest_mgi_score),
            mgi_velocity: carryForward(device.mgi_state.mgi_velocity, cachedState.mgi_state?.mgi_velocity),
          } : cachedState.mgi_state || {};

          deviceStateCache.set(deviceId, {
            device_id: device.device_id,
            device_code: device.device_code,
            device_name: carryForward(device.device_name, cachedState.device_name),
            position: newPosition,
            status: carryForward(device.status, cachedState.status) || 'active',
            last_seen_at: device.last_seen_at || cachedState.last_seen_at,
            battery_health_percent: carryForward(
              device.battery_health_percent,
              cachedState.battery_health_percent
            ),
            telemetry: newTelemetry,
            mgi_state: newMGI,
          });
        });

        // Build complete device list from cache (ALL devices ever seen)
        const completeDevices = Array.from(deviceStateCache.values())
          .filter(d => d.position && d.position.x !== null && d.position.y !== null);

        console.log(`✅ Snapshot #${snapshot.wake_number}: ${currentDevices.length} raw → ${completeDevices.length} with LOCF`);

        processed.push({
          ...snapshot,
          site_state: {
            ...siteState,
            devices: completeDevices, // All cached devices
          },
        });
      } catch (error) {
        console.error('Error processing snapshot:', error);
        processed.push(snapshot);
      }
    }

    // Filter to only this session's snapshots
    return processed.filter(s => s.session_id === sessionId);
  }, [allSiteSnapshots, sessionId]);

  // Transform snapshot data with smooth transitions
  const displayDevices = useMemo(() => {
    if (processedSnapshots.length === 0) return [];

    const currentSnapshot = processedSnapshots[currentSnapshotIndex];
    if (!currentSnapshot || !currentSnapshot.site_state) return [];

    try {
      const currentState = typeof currentSnapshot.site_state === 'string'
        ? JSON.parse(currentSnapshot.site_state)
        : currentSnapshot.site_state;

      const currentDevices = currentState.devices || [];

      // Get next snapshot for interpolation
      const nextSnapshot = processedSnapshots[currentSnapshotIndex + 1];
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
  }, [processedSnapshots, currentSnapshotIndex, transitionProgress]);

  // Animate transitions between snapshots
  useEffect(() => {
    if (processedSnapshots.length === 0) return;

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

  const handleEditDevice = (deviceId: string) => {
    // Navigate to device edit or show modal
    navigate(`/devices/${deviceId}`);
  };

  // Handle session expiration checking with countdown
  useEffect(() => {
    const checkSessionExpiration = () => {
      if (!session?.session_end_time) return;

      const sessionEnd = new Date(session.session_end_time);
      const now = new Date();
      const secondsRemaining = Math.floor((sessionEnd.getTime() - now.getTime()) / 1000);

      if (secondsRemaining <= 0) {
        setIsSessionExpired(true);
        setIsSessionExpiring(false);
        setTimeRemaining('Session ended');
      } else {
        setIsSessionExpired(false);

        // Check if expiring (less than 1 hour remaining)
        const hoursRemaining = secondsRemaining / 3600;
        setIsSessionExpiring(hoursRemaining <= 1);

        // Format time remaining
        const hours = Math.floor(secondsRemaining / 3600);
        const minutes = Math.floor((secondsRemaining % 3600) / 60);
        const seconds = secondsRemaining % 60;

        if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m remaining`);
        } else if (minutes > 0) {
          setTimeRemaining(`${minutes}m ${seconds}s remaining`);
        } else {
          setTimeRemaining(`${seconds}s remaining`);
        }
      }
    };

    // Check immediately
    checkSessionExpiration();

    // Update every second for accurate countdown
    sessionTimerRef.current = setInterval(checkSessionExpiration, 1000);

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
  }, [session]);

  // Calculate totals from devices
  const totalExpectedWakes = devices.reduce((sum, d) => sum + d.expected_wakes_in_session, 0);
  const totalActualWakes = devices.reduce((sum, d) => sum + d.actual_wakes, 0);
  const totalCompletedWakes = devices.reduce((sum, d) => sum + d.completed_wakes, 0);
  const totalFailedWakes = devices.reduce((sum, d) => sum + d.failed_wakes, 0);
  const totalExtraWakes = devices.reduce((sum, d) => sum + d.extra_wakes, 0);
  const totalImages = devices.reduce((sum, d) => sum + (d.images?.length || 0), 0);

  const completionPercentage = totalExpectedWakes > 0
    ? Math.round((totalCompletedWakes / totalExpectedWakes) * 100)
    : 0;

  // Calculate environmental aggregates from ALL devices across ALL snapshots
  const environmentalAggregates = useMemo(() => {
    if (!allSiteSnapshots || allSiteSnapshots.length === 0) return null;

    const allTemps: number[] = [];
    const allHumidity: number[] = [];
    const allBattery: number[] = [];
    const allMGI: number[] = [];

    // Collect data from all devices in all snapshots
    allSiteSnapshots.forEach(snapshot => {
      snapshot.site_state?.devices?.forEach((device) => {
        if (device.temperature != null) allTemps.push(device.temperature);
        if (device.humidity != null) allHumidity.push(device.humidity);
        if (device.battery_voltage != null) {
          // Convert voltage to percentage (assuming 3.0V = 0%, 4.2V = 100%)
          const batteryPercent = Math.max(0, Math.min(100, ((device.battery_voltage - 3.0) / 1.2) * 100));
          allBattery.push(batteryPercent);
        }
        if (device.mgi_score != null) allMGI.push(device.mgi_score);
      });
    });

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const stdDev = (arr: number[]) => {
      if (arr.length < 2) return null;
      const mean = avg(arr)!;
      const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
      return Math.sqrt(variance);
    };

    return {
      temperature: {
        avg: avg(allTemps),
        min: allTemps.length ? Math.min(...allTemps) : null,
        max: allTemps.length ? Math.max(...allTemps) : null,
        stdDev: stdDev(allTemps),
        samples: allTemps.length,
      },
      humidity: {
        avg: avg(allHumidity),
        min: allHumidity.length ? Math.min(...allHumidity) : null,
        max: allHumidity.length ? Math.max(...allHumidity) : null,
        stdDev: stdDev(allHumidity),
        samples: allHumidity.length,
      },
      battery: {
        avg: avg(allBattery),
        min: allBattery.length ? Math.min(...allBattery) : null,
        max: allBattery.length ? Math.max(...allBattery) : null,
        samples: allBattery.length,
      },
      mgi: {
        avg: avg(allMGI),
        min: allMGI.length ? Math.min(...allMGI) : null,
        max: allMGI.length ? Math.max(...allMGI) : null,
        stdDev: stdDev(allMGI),
        samples: allMGI.length,
      },
    };
  }, [allSiteSnapshots]);

  // Calculate alert statistics
  const alertStats = useMemo(() => {
    // TODO: Fetch from device_alerts table filtered by session date range
    return {
      total: 0,
      critical: 0,
      warning: 0,
      info: 0,
    };
  }, [sessionId]);

  // Calculate issue statistics
  const issueStats = useMemo(() => {
    const missedWakes = totalExpectedWakes - totalCompletedWakes;
    const reliability = totalExpectedWakes > 0
      ? ((totalCompletedWakes / totalExpectedWakes) * 100).toFixed(1)
      : '0.0';

    return {
      missedWakes,
      failedWakes: totalFailedWakes,
      reliability: parseFloat(reliability),
      devicesWithIssues: devices.filter(d => d.failed_wakes > 0 || d.actual_wakes < d.expected_wakes_in_session).length,
    };
  }, [devices, totalExpectedWakes, totalCompletedWakes, totalFailedWakes]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Session not found</h3>
        <p className="mt-1 text-sm text-gray-500">The requested device session could not be found.</p>
        <div className="mt-6">
          <Button
            variant="primary"
            onClick={() => navigate('/home')}
            icon={<ArrowLeft size={16} />}
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'locked':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };


  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
            icon={<ArrowLeft size={16} />}
          >
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Device Session Details</h1>
            <p className="text-gray-600 mt-1">
              {session.site_name} - {format(new Date(session.session_date), 'MMMM dd, yyyy')}
            </p>
            {timeRemaining && (
              <p className={`text-sm mt-1 font-medium ${
                isSessionExpired ? 'text-red-600' :
                isSessionExpiring ? 'text-yellow-600' :
                'text-blue-600'
              }`}>
                <Clock className="inline h-4 w-4 mr-1" />
                {timeRemaining}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => navigate(`/lab/sessions/${sessionId}/snapshots`)}
            icon={<MapIcon size={16} />}
          >
            View Snapshot Map
          </Button>
          <Button variant="outline" onClick={handleRefresh} icon={<RefreshCw size={16} />}>
            Refresh
          </Button>
        </div>
      </div>

      {isSessionExpired && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Session Ended</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  This device session has ended. No more device communications are expected.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSessionExpiring && !isSessionExpired && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Session Ending Soon</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  This device session is nearing its end. Device communications will stop at the scheduled end time.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Site Map with Timeline - MOVED TO TOP */}
      {siteData && processedSnapshots.length > 0 && displayDevices.length > 0 && (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold">Session Timeline & Site Map</h2>
                <span className="text-sm text-gray-600">
                  {siteData.name} • {siteData.length}ft × {siteData.width}ft
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Zones:
                <select
                  value={zoneMode}
                  onChange={(e) => setZoneMode(e.target.value as any)}
                  className="ml-2 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
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
            <div className="space-y-4">
              {/* Timeline Controller */}
              <TimelineController
                totalWakes={processedSnapshots.length}
                currentWake={currentSnapshotIndex + 1}
                onWakeChange={(wakeNum) => setCurrentSnapshotIndex(Math.max(0, Math.min(processedSnapshots.length - 1, wakeNum - 1)))}
                wakeTimestamps={processedSnapshots.map(s => s.wake_round_start)}
                autoPlaySpeed={2000}
              />

              {/* Site Map */}
              <SiteMapAnalyticsViewer
                siteLength={siteData.length}
                siteWidth={siteData.width}
                siteName={siteData.name}
                devices={displayDevices}
                showControls={false}
                height={500}
                zoneMode={zoneMode}
                onDeviceClick={(deviceId) => navigate(`/programs/${programId}/devices/${deviceId}`)}
              />

              {/* Zone Analytics */}
              {zoneMode !== 'none' && displayDevices.length >= 2 && (
                <ZoneAnalytics devices={displayDevices} zoneMode={zoneMode} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="animate-fade-in hover:shadow-lg transition-shadow duration-300">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Status</p>
                <p className={`text-2xl font-bold mt-1 px-3 py-1 rounded-full border inline-block ${getStatusColor(session.status)}`}>
                  {session.status.toUpperCase()}
                </p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: '0.1s' }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completion</p>
                <p className="text-2xl font-bold mt-1">{completionPercentage}%</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-in hover:shadow-lg transition-shadow duration-300" style={{ animationDelay: '0.2s' }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Wakes</p>
                <p className="text-2xl font-bold mt-1">
                  {totalActualWakes}
                </p>
              </div>
              <Wifi className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Session Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Wakes This Session */}
        <Card className="animate-fade-in hover:shadow-lg transition-all duration-300 hover:scale-[1.02]" style={{ animationDelay: '0.1s' }}>
          <CardHeader>
            <h3 className="text-md font-semibold flex items-center">
              <Wifi className="w-5 h-5 mr-2 text-blue-500" />
              Wakes This Session
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Completed</span>
                <span className="text-lg font-bold text-green-600">{totalCompletedWakes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Failed</span>
                <span className="text-lg font-bold text-red-600">{totalFailedWakes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Extra</span>
                <span className="text-lg font-bold text-yellow-600">{totalExtraWakes}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium text-gray-700">Expected</span>
                <span className="text-lg font-bold text-gray-900">{totalExpectedWakes}</span>
              </div>
              <div className="pt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Reliability</span>
                  <span>{issueStats.reliability}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${issueStats.reliability}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Images This Session */}
        <Card className="animate-fade-in hover:shadow-lg transition-all duration-300 hover:scale-[1.02]" style={{ animationDelay: '0.2s' }}>
          <CardHeader>
            <h3 className="text-md font-semibold flex items-center">
              <Camera className="w-5 h-5 mr-2 text-purple-500" />
              Images This Session
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-center py-4">
                <p className="text-4xl font-bold text-purple-600">{totalImages}</p>
                <p className="text-sm text-gray-500 mt-1">Total Captured</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900">{devices.length}</p>
                  <p className="text-xs text-gray-500">Devices</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900">
                    {devices.length > 0 ? (totalImages / devices.length).toFixed(1) : '0'}
                  </p>
                  <p className="text-xs text-gray-500">Avg/Device</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Issues This Session */}
        <Card className="animate-fade-in hover:shadow-lg transition-all duration-300 hover:scale-[1.02]" style={{ animationDelay: '0.3s' }}>
          <CardHeader>
            <h3 className="text-md font-semibold flex items-center">
              <AlertOctagon className="w-5 h-5 mr-2 text-red-500" />
              Issues This Session
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Missed Wakes</span>
                <span className="text-lg font-bold text-orange-600">{issueStats.missedWakes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Failed Wakes</span>
                <span className="text-lg font-bold text-red-600">{issueStats.failedWakes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Devices with Issues</span>
                <span className="text-lg font-bold text-yellow-600">{issueStats.devicesWithIssues}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{issueStats.reliability}%</p>
                  <p className="text-xs text-gray-500">System Reliability</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Environmental & MGI Aggregates */}
      {environmentalAggregates && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Environmental Aggregates */}
          <Card className="animate-fade-in hover:shadow-lg transition-all duration-300" style={{ animationDelay: '0.4s' }}>
            <CardHeader>
              <h3 className="text-md font-semibold flex items-center">
                <Thermometer className="w-5 h-5 mr-2 text-orange-500" />
                Environmental Aggregates
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Temperature */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Temperature</span>
                    <span className="text-xs text-gray-500">{environmentalAggregates.temperature.samples} samples</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 rounded p-2">
                      <p className="text-xs text-gray-600">Avg</p>
                      <p className="text-sm font-bold text-blue-600">
                        {environmentalAggregates.temperature.avg?.toFixed(1)}°F
                      </p>
                    </div>
                    <div className="bg-red-50 rounded p-2">
                      <p className="text-xs text-gray-600">Max</p>
                      <p className="text-sm font-bold text-red-600">
                        {environmentalAggregates.temperature.max?.toFixed(1)}°F
                      </p>
                    </div>
                    <div className="bg-cyan-50 rounded p-2">
                      <p className="text-xs text-gray-600">Min</p>
                      <p className="text-sm font-bold text-cyan-600">
                        {environmentalAggregates.temperature.min?.toFixed(1)}°F
                      </p>
                    </div>
                  </div>
                  {environmentalAggregates.temperature.stdDev && (
                    <p className="text-xs text-gray-500 mt-1">
                      Std Dev: ±{environmentalAggregates.temperature.stdDev.toFixed(2)}°F
                    </p>
                  )}
                </div>

                {/* Humidity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 flex items-center">
                      <Droplets className="w-4 h-4 mr-1 text-blue-400" />
                      Humidity
                    </span>
                    <span className="text-xs text-gray-500">{environmentalAggregates.humidity.samples} samples</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 rounded p-2">
                      <p className="text-xs text-gray-600">Avg</p>
                      <p className="text-sm font-bold text-blue-600">
                        {environmentalAggregates.humidity.avg?.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-indigo-50 rounded p-2">
                      <p className="text-xs text-gray-600">Max</p>
                      <p className="text-sm font-bold text-indigo-600">
                        {environmentalAggregates.humidity.max?.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-sky-50 rounded p-2">
                      <p className="text-xs text-gray-600">Min</p>
                      <p className="text-sm font-bold text-sky-600">
                        {environmentalAggregates.humidity.min?.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Battery */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 flex items-center">
                      <Battery className="w-4 h-4 mr-1 text-green-500" />
                      Battery Health
                    </span>
                    <span className="text-xs text-gray-500">{environmentalAggregates.battery.samples} samples</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-green-50 rounded p-2">
                      <p className="text-xs text-gray-600">Avg</p>
                      <p className="text-sm font-bold text-green-600">
                        {environmentalAggregates.battery.avg?.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded p-2">
                      <p className="text-xs text-gray-600">Max</p>
                      <p className="text-sm font-bold text-emerald-600">
                        {environmentalAggregates.battery.max?.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-yellow-50 rounded p-2">
                      <p className="text-xs text-gray-600">Min</p>
                      <p className="text-sm font-bold text-yellow-600">
                        {environmentalAggregates.battery.min?.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MGI Aggregates */}
          <Card className="animate-fade-in hover:shadow-lg transition-all duration-300" style={{ animationDelay: '0.5s' }}>
            <CardHeader>
              <h3 className="text-md font-semibold flex items-center">
                <Activity className="w-5 h-5 mr-2 text-teal-500" />
                MGI Aggregates
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center py-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg">
                  <p className="text-5xl font-bold text-teal-600">
                    {environmentalAggregates.mgi.avg?.toFixed(1) || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">Average MGI Score</p>
                  <p className="text-xs text-gray-500 mt-1">{environmentalAggregates.mgi.samples} samples</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-red-50 rounded p-3 text-center">
                    <div className="flex items-center justify-center mb-1">
                      <TrendingUp className="w-4 h-4 mr-1 text-red-500" />
                      <p className="text-xs text-gray-600">Maximum</p>
                    </div>
                    <p className="text-2xl font-bold text-red-600">
                      {environmentalAggregates.mgi.max?.toFixed(1) || '-'}
                    </p>
                  </div>

                  <div className="bg-green-50 rounded p-3 text-center">
                    <div className="flex items-center justify-center mb-1">
                      <TrendingDown className="w-4 h-4 mr-1 text-green-500" />
                      <p className="text-xs text-gray-600">Minimum</p>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {environmentalAggregates.mgi.min?.toFixed(1) || '-'}
                    </p>
                  </div>
                </div>

                {environmentalAggregates.mgi.stdDev && (
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-600 text-center">Standard Deviation</p>
                    <p className="text-lg font-bold text-gray-700 text-center mt-1">
                      ±{environmentalAggregates.mgi.stdDev.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 text-center mt-1">Variability across session</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Session Details</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm py-2 border-b">
                  <span className="text-gray-600 flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    Session Date
                  </span>
                  <span className="font-medium">{format(new Date(session.session_date), 'MMMM dd, yyyy')}</span>
                </div>

                <div className="flex items-center justify-between text-sm py-2 border-b">
                  <span className="text-gray-600 flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    Start Time
                  </span>
                  <span className="font-medium">{format(new Date(session.session_start_time), 'HH:mm:ss z')}</span>
                </div>

                <div className="flex items-center justify-between text-sm py-2 border-b">
                  <span className="text-gray-600 flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    End Time
                  </span>
                  <span className="font-medium">{format(new Date(session.session_end_time), 'HH:mm:ss z')}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm py-2 border-b">
                  <span className="text-gray-600">Program</span>
                  <span className="font-medium">{session.program_name}</span>
                </div>

                <div className="flex items-center justify-between text-sm py-2 border-b">
                  <span className="text-gray-600">Site</span>
                  <span className="font-medium">{session.site_name}</span>
                </div>

                {session.config_changed_flag && (
                  <div className="flex items-center justify-between text-sm py-2 border-b border-yellow-200 bg-yellow-50 px-2 rounded">
                    <span className="text-yellow-700 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Config Changed
                    </span>
                    <span className="text-xs text-yellow-600">Mid-day change detected</span>
                  </div>
                )}

                {session.locked_at && (
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span className="text-gray-600">Locked At</span>
                    <span className="font-medium">{format(new Date(session.locked_at), 'MMM dd, HH:mm')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compact Device Performance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Device Performance Summary ({devices.length} devices)</h2>
            {devicesLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {devicesLoading ? (
            <div className="flex justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="mx-auto h-16 w-16 text-gray-300" />
              <p className="text-gray-600 mt-4 text-lg">No devices found in this session</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Device</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Wakes</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Success Rate</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Images</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Battery</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Env Avg</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {devices.map((device, idx) => {
                    const successRate = device.expected_wakes_in_session > 0
                      ? Math.round((device.completed_wakes / device.expected_wakes_in_session) * 100)
                      : 0;

                    const avgTemp = device.wake_payloads
                      ?.filter((w: any) => w.temperature != null)
                      .reduce((sum: number, w: any, _: number, arr: any[]) => sum + w.temperature / arr.length, 0);

                    const avgHumidity = device.wake_payloads
                      ?.filter((w: any) => w.humidity != null)
                      .reduce((sum: number, w: any, _: number, arr: any[]) => sum + w.humidity / arr.length, 0);

                    return (
                      <tr
                        key={device.device_id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/programs/${programId}/devices/${device.device_id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <div>
                              <p className="font-medium text-gray-900">{device.device_name || device.device_code}</p>
                              <p className="text-xs text-gray-500">{device.device_code}</p>
                            </div>
                            {device.is_primary && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-sm">
                            <span className="font-bold text-gray-900">{device.actual_wakes}</span>
                            <span className="text-gray-500"> / {device.expected_wakes_in_session}</span>
                          </div>
                          <div className="flex justify-center space-x-2 mt-1 text-xs">
                            <span className="text-green-600">✓ {device.completed_wakes}</span>
                            {device.failed_wakes > 0 && (
                              <span className="text-red-600">✗ {device.failed_wakes}</span>
                            )}
                            {device.extra_wakes > 0 && (
                              <span className="text-yellow-600">+ {device.extra_wakes}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center">
                            <span className={`text-lg font-bold ${
                              successRate >= 90 ? 'text-green-600' :
                              successRate >= 70 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {successRate}%
                            </span>
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  successRate >= 90 ? 'bg-green-500' :
                                  successRate >= 70 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${successRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <ImageIcon className="w-4 h-4 text-purple-500" />
                            <span className="font-medium text-gray-900">{device.images?.length || 0}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center">
                            <Battery className={`w-5 h-5 mb-1 ${
                              (device.battery_health_percent || 0) >= 80 ? 'text-green-500' :
                              (device.battery_health_percent || 0) >= 50 ? 'text-yellow-500' :
                              'text-red-500'
                            }`} />
                            <span className="text-sm font-medium text-gray-900">
                              {device.battery_health_percent?.toFixed(0) || 'N/A'}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="space-y-1">
                            {avgTemp != null && (
                              <div className="flex items-center justify-center space-x-1 text-xs">
                                <Thermometer className="w-3 h-3 text-orange-500" />
                                <span>{avgTemp.toFixed(1)}°F</span>
                              </div>
                            )}
                            {avgHumidity != null && (
                              <div className="flex items-center justify-center space-x-1 text-xs">
                                <Droplets className="w-3 h-3 text-blue-500" />
                                <span>{avgHumidity.toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DeviceStatusBadge
                            status={device.failed_wakes > 0 ? 'offline' : 'active'}
                            size="sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/programs/${programId}/devices/${device.device_id}`);
                            }}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            View Details →
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteDeviceSessionDetailPage;
