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
  Zap,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingScreen from '../components/common/LoadingScreen';
import DeviceSessionCard from '../components/devices/DeviceSessionCard';
import DeviceStatusBadge from '../components/devices/DeviceStatusBadge';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabaseClient';
import { parseDateOnly } from '../utils/timeFormatters';
import { SiteDeviceSession } from '../hooks/useSiteDeviceSessions';
import { useUserRole } from '../hooks/useUserRole';
import { useSessionSnapshots } from '../hooks/useSessionSnapshots';
import SiteMapAnalyticsViewer from '../components/lab/SiteMapAnalyticsViewer';
import { TimelineController } from '../components/lab/TimelineController';
import ZoneAnalytics from '../components/lab/ZoneAnalytics';
import { SessionWakeSnapshot } from '../lib/types';
import TimeSeriesChart from '../components/lab/TimeSeriesChart';
import HistogramChart from '../components/lab/HistogramChart';
import DeviceImageLightbox from '../components/devices/DeviceImageLightbox';
import ManualWakeModal from '../components/devices/ManualWakeModal';
import { createLogger } from '../utils/logger';
import { formatMGI } from '../utils/mgiUtils';

const log = createLogger('SessionDetail');

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

type TabType = 'overview' | 'analytics' | 'images';

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
  const [sessionAlerts, setSessionAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    images: any[];
    currentIndex: number;
    deviceInfo: { device_code: string; device_name?: string };
  } | null>(null);
  const [enhancedDeviceData, setEnhancedDeviceData] = useState<Map<string, any>>(new Map());
  const [enhancedDeviceDataLoading, setEnhancedDeviceDataLoading] = useState(false);
  const [manualWakeModalState, setManualWakeModalState] = useState<{
    isOpen: boolean;
    deviceId: string;
    deviceCode: string;
  } | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(true);

  const { role } = useUserRole();
  const canEdit = role === 'company_admin' || role === 'maintenance' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'company_admin' || role === 'super_admin';
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isSessionActive = session?.status === 'in_progress' &&
    session?.session_end_time && new Date(session.session_end_time) > new Date();

  const pollIntervalMs = isSessionActive && isLiveMode ? 60000 : null;

  const { snapshots: sessionSnapshots, loading: snapshotsLoading, refetch: refetchSnapshots } = useSessionSnapshots(
    sessionId || null,
    { pollIntervalMs }
  );

  useEffect(() => {
    if (sessionId) {
      fetchSessionData();
      fetchDevicesData();
    }
  }, [sessionId]);

  useEffect(() => {
    if (session?.status === 'locked') {
      setIsLiveMode(false);
    }
  }, [session?.status]);

  useEffect(() => {
    if (isLiveMode && processedSnapshots.length > 0) {
      setCurrentSnapshotIndex(processedSnapshots.length - 1);
    }
  }, [isLiveMode, processedSnapshots.length]);

  // Fetch session alerts
  useEffect(() => {
    const fetchSessionAlerts = async () => {
      if (!session || !siteId) {
        setAlertsLoading(false);
        return;
      }

      try {
        setAlertsLoading(true);

        // Get device IDs from current session
        const deviceIds = devices.map(d => d.device_id);

        if (deviceIds.length === 0) {
          setSessionAlerts([]);
          setAlertsLoading(false);
          return;
        }

        // Fetch alerts that occurred during this session timeframe
        const { data, error } = await supabase
          .from('device_alerts')
          .select('*')
          .in('device_id', deviceIds)
          .gte('triggered_at', session.session_start_time)
          .lte('triggered_at', session.session_end_time)
          .order('triggered_at', { ascending: false })
          .limit(500);

        if (error) throw error;

        setSessionAlerts(data || []);
      } catch (error: any) {
        log.error('Error fetching session alerts:', error);
      } finally {
        setAlertsLoading(false);
      }
    };

    fetchSessionAlerts();
  }, [session, devices, siteId]);

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
      log.error('Error fetching session:', error);
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
      log.error('Error fetching devices:', error);
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
        log.debug('Site data loaded:', site);
        setSiteData(site);
      } catch (error: any) {
        log.error('Error fetching site data:', error);
      }
    };

    fetchSiteData();
  }, [siteId]);

  const handleRefresh = () => {
    fetchSessionData();
    fetchDevicesData();
    refetchSnapshots();
  };

  // Fetch enhanced device data for Status Overview in Images tab
  const fetchEnhancedDeviceData = async () => {
    if (!devices || devices.length === 0) return;

    try {
      setEnhancedDeviceDataLoading(true);
      const deviceIds = devices.map(d => d.device_id);

      const { data, error } = await supabase
        .from('devices')
        .select('device_id, provisioning_status, next_wake_at, manual_wake_override, is_active')
        .in('device_id', deviceIds);

      if (error) throw error;

      if (data) {
        const dataMap = new Map();
        data.forEach(device => {
          dataMap.set(device.device_id, device);
        });
        setEnhancedDeviceData(dataMap);
      }
    } catch (error: any) {
      log.error('Error fetching enhanced device data:', error);
    } finally {
      setEnhancedDeviceDataLoading(false);
    }
  };

  // Fetch enhanced device data when Images tab is active
  useEffect(() => {
    if (activeTab === 'images' && devices.length > 0 && enhancedDeviceData.size === 0) {
      fetchEnhancedDeviceData();
    }
  }, [activeTab, devices]);

  // Helper function to display next wake time
  const getNextWakeDisplay = (device: DeviceSessionData, enhancedData: any) => {
    if (enhancedData?.next_wake_at) {
      const nextWakeDate = new Date(enhancedData.next_wake_at);
      const now = new Date();

      // If next wake is in the past, show as overdue
      if (nextWakeDate < now) {
        return <span className="text-red-600">Overdue ({formatDistanceToNow(nextWakeDate, { addSuffix: true })})</span>;
      }

      return <span className="text-green-600">{formatDistanceToNow(nextWakeDate, { addSuffix: true })}</span>;
    }

    if (device.wake_schedule_cron) {
      if (enhancedData && !enhancedData.is_active) {
        return <span className="text-amber-600">Activate device to calculate</span>;
      }

      // Simple cron parser for common patterns
      const parts = device.wake_schedule_cron.split(' ');
      if (parts.length === 5) {
        const hours = parts[1];
        if (hours === '*/3') return <span className="text-gray-600">Every 3 hours (pending first wake)</span>;
        if (hours === '*/6') return <span className="text-gray-600">Every 6 hours (pending first wake)</span>;
        if (hours === '*/12') return <span className="text-gray-600">Every 12 hours (pending first wake)</span>;
        if (hours.includes(',')) {
          return <span className="text-gray-600">{hours.split(',').length} times daily (pending first wake)</span>;
        }
      }
      return <span className="text-gray-600">Pending first wake</span>;
    }

    return <span className="text-gray-500">Not scheduled</span>;
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

  // Process session snapshots with LOCF (Last Observation Carried Forward)
  const processedSnapshots = useMemo(() => {
    if (sessionSnapshots.length === 0) return [];

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
      return tel && (tel.temperature !== null || tel.humidity !== null);
    };

    const hasValidMGI = (mgi: any) => {
      return mgi && (mgi.current_mgi !== null || mgi.mgi_velocity?.per_hour !== null);
    };

    // Process session snapshots (already sorted by wake_round_start)
    for (let i = 0; i < sessionSnapshots.length; i++) {
      const snapshot = sessionSnapshots[i];

      try {
        const siteState = typeof snapshot.site_state === 'string'
          ? JSON.parse(snapshot.site_state)
          : snapshot.site_state;

        // Handle both array format (direct device array) and object format (with devices property)
        const currentDevices = Array.isArray(siteState) ? siteState : (siteState?.devices || []);

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
            latest_temperature: carryForward(device.telemetry.temperature, cachedState.telemetry?.latest_temperature),
            latest_humidity: carryForward(device.telemetry.humidity, cachedState.telemetry?.latest_humidity),
            latest_pressure: carryForward(device.telemetry.pressure, cachedState.telemetry?.latest_pressure),
          } : cachedState.telemetry || {};
          const newMGI = hasValidMGI(device.mgi_state) ? {
            latest_mgi_score: carryForward(device.mgi_state.current_mgi, cachedState.mgi_state?.latest_mgi_score),
            mgi_velocity: carryForward(device.mgi_state.mgi_velocity?.per_hour, cachedState.mgi_state?.mgi_velocity),
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

        log.debug(`Snapshot #${snapshot.wake_number}: ${currentDevices.length} raw -> ${completeDevices.length} with LOCF`);

        processed.push({
          ...snapshot,
          site_state: {
            ...siteState,
            devices: completeDevices, // All cached devices
          },
        });
      } catch (error) {
        log.error('Error processing snapshot:', error);
        processed.push(snapshot);
      }
    }

    log.debug(`Processed ${processed.length} snapshots for session ${sessionId} with LOCF`);
    return processed;
  }, [sessionSnapshots, sessionId]);

  // Transform snapshot data with smooth transitions
  const displayDevices = useMemo(() => {
    if (processedSnapshots.length === 0) {
      log.debug('No processed snapshots available');
      return [];
    }

    const currentSnapshot = processedSnapshots[currentSnapshotIndex];
    if (!currentSnapshot || !currentSnapshot.site_state) {
      log.debug('Current snapshot has no site_state');
      return [];
    }

    try {
      const currentState = typeof currentSnapshot.site_state === 'string'
        ? JSON.parse(currentSnapshot.site_state)
        : currentSnapshot.site_state;

      const currentDevices = currentState.devices || [];
      log.debug(`Current snapshot has ${currentDevices.length} devices`);

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

      const devicesWithPositions = currentDevices.filter((d: any) => d.position && d.position.x !== null && d.position.y !== null);
      log.debug(`${devicesWithPositions.length} devices have valid positions (out of ${currentDevices.length})`);

      const transformedDevices = devicesWithPositions.map((d: any) => {
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

      log.debug(`Returning ${transformedDevices.length} display devices`);
      return transformedDevices;
    } catch (error) {
      log.error('Error parsing snapshot data:', error);
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

  const openLightbox = (image: any, allImages: any[], device: DeviceSessionData) => {
    const imageIndex = allImages.findIndex((img: any) => img.image_id === image.image_id);
    setLightboxState({
      isOpen: true,
      images: allImages,
      currentIndex: Math.max(0, imageIndex),
      deviceInfo: {
        device_code: device.device_code,
        device_name: device.device_name
      }
    });
  };

  const closeLightbox = () => {
    setLightboxState(null);
  };

  // Handle session expiration checking with countdown
  useEffect(() => {
    const checkSessionExpiration = () => {
      if (!session?.session_end_time) return;

      // Check if session is locked
      if (session.status === 'locked') {
        setIsSessionExpired(true);
        setIsSessionExpiring(false);
        setTimeRemaining('Session locked');
        return;
      }

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
  // Use processedSnapshots which has LOCF applied and matches what the map displays
  const environmentalAggregates = useMemo(() => {
    if (!processedSnapshots || processedSnapshots.length === 0) return null;

    const allTemps: number[] = [];
    const allHumidity: number[] = [];
    const allBattery: number[] = [];
    const allMGI: number[] = [];

    // Collect data from all devices in all processed snapshots (same data the map uses)
    processedSnapshots.forEach(snapshot => {
      try {
        const siteState = typeof snapshot.site_state === 'string'
          ? JSON.parse(snapshot.site_state)
          : snapshot.site_state;

        const devices = siteState?.devices || [];

        devices.forEach((device: any) => {
          // Use the same nested structure as displayDevices
          const temp = device.telemetry?.latest_temperature;
          const humidity = device.telemetry?.latest_humidity;
          const mgiScore = device.mgi_state?.latest_mgi_score;
          const batteryHealth = device.battery_health_percent;

          if (temp != null) allTemps.push(temp);
          if (humidity != null) allHumidity.push(humidity);
          if (batteryHealth != null) allBattery.push(batteryHealth);
          if (mgiScore != null) allMGI.push(mgiScore);
        });
      } catch (error) {
        log.error('Error processing snapshot for aggregates:', error);
      }
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
  }, [processedSnapshots]);

  // Calculate alert statistics
  const alertStats = useMemo(() => {
    const total = sessionAlerts.length;
    const critical = sessionAlerts.filter(a => a.severity === 'critical').length;
    const error = sessionAlerts.filter(a => a.severity === 'error').length;
    const warning = sessionAlerts.filter(a => a.severity === 'warning').length;
    const info = sessionAlerts.filter(a => a.severity === 'info').length;

    // Group by category
    const byCategory: Record<string, number> = {};
    sessionAlerts.forEach(alert => {
      const cat = alert.alert_category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    // Group by device
    const byDevice: Record<string, number> = {};
    sessionAlerts.forEach(alert => {
      const deviceId = alert.device_id;
      byDevice[deviceId] = (byDevice[deviceId] || 0) + 1;
    });

    // Find device with most alerts
    const deviceAlertCounts = Object.entries(byDevice).sort((a, b) => b[1] - a[1]);

    return {
      total,
      critical,
      error,
      warning,
      info,
      byCategory,
      deviceAlertCounts,
      topAlertDevice: deviceAlertCounts[0],
    };
  }, [sessionAlerts]);

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

  // Calculate environmental velocity metrics (rate of change between snapshots)
  const velocityMetrics = useMemo(() => {
    if (processedSnapshots.length < 2) return null;

    const tempVelocities: number[] = [];
    const humidityVelocities: number[] = [];
    const batteryVelocities: number[] = [];

    for (let i = 0; i < processedSnapshots.length - 1; i++) {
      const current = processedSnapshots[i];
      const next = processedSnapshots[i + 1];

      // Calculate time diff in hours
      const timeDiff = (new Date(next.wake_round_start).getTime() - new Date(current.wake_round_start).getTime()) / (1000 * 60 * 60);
      if (timeDiff === 0) continue;

      try {
        const currentState = typeof current.site_state === 'string' ? JSON.parse(current.site_state) : current.site_state;
        const nextState = typeof next.site_state === 'string' ? JSON.parse(next.site_state) : next.site_state;

        const currentDevices = currentState?.devices || [];
        const nextDevices = nextState?.devices || [];

        // Match devices between snapshots
        currentDevices.forEach((currDev: any) => {
          const nextDev = nextDevices.find((d: any) => d.device_id === currDev.device_id);
          if (!nextDev) return;

          // Temperature velocity
          const currTemp = currDev.telemetry?.latest_temperature;
          const nextTemp = nextDev.telemetry?.latest_temperature;
          if (currTemp != null && nextTemp != null) {
            tempVelocities.push((nextTemp - currTemp) / timeDiff);
          }

          // Humidity velocity
          const currHum = currDev.telemetry?.latest_humidity;
          const nextHum = nextDev.telemetry?.latest_humidity;
          if (currHum != null && nextHum != null) {
            humidityVelocities.push((nextHum - currHum) / timeDiff);
          }

          // Battery velocity
          const currBatt = currDev.battery_health_percent;
          const nextBatt = nextDev.battery_health_percent;
          if (currBatt != null && nextBatt != null) {
            batteryVelocities.push((nextBatt - currBatt) / timeDiff);
          }
        });
      } catch (error) {
        log.error('Error calculating velocities:', error);
      }
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      temperature: {
        avg: avg(tempVelocities),
        max: tempVelocities.length ? Math.max(...tempVelocities) : null,
        min: tempVelocities.length ? Math.min(...tempVelocities) : null,
        samples: tempVelocities.length,
      },
      humidity: {
        avg: avg(humidityVelocities),
        max: humidityVelocities.length ? Math.max(...humidityVelocities) : null,
        min: humidityVelocities.length ? Math.min(...humidityVelocities) : null,
        samples: humidityVelocities.length,
      },
      battery: {
        avg: avg(batteryVelocities),
        max: batteryVelocities.length ? Math.max(...batteryVelocities) : null,
        min: batteryVelocities.length ? Math.min(...batteryVelocities) : null,
        samples: batteryVelocities.length,
      },
    };
  }, [processedSnapshots]);

  // Calculate snapshot deltas (significant changes between snapshots)
  const snapshotDeltas = useMemo(() => {
    if (processedSnapshots.length < 2) return [];

    const deltas: any[] = [];

    for (let i = 0; i < processedSnapshots.length - 1; i++) {
      const current = processedSnapshots[i];
      const next = processedSnapshots[i + 1];

      try {
        const currentState = typeof current.site_state === 'string' ? JSON.parse(current.site_state) : current.site_state;
        const nextState = typeof next.site_state === 'string' ? JSON.parse(next.site_state) : next.site_state;

        const currentDevices = currentState?.devices || [];
        const nextDevices = nextState?.devices || [];

        // Check for significant changes
        currentDevices.forEach((currDev: any) => {
          const nextDev = nextDevices.find((d: any) => d.device_id === currDev.device_id);

          if (!nextDev) {
            // Device went offline
            deltas.push({
              wakeFrom: current.wake_number,
              wakeTo: next.wake_number,
              type: 'device_offline',
              deviceId: currDev.device_id,
              deviceCode: currDev.device_code,
              message: `Device ${currDev.device_code} went offline`,
              severity: 'error',
            });
            return;
          }

          // Temperature jump (>5°F)
          const currTemp = currDev.telemetry?.latest_temperature;
          const nextTemp = nextDev.telemetry?.latest_temperature;
          if (currTemp != null && nextTemp != null && Math.abs(nextTemp - currTemp) > 5) {
            deltas.push({
              wakeFrom: current.wake_number,
              wakeTo: next.wake_number,
              type: 'temperature_jump',
              deviceId: currDev.device_id,
              deviceCode: currDev.device_code,
              message: `Temperature ${nextTemp > currTemp ? 'increased' : 'decreased'} by ${Math.abs(nextTemp - currTemp).toFixed(1)}°F at ${currDev.device_code}`,
              severity: Math.abs(nextTemp - currTemp) > 10 ? 'warning' : 'info',
              value: nextTemp - currTemp,
            });
          }

          // Humidity jump (>10%)
          const currHum = currDev.telemetry?.latest_humidity;
          const nextHum = nextDev.telemetry?.latest_humidity;
          if (currHum != null && nextHum != null && Math.abs(nextHum - currHum) > 10) {
            deltas.push({
              wakeFrom: current.wake_number,
              wakeTo: next.wake_number,
              type: 'humidity_jump',
              deviceId: currDev.device_id,
              deviceCode: currDev.device_code,
              message: `Humidity ${nextHum > currHum ? 'increased' : 'decreased'} by ${Math.abs(nextHum - currHum).toFixed(1)}% at ${currDev.device_code}`,
              severity: Math.abs(nextHum - currHum) > 20 ? 'warning' : 'info',
              value: nextHum - currHum,
            });
          }

          // MGI change (>10 points)
          const currMGI = currDev.mgi_state?.latest_mgi_score;
          const nextMGI = nextDev.mgi_state?.latest_mgi_score;
          if (currMGI != null && nextMGI != null && Math.abs(nextMGI - currMGI) > 10) {
            deltas.push({
              wakeFrom: current.wake_number,
              wakeTo: next.wake_number,
              type: 'mgi_change',
              deviceId: currDev.device_id,
              deviceCode: currDev.device_code,
              message: `MGI ${nextMGI > currMGI ? 'increased' : 'decreased'} by ${Math.abs(nextMGI - currMGI).toFixed(1)} at ${currDev.device_code}`,
              severity: nextMGI > currMGI ? 'warning' : 'info',
              value: nextMGI - currMGI,
            });
          }

          // Battery drop (>5%)
          const currBatt = currDev.battery_health_percent;
          const nextBatt = nextDev.battery_health_percent;
          if (currBatt != null && nextBatt != null && (currBatt - nextBatt) > 5) {
            deltas.push({
              wakeFrom: current.wake_number,
              wakeTo: next.wake_number,
              type: 'battery_drop',
              deviceId: currDev.device_id,
              deviceCode: currDev.device_code,
              message: `Battery dropped ${(currBatt - nextBatt).toFixed(1)}% at ${currDev.device_code}`,
              severity: (currBatt - nextBatt) > 10 ? 'warning' : 'info',
              value: currBatt - nextBatt,
            });
          }
        });

        // Check for new devices that came online
        nextDevices.forEach((nextDev: any) => {
          const currDev = currentDevices.find((d: any) => d.device_id === nextDev.device_id);
          if (!currDev) {
            deltas.push({
              wakeFrom: current.wake_number,
              wakeTo: next.wake_number,
              type: 'device_online',
              deviceId: nextDev.device_id,
              deviceCode: nextDev.device_code,
              message: `Device ${nextDev.device_code} came online`,
              severity: 'info',
            });
          }
        });
      } catch (error) {
        log.error('Error calculating deltas:', error);
      }
    }

    return deltas.sort((a, b) => a.wakeFrom - b.wakeFrom);
  }, [processedSnapshots]);

  // Calculate outlier detection using z-scores
  const outlierDetection = useMemo(() => {
    if (!environmentalAggregates) return null;

    const outliers: any[] = [];

    // Calculate z-scores for each device reading in each snapshot
    processedSnapshots.forEach(snapshot => {
      try {
        const siteState = typeof snapshot.site_state === 'string' ? JSON.parse(snapshot.site_state) : snapshot.site_state;
        const devices = siteState?.devices || [];

        devices.forEach((device: any) => {
          // Temperature outliers
          const temp = device.telemetry?.latest_temperature;
          if (temp != null && environmentalAggregates.temperature.avg != null && environmentalAggregates.temperature.stdDev != null) {
            const zScore = (temp - environmentalAggregates.temperature.avg) / environmentalAggregates.temperature.stdDev;
            if (Math.abs(zScore) > 2) {
              outliers.push({
                wakeNumber: snapshot.wake_number,
                deviceId: device.device_id,
                deviceCode: device.device_code,
                metric: 'temperature',
                value: temp,
                zScore: zScore,
                severity: Math.abs(zScore) > 3 ? 'extreme' : 'moderate',
                message: `Temperature ${temp.toFixed(1)}°F is ${Math.abs(zScore).toFixed(1)}σ from mean at ${device.device_code}`,
              });
            }
          }

          // Humidity outliers
          const humidity = device.telemetry?.latest_humidity;
          if (humidity != null && environmentalAggregates.humidity.avg != null && environmentalAggregates.humidity.stdDev != null) {
            const zScore = (humidity - environmentalAggregates.humidity.avg) / environmentalAggregates.humidity.stdDev;
            if (Math.abs(zScore) > 2) {
              outliers.push({
                wakeNumber: snapshot.wake_number,
                deviceId: device.device_id,
                deviceCode: device.device_code,
                metric: 'humidity',
                value: humidity,
                zScore: zScore,
                severity: Math.abs(zScore) > 3 ? 'extreme' : 'moderate',
                message: `Humidity ${humidity.toFixed(1)}% is ${Math.abs(zScore).toFixed(1)}σ from mean at ${device.device_code}`,
              });
            }
          }

          // MGI outliers
          const mgiScore = device.mgi_state?.latest_mgi_score;
          if (mgiScore != null && environmentalAggregates.mgi.avg != null && environmentalAggregates.mgi.stdDev != null) {
            const zScore = (mgiScore - environmentalAggregates.mgi.avg) / environmentalAggregates.mgi.stdDev;
            if (Math.abs(zScore) > 2) {
              outliers.push({
                wakeNumber: snapshot.wake_number,
                deviceId: device.device_id,
                deviceCode: device.device_code,
                metric: 'mgi',
                value: mgiScore,
                zScore: zScore,
                severity: Math.abs(zScore) > 3 ? 'extreme' : 'moderate',
                message: `MGI score ${formatMGI(mgiScore)} is ${Math.abs(zScore).toFixed(1)}σ from mean at ${device.device_code}`,
              });
            }
          }
        });
      } catch (error) {
        log.error('Error detecting outliers:', error);
      }
    });

    // Group outliers by device
    const byDevice: Record<string, number> = {};
    outliers.forEach(outlier => {
      byDevice[outlier.deviceCode] = (byDevice[outlier.deviceCode] || 0) + 1;
    });

    // Group by metric
    const byMetric: Record<string, number> = {};
    outliers.forEach(outlier => {
      byMetric[outlier.metric] = (byMetric[outlier.metric] || 0) + 1;
    });

    return {
      outliers: outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)),
      byDevice,
      byMetric,
      extremeCount: outliers.filter(o => o.severity === 'extreme').length,
      moderateCount: outliers.filter(o => o.severity === 'moderate').length,
    };
  }, [processedSnapshots, environmentalAggregates]);

  // Prepare time series data for D3 charts
  const timeSeriesData = useMemo(() => {
    if (!processedSnapshots || processedSnapshots.length === 0) return null;

    const temperatureData: Array<{ timestamp: Date; value: number | null; deviceCode?: string }> = [];
    const humidityData: Array<{ timestamp: Date; value: number | null; deviceCode?: string }> = [];
    const batteryData: Array<{ timestamp: Date; value: number | null; deviceCode?: string }> = [];
    const mgiData: Array<{ timestamp: Date; value: number | null; deviceCode?: string }> = [];

    processedSnapshots.forEach(snapshot => {
      try {
        const siteState = typeof snapshot.site_state === 'string'
          ? JSON.parse(snapshot.site_state)
          : snapshot.site_state;
        const devices = siteState?.devices || [];
        const timestamp = new Date(snapshot.wake_round_start);

        devices.forEach((device: any) => {
          const temp = device.telemetry?.latest_temperature;
          const humidity = device.telemetry?.latest_humidity;
          const battery = device.battery_health_percent;
          const mgi = device.mgi_state?.latest_mgi_score;

          if (temp !== null && temp !== undefined) {
            temperatureData.push({ timestamp, value: temp, deviceCode: device.device_code });
          }
          if (humidity !== null && humidity !== undefined) {
            humidityData.push({ timestamp, value: humidity, deviceCode: device.device_code });
          }
          if (battery !== null && battery !== undefined) {
            batteryData.push({ timestamp, value: battery, deviceCode: device.device_code });
          }
          if (mgi !== null && mgi !== undefined) {
            mgiData.push({ timestamp, value: mgi, deviceCode: device.device_code });
          }
        });
      } catch (error) {
        log.error('Error processing snapshot for time series:', error);
      }
    });

    return {
      temperature: temperatureData,
      humidity: humidityData,
      battery: batteryData,
      mgi: mgiData,
    };
  }, [processedSnapshots]);

  // Build stable device color map
  const deviceColorMap = useMemo(() => {
    if (!timeSeriesData) return {};

    // Curated palette of well-separated, readable colors
    const palette = [
      '#2563eb', // blue
      '#059669', // green
      '#d97706', // amber
      '#dc2626', // red
      '#0891b2', // teal
      '#7c3aed', // violet
      '#e11d48', // rose
      '#65a30d', // lime
    ];

    // Extract all unique device codes across all metrics
    const allCodes = new Set<string>();
    [
      timeSeriesData.temperature,
      timeSeriesData.humidity,
      timeSeriesData.battery,
      timeSeriesData.mgi,
    ]
      .flat()
      .forEach(d => {
        if (d.deviceCode) allCodes.add(d.deviceCode);
      });

    // Sort device codes alphabetically for deterministic assignment
    const sortedCodes = Array.from(allCodes).sort();

    // Build the color map
    const map: Record<string, string> = {};
    sortedCodes.forEach((code, i) => {
      map[code] = palette[i % palette.length];
    });

    return map;
  }, [timeSeriesData]);

  // Prepare histogram data (all values as flat arrays)
  const histogramData = useMemo(() => {
    if (!timeSeriesData) return null;

    return {
      temperature: timeSeriesData.temperature.map(d => d.value).filter(v => v !== null) as number[],
      humidity: timeSeriesData.humidity.map(d => d.value).filter(v => v !== null) as number[],
      battery: timeSeriesData.battery.map(d => d.value).filter(v => v !== null) as number[],
      mgi: timeSeriesData.mgi.map(d => d.value).filter(v => v !== null) as number[],
    };
  }, [timeSeriesData]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return (
      <div className="text-center py-8">
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

  const getDisplayStatus = () => {
    if (session?.status === 'locked') return 'locked';
    if (session?.status === 'in_progress' && isSessionExpired) return 'ended';
    return session?.status || 'unknown';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ended':
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
              {session.site_name} - {format(parseDateOnly(session.session_date), 'MMMM dd, yyyy')}
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

      {/* Tab Navigation */}
      <Card className="animate-fade-in">
        <CardContent className="pt-4">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('overview')}
                className={`${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200`}
              >
                <MapIcon className="inline w-5 h-5 mr-2" />
                Overview & Map
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`${
                  activeTab === 'analytics'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200`}
              >
                <Activity className="inline w-5 h-5 mr-2" />
                Analytics & Insights
              </button>
              <button
                onClick={() => setActiveTab('images')}
                className={`${
                  activeTab === 'images'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200`}
              >
                <ImageIcon className="inline w-5 h-5 mr-2" />
                Images & MGI Scores
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                  {totalImages}
                </span>
              </button>
            </nav>
          </div>
        </CardContent>
      </Card>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
      {/* Site Map with Timeline - MOVED TO TOP */}
      {siteData && siteData.length > 0 && siteData.width > 0 && (processedSnapshots.length > 0 && displayDevices.length > 0 ? (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-semibold">Session Timeline & Site Map</h2>
                <span className="text-sm text-gray-600">
                  {siteData.name} • {siteData.length}ft x {siteData.width}ft
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
              <TimelineController
                totalWakes={processedSnapshots.length}
                currentWake={currentSnapshotIndex + 1}
                onWakeChange={(wakeNum) => {
                  setCurrentSnapshotIndex(Math.max(0, Math.min(processedSnapshots.length - 1, wakeNum - 1)));
                }}
                wakeTimestamps={processedSnapshots.map(s => s.wake_round_start)}
                autoPlaySpeed={2000}
                isLive={isLiveMode}
                onExitLive={() => {
                  setIsLiveMode(false);
                  setCurrentSnapshotIndex(0);
                }}
                onReturnToLive={() => {
                  setIsLiveMode(true);
                }}
                canGoLive={!!isSessionActive && !isLiveMode}
              />

              <SiteMapAnalyticsViewer
                siteLength={siteData.length}
                siteWidth={siteData.width}
                siteName={siteData.name}
                devices={displayDevices}
                showControls={false}
                height={500}
                zoneMode={zoneMode}
                onDeviceClick={(deviceId) => navigate(`/devices/${deviceId}`)}
              />

              {zoneMode !== 'none' && displayDevices.length >= 2 && (
                <ZoneAnalytics devices={displayDevices} zoneMode={zoneMode} />
              )}
            </div>
          </CardContent>
        </Card>
      ) : isSessionActive && processedSnapshots.length === 0 ? (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold">Session Timeline & Site Map</h2>
              <span className="text-sm text-gray-600">
                {siteData.name} • {siteData.length}ft x {siteData.width}ft
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative mb-4">
                <span className="relative flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500" />
                </span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Awaiting First Wake Data</h3>
              <p className="text-sm text-gray-500 max-w-md">
                This session is active but no wake data has been received yet. The map will populate
                automatically as devices report in. Last known telemetry and MGI data will carry forward.
              </p>
              <p className="text-xs text-gray-400 mt-3">
                Checking for new data every 60 seconds
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null)}

      {/* Missing Site Dimensions Warning */}
      {siteData && (!siteData.length || !siteData.width) && processedSnapshots.length > 0 && (
        <Card className="animate-fade-in border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 mb-1">Site Map Unavailable</h3>
                <p className="text-sm text-yellow-800 mb-3">
                  The site map and timeline visualization cannot be displayed because site dimensions are missing (length: {siteData.length || 'not set'}, width: {siteData.width || 'not set'}).
                </p>
                <button
                  onClick={() => navigate(`/programs/${programId}/sites`)}
                  className="text-sm font-medium text-yellow-900 hover:text-yellow-700 underline"
                >
                  Go to Sites page to add dimensions
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Device Position Data Warning */}
      {siteData && siteData.length > 0 && siteData.width > 0 && processedSnapshots.length > 0 && displayDevices.length === 0 && (
        <Card className="animate-fade-in border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 mb-1">No Device Position Data</h3>
                <p className="text-sm text-yellow-800 mb-3">
                  The site map cannot be displayed because no devices have position data for this session. Devices must be placed on the site map to enable visualization.
                </p>
                <p className="text-xs text-yellow-700">
                  Session has {processedSnapshots.length} snapshot(s), but no devices with valid x/y coordinates.
                </p>
              </div>
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
                <p className={`text-2xl font-bold mt-1 px-3 py-1 rounded-full border inline-block ${getStatusColor(getDisplayStatus())}`}>
                  {getDisplayStatus().toUpperCase().replace('_', ' ')}
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
                    {formatMGI(environmentalAggregates.mgi.avg)}
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
                      {formatMGI(environmentalAggregates.mgi.max)}
                    </p>
                  </div>

                  <div className="bg-green-50 rounded p-3 text-center">
                    <div className="flex items-center justify-center mb-1">
                      <TrendingDown className="w-4 h-4 mr-1 text-green-500" />
                      <p className="text-xs text-gray-600">Minimum</p>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatMGI(environmentalAggregates.mgi.min)}
                    </p>
                  </div>
                </div>

                {environmentalAggregates.mgi.stdDev && (
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-600 text-center">Standard Deviation</p>
                    <p className="text-lg font-bold text-gray-700 text-center mt-1">
                      ±{(environmentalAggregates.mgi.stdDev * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 text-center mt-1">Variability across session</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Session Alerts Analytics */}
      <Card className="animate-fade-in" style={{ animationDelay: '0.6s' }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-md font-semibold flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
              Alerts Generated This Session
            </h3>
            {alertsLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
            </div>
          ) : alertStats.total === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600">No alerts generated during this session</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Alert Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-gray-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{alertStats.total}</p>
                  <p className="text-xs text-gray-600">Total Alerts</p>
                </div>
                <div className="bg-red-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{alertStats.critical}</p>
                  <p className="text-xs text-gray-600">Critical</p>
                </div>
                <div className="bg-orange-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{alertStats.error}</p>
                  <p className="text-xs text-gray-600">Error</p>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{alertStats.warning}</p>
                  <p className="text-xs text-gray-600">Warning</p>
                </div>
                <div className="bg-blue-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{alertStats.info}</p>
                  <p className="text-xs text-gray-600">Info</p>
                </div>
              </div>

              {/* Alerts by Category */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Alerts by Category</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(alertStats.byCategory).map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                      <span className="text-sm text-gray-700 capitalize">{category.replace('_', ' ')}</span>
                      <span className="text-sm font-bold text-gray-900">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Alert Device */}
              {alertStats.topAlertDevice && (
                <div className="bg-orange-50 border border-orange-200 rounded p-3">
                  <p className="text-xs text-orange-700 font-medium mb-1">Device with Most Alerts</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-orange-900">
                      Device {devices.find(d => d.device_id === alertStats.topAlertDevice[0])?.device_code || alertStats.topAlertDevice[0]}
                    </span>
                    <span className="text-lg font-bold text-orange-600">{alertStats.topAlertDevice[1]} alerts</span>
                  </div>
                </div>
              )}

              {/* Recent Alerts List */}
              <details className="border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  View All Alerts ({alertStats.total})
                </summary>
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {sessionAlerts.slice(0, 10).map((alert) => (
                    <div key={alert.alert_id} className="text-xs bg-gray-50 rounded p-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                            alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            alert.severity === 'error' ? 'bg-orange-100 text-orange-800' :
                            alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {alert.severity}
                          </span>
                          <span className="text-gray-900">{alert.message}</span>
                        </div>
                        <span className="text-gray-500 text-xs whitespace-nowrap ml-2">
                          {format(new Date(alert.triggered_at), 'HH:mm')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Environmental Velocity Metrics */}
      {velocityMetrics && (
        <Card className="animate-fade-in" style={{ animationDelay: '0.7s' }}>
          <CardHeader>
            <h3 className="text-md font-semibold flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-500" />
              Environmental Velocity (Rate of Change)
            </h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Temperature Velocity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <Thermometer className="w-4 h-4 mr-1 text-orange-500" />
                    Temperature Velocity
                  </span>
                  <span className="text-xs text-gray-500">{velocityMetrics.temperature.samples} samples</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between bg-blue-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Average</span>
                    <span className={`text-sm font-bold ${Math.abs(velocityMetrics.temperature.avg || 0) > 2 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {velocityMetrics.temperature.avg?.toFixed(2) || 0}°F/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-red-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Max Increase</span>
                    <span className="text-sm font-bold text-red-600">
                      +{velocityMetrics.temperature.max?.toFixed(2) || 0}°F/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-cyan-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Max Decrease</span>
                    <span className="text-sm font-bold text-cyan-600">
                      {velocityMetrics.temperature.min?.toFixed(2) || 0}°F/hr
                    </span>
                  </div>
                </div>
              </div>

              {/* Humidity Velocity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <Droplets className="w-4 h-4 mr-1 text-blue-400" />
                    Humidity Velocity
                  </span>
                  <span className="text-xs text-gray-500">{velocityMetrics.humidity.samples} samples</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between bg-blue-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Average</span>
                    <span className={`text-sm font-bold ${Math.abs(velocityMetrics.humidity.avg || 0) > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {velocityMetrics.humidity.avg?.toFixed(2) || 0}%/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-indigo-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Max Increase</span>
                    <span className="text-sm font-bold text-indigo-600">
                      +{velocityMetrics.humidity.max?.toFixed(2) || 0}%/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-sky-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Max Decrease</span>
                    <span className="text-sm font-bold text-sky-600">
                      {velocityMetrics.humidity.min?.toFixed(2) || 0}%/hr
                    </span>
                  </div>
                </div>
              </div>

              {/* Battery Velocity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <Battery className="w-4 h-4 mr-1 text-green-500" />
                    Battery Drain Rate
                  </span>
                  <span className="text-xs text-gray-500">{velocityMetrics.battery.samples} samples</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between bg-green-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Average</span>
                    <span className={`text-sm font-bold ${Math.abs(velocityMetrics.battery.avg || 0) > 1 ? 'text-red-600' : 'text-green-600'}`}>
                      {velocityMetrics.battery.avg?.toFixed(2) || 0}%/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-emerald-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Best (slowest drain)</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {velocityMetrics.battery.max?.toFixed(2) || 0}%/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-red-50 rounded px-2 py-1">
                    <span className="text-xs text-gray-600">Worst (fastest drain)</span>
                    <span className="text-sm font-bold text-red-600">
                      {velocityMetrics.battery.min?.toFixed(2) || 0}%/hr
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-gray-700">
              <strong>Note:</strong> Velocity shows rate of change per hour. Green indicates stable conditions, yellow indicates moderate change, red indicates rapid change requiring attention.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snapshot Delta Analysis */}
      {snapshotDeltas.length > 0 && (
        <Card className="animate-fade-in" style={{ animationDelay: '0.8s' }}>
          <CardHeader>
            <h3 className="text-md font-semibold flex items-center">
              <Activity className="w-5 h-5 mr-2 text-teal-500" />
              Snapshot Delta Timeline ({snapshotDeltas.length} significant changes)
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {snapshotDeltas.map((delta, idx) => (
                <div key={idx} className={`flex items-start space-x-3 p-2 rounded border-l-4 ${
                  delta.severity === 'error' ? 'border-red-500 bg-red-50' :
                  delta.severity === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                  'border-blue-500 bg-blue-50'
                }`}>
                  <div className="flex-shrink-0 mt-0.5">
                    {delta.type === 'device_offline' || delta.type === 'device_online' ? (
                      delta.type === 'device_offline' ? <WifiOff className="w-4 h-4 text-red-600" /> : <Wifi className="w-4 h-4 text-green-600" />
                    ) : delta.type === 'temperature_jump' ? (
                      <Thermometer className="w-4 h-4 text-orange-600" />
                    ) : delta.type === 'humidity_jump' ? (
                      <Droplets className="w-4 h-4 text-blue-600" />
                    ) : delta.type === 'mgi_change' ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    ) : (
                      <Battery className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{delta.message}</span>
                      <span className="text-xs text-gray-500">Wake {delta.wakeFrom} → {delta.wakeTo}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outlier Variance Detection */}
      {outlierDetection && outlierDetection.outliers.length > 0 && (
        <Card className="animate-fade-in" style={{ animationDelay: '0.9s' }}>
          <CardHeader>
            <h3 className="text-md font-semibold flex items-center">
              <AlertOctagon className="w-5 h-5 mr-2 text-orange-500" />
              Outlier Variance Detection
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Outlier Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{outlierDetection.outliers.length}</p>
                  <p className="text-xs text-gray-600">Total Outliers</p>
                </div>
                <div className="bg-red-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{outlierDetection.extremeCount}</p>
                  <p className="text-xs text-gray-600">Extreme (3σ)</p>
                </div>
                <div className="bg-orange-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{outlierDetection.moderateCount}</p>
                  <p className="text-xs text-gray-600">Moderate (2σ)</p>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{Object.keys(outlierDetection.byDevice).length}</p>
                  <p className="text-xs text-gray-600">Devices Affected</p>
                </div>
              </div>

              {/* Outliers by Metric */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Outliers by Metric</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(outlierDetection.byMetric).map(([metric, count]) => (
                    <div key={metric} className="bg-gray-100 rounded px-3 py-1">
                      <span className="text-sm capitalize">{metric}: </span>
                      <span className="text-sm font-bold">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Outliers List */}
              <details className="border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  View Top Outliers (sorted by z-score)
                </summary>
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {outlierDetection.outliers.slice(0, 20).map((outlier, idx) => (
                    <div key={idx} className={`text-xs rounded p-2 ${
                      outlier.severity === 'extreme' ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                            outlier.severity === 'extreme' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            {outlier.severity === 'extreme' ? '3σ' : '2σ'}
                          </span>
                          <span className="text-gray-900">{outlier.message}</span>
                        </div>
                        <span className="text-gray-500 text-xs whitespace-nowrap ml-2">
                          Wake {outlier.wakeNumber}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              <div className="p-2 bg-blue-50 rounded text-xs text-gray-700">
                <strong>Outlier Detection:</strong> Values are flagged as outliers when they deviate significantly from the session mean.
                2σ (moderate) = 2 standard deviations, 3σ (extreme) = 3 standard deviations.
              </div>
            </div>
          </CardContent>
        </Card>
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
                  <span className="font-medium">{format(parseDateOnly(session.session_date), 'MMMM dd, yyyy')}</span>
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
            <div className="text-center py-8">
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
                      ? Math.min(100, Math.round((device.completed_wakes / device.expected_wakes_in_session) * 100))
                      : 0;

                    const tempReadings = device.wake_payloads?.filter((w: any) => w.temperature != null) || [];
                    const avgTemp = tempReadings.length > 0
                      ? tempReadings.reduce((sum: number, w: any) => sum + w.temperature, 0) / tempReadings.length
                      : null;

                    const humidityReadings = device.wake_payloads?.filter((w: any) => w.humidity != null) || [];
                    const avgHumidity = humidityReadings.length > 0
                      ? humidityReadings.reduce((sum: number, w: any) => sum + w.humidity, 0) / humidityReadings.length
                      : null;

                    return (
                      <tr
                        key={device.device_id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/devices/${device.device_id}`)}
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
                            isActive={device.is_active}
                            lastSeenAt={device.last_seen_at}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/devices/${device.device_id}`);
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
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-fade-in">
          {/* Time Series Analysis */}
          {timeSeriesData && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-blue-500" />
                  Time Series Analysis
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Environmental and device metrics over the entire session timeline
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Temperature Time Series */}
                  <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-lg">
                    <TimeSeriesChart
                      data={timeSeriesData.temperature}
                      title="Temperature Over Time"
                      yAxisLabel="Temperature (°F)"
                      unit="°F"
                      color="#f97316"
                      height={300}
                      showDeviceBreakdown={true}
                      deviceColorMap={deviceColorMap}
                      thresholds={[
                        { value: 85, label: 'High Alert', color: '#dc2626' },
                        { value: 65, label: 'Low Alert', color: '#2563eb' },
                      ]}
                    />
                  </div>

                  {/* Humidity Time Series */}
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-lg">
                    <TimeSeriesChart
                      data={timeSeriesData.humidity}
                      title="Humidity Over Time"
                      yAxisLabel="Humidity (%)"
                      unit="%"
                      color="#06b6d4"
                      height={300}
                      showDeviceBreakdown={true}
                      deviceColorMap={deviceColorMap}
                      thresholds={[
                        { value: 70, label: 'High Alert', color: '#dc2626' },
                      ]}
                    />
                  </div>

                  {/* Battery Time Series */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg">
                    <TimeSeriesChart
                      data={timeSeriesData.battery}
                      title="Battery Health Over Time"
                      yAxisLabel="Battery Level (%)"
                      unit="%"
                      color="#10b981"
                      height={300}
                      showDeviceBreakdown={true}
                      deviceColorMap={deviceColorMap}
                      thresholds={[
                        { value: 20, label: 'Critical', color: '#dc2626' },
                        { value: 50, label: 'Low', color: '#f59e0b' },
                      ]}
                    />
                  </div>

                  {/* MGI Time Series */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-lg">
                    <TimeSeriesChart
                      data={timeSeriesData.mgi}
                      title="MGI Score Over Time"
                      yAxisLabel="MGI Score"
                      unit=""
                      color="#a855f7"
                      height={300}
                      showDeviceBreakdown={true}
                      deviceColorMap={deviceColorMap}
                      thresholds={[
                        { value: 70, label: 'High Growth', color: '#dc2626' },
                      ]}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Distribution Analysis */}
          {histogramData && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-teal-500" />
                  Distribution Analysis
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Statistical distribution of metrics across all devices and time points
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Temperature Distribution */}
                  <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-4 rounded-lg">
                    <HistogramChart
                      data={histogramData.temperature}
                      title="Temperature Distribution"
                      xAxisLabel="Temperature (°F)"
                      unit="°F"
                      color="#f97316"
                      height={250}
                      bins={15}
                    />
                  </div>

                  {/* Humidity Distribution */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg">
                    <HistogramChart
                      data={histogramData.humidity}
                      title="Humidity Distribution"
                      xAxisLabel="Humidity (%)"
                      unit="%"
                      color="#3b82f6"
                      height={250}
                      bins={15}
                    />
                  </div>

                  {/* Battery Distribution */}
                  <div className="bg-gradient-to-br from-green-50 to-teal-50 p-4 rounded-lg">
                    <HistogramChart
                      data={histogramData.battery}
                      title="Battery Health Distribution"
                      xAxisLabel="Battery Level (%)"
                      unit="%"
                      color="#10b981"
                      height={250}
                      bins={15}
                    />
                  </div>

                  {/* MGI Distribution */}
                  <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-4 rounded-lg">
                    <HistogramChart
                      data={histogramData.mgi}
                      title="MGI Score Distribution"
                      xAxisLabel="MGI Score"
                      unit=""
                      color="#a855f7"
                      height={250}
                      bins={15}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Keep existing analytics sections in Analytics tab too */}
          {environmentalAggregates && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Environmental Aggregates */}
              <Card>
                <CardHeader>
                  <h3 className="text-md font-semibold flex items-center">
                    <Thermometer className="w-5 h-5 mr-2 text-orange-500" />
                    Environmental Summary Statistics
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

              {/* MGI Summary Statistics */}
              <Card>
                <CardHeader>
                  <h3 className="text-md font-semibold flex items-center">
                    <Camera className="w-5 h-5 mr-2 text-purple-500" />
                    MGI Summary Statistics
                  </h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center py-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg">
                      <p className="text-5xl font-bold text-purple-600">
                        {formatMGI(environmentalAggregates.mgi.avg)}
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
                          {formatMGI(environmentalAggregates.mgi.max)}
                        </p>
                      </div>

                      <div className="bg-green-50 rounded p-3 text-center">
                        <div className="flex items-center justify-center mb-1">
                          <TrendingDown className="w-4 h-4 mr-1 text-green-500" />
                          <p className="text-xs text-gray-600">Minimum</p>
                        </div>
                        <p className="text-2xl font-bold text-green-600">
                          {formatMGI(environmentalAggregates.mgi.min)}
                        </p>
                      </div>
                    </div>

                    {environmentalAggregates.mgi.stdDev && (
                      <div className="bg-gray-50 rounded p-3">
                        <p className="text-xs text-gray-600 text-center">Standard Deviation</p>
                        <p className="text-lg font-bold text-gray-700 text-center mt-1">
                          ±{(environmentalAggregates.mgi.stdDev * 100).toFixed(1)}%
                        </p>
                        <p className="text-xs text-gray-500 text-center mt-1">Variability across session</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Images Tab */}
      {activeTab === 'images' && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Session Images & MGI Scores</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {totalImages} images captured across {devices.length} devices
                  </p>
                </div>
                {isSuperAdmin && (
                  <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                    Super Admin: Edit Mode Available
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Image Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-purple-50 rounded p-4 text-center">
                  <p className="text-3xl font-bold text-purple-600">{totalImages}</p>
                  <p className="text-xs text-gray-600 mt-1">Total Images</p>
                </div>
                <div className="bg-green-50 rounded p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">
                    {devices.filter(d => (d.images?.length || 0) > 0).length}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Devices with Images</p>
                </div>
                <div className="bg-blue-50 rounded p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">
                    {devices.length > 0 ? (totalImages / devices.length).toFixed(1) : '0'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Avg Images/Device</p>
                </div>
                <div className="bg-orange-50 rounded p-4 text-center">
                  <p className="text-3xl font-bold text-orange-600">
                    {(() => {
                      const imagesWithMGI = devices.reduce((count, d) => {
                        return count + (d.images?.filter((img: any) => img.mgi_score != null).length || 0);
                      }, 0);
                      return imagesWithMGI;
                    })()}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Images with MGI Scores</p>
                </div>
              </div>

              {/* Images Grid by Device */}
              <div className="space-y-6">
                {devices.map(device => {
                  if (!device.images || device.images.length === 0) return null;

                  return (
                    <div key={device.device_id} className="border border-gray-200 rounded-lg p-4">
                      {/* Device Header */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b">
                        <div className="flex items-center space-x-3">
                          <Camera className="w-5 h-5 text-purple-500" />
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {device.device_name || device.device_code}
                            </h3>
                            <p className="text-xs text-gray-500">{device.device_code}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 text-sm">
                          <div className="flex items-center space-x-1">
                            <ImageIcon className="w-4 h-4 text-purple-500" />
                            <span className="font-medium">{device.images.length}</span>
                            <span className="text-gray-500">images</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Camera className="w-4 h-4 text-teal-500" />
                            <span className="font-medium">
                              {device.images.filter((img: any) => img.mgi_score != null).length}
                            </span>
                            <span className="text-gray-500">with MGI</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Overview */}
                      <div className="mb-4 bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Status Overview</h4>

                        {enhancedDeviceDataLoading ? (
                          <div className="text-sm text-gray-500">Loading status...</div>
                        ) : (
                          (() => {
                            const enhancedData = enhancedDeviceData.get(device.device_id);

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Last Seen */}
                                <div>
                                  <p className="text-sm text-gray-500 mb-1">Last Seen</p>
                                  <p className="font-medium text-gray-900">
                                    {device.last_seen_at
                                      ? formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })
                                      : 'Never'}
                                  </p>
                                </div>

                                {/* Provisioning Status */}
                                <div>
                                  <p className="text-sm text-gray-500 mb-1">Provisioning Status</p>
                                  <p className="font-medium text-gray-900 capitalize">
                                    {enhancedData?.provisioning_status?.replace('_', ' ') || 'Unknown'}
                                  </p>
                                </div>

                                {/* Next Wake */}
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-gray-400" />
                                      <p className="text-sm text-gray-500">Next Wake</p>
                                    </div>
                                    {isAdmin && (
                                      <button
                                        onClick={() => setManualWakeModalState({
                                          isOpen: true,
                                          deviceId: device.device_id,
                                          deviceCode: device.device_code
                                        })}
                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                        title="Schedule a one-time manual wake"
                                      >
                                        <Zap className="h-3 w-3" />
                                        Manual Wake
                                      </button>
                                    )}
                                  </div>
                                  <p className="font-medium text-gray-900">
                                    {getNextWakeDisplay(device, enhancedData)}
                                  </p>
                                  {enhancedData?.next_wake_at && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {new Date(enhancedData.next_wake_at).toLocaleString()}
                                    </p>
                                  )}
                                  {enhancedData?.manual_wake_override && (
                                    <p className="text-xs text-orange-600 mt-1 font-medium flex items-center gap-1">
                                      <Zap className="h-3 w-3" />
                                      Manual wake scheduled
                                    </p>
                                  )}
                                </div>

                                {/* Wake Schedule */}
                                <div>
                                  <p className="text-sm text-gray-500 mb-1">Wake Schedule</p>
                                  <p className="font-medium font-mono text-sm text-gray-900">
                                    {device.wake_schedule_cron || 'Not set'}
                                  </p>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>

                      {/* Images Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {device.images.map((image: any, idx: number) => (
                          <div
                            key={`${device.device_id}-${image.image_id}-${idx}`}
                            className="group relative bg-gray-100 rounded-lg overflow-hidden hover:shadow-lg transition-all duration-200"
                          >
                            {/* Image */}
                            <div
                              className="aspect-square relative bg-gray-200 cursor-pointer"
                              onClick={() => openLightbox(image, device.images, device)}
                            >
                              {image.image_url ? (
                                <img
                                  src={image.image_url}
                                  alt={`Device ${device.device_code} - Image ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23e5e7eb" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="w-12 h-12 text-gray-400" />
                                </div>
                              )}

                              {/* MGI Score Badge */}
                              {image.mgi_score != null && (
                                <div className="absolute top-2 right-2">
                                  <div
                                    className="px-2 py-1 rounded text-xs font-bold text-white shadow-lg"
                                    style={{
                                      backgroundColor:
                                        image.mgi_score >= 0.7 ? '#dc2626' :
                                        image.mgi_score >= 0.4 ? '#f59e0b' :
                                        '#10b981'
                                    }}
                                  >
                                    {(image.mgi_score * 100).toFixed(1)}%
                                  </div>
                                </div>
                              )}

                              {/* Hover Overlay */}
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLightbox(image, device.images, device);
                                  }}
                                  className="px-4 py-2 bg-white text-gray-900 rounded font-medium text-sm hover:bg-gray-100 transition-colors"
                                >
                                  View Full Size
                                </button>
                              </div>
                            </div>

                            {/* Image Metadata */}
                            <div className="p-3 bg-white space-y-2">
                              {image.image_name && (
                                <div className="text-xs font-medium text-gray-800 truncate" title={image.image_name}>
                                  {image.image_name}
                                </div>
                              )}
                              {/* Time & Wake Number */}
                              <div className="flex items-center justify-between text-xs text-gray-600">
                                <span className="flex items-center">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {image.captured_at ? format(new Date(image.captured_at), 'HH:mm') : 'Unknown'}
                                </span>
                                {image.wake_number && (
                                  <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-medium">
                                    Wake #{image.wake_number}
                                  </span>
                                )}
                              </div>

                              {/* MGI Metrics */}
                              {(image.mgi_velocity != null || image.mgi_speed != null) && (
                                <div className="pt-2 border-t border-gray-100 space-y-1">
                                  <div className="text-xs font-medium text-gray-700 mb-1">MGI Growth</div>
                                  {image.mgi_velocity != null && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center text-gray-600">
                                        {image.mgi_velocity >= 0 ? (
                                          <TrendingUp className="w-3 h-3 mr-1 text-red-500" />
                                        ) : (
                                          <TrendingDown className="w-3 h-3 mr-1 text-green-500" />
                                        )}
                                        Velocity
                                      </span>
                                      <span
                                        className="font-medium"
                                        style={{
                                          color: image.mgi_velocity >= 0 ? '#dc2626' : '#10b981'
                                        }}
                                      >
                                        {image.mgi_velocity >= 0 ? '+' : ''}{(image.mgi_velocity * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  )}
                                  {image.mgi_speed != null && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center text-gray-600">
                                        <Activity className="w-3 h-3 mr-1 text-blue-500" />
                                        Speed
                                      </span>
                                      <span className="font-medium text-gray-700">
                                        {image.mgi_speed >= 0 ? '+' : ''}{(image.mgi_speed * 100).toFixed(2)}%/day
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Environmental Data */}
                              {(image.temperature != null || image.humidity != null || image.battery_voltage != null) && (
                                <div className="pt-2 border-t border-gray-100 space-y-1">
                                  <div className="text-xs font-medium text-gray-700 mb-1">Environment</div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    {image.temperature != null && (
                                      <div className="flex items-center">
                                        <Thermometer className="w-3 h-3 mr-1 text-orange-500" />
                                        <span className="text-gray-600">{image.temperature.toFixed(1)}°F</span>
                                      </div>
                                    )}
                                    {image.humidity != null && (
                                      <div className="flex items-center">
                                        <Droplets className="w-3 h-3 mr-1 text-blue-500" />
                                        <span className="text-gray-600">{image.humidity.toFixed(1)}%</span>
                                      </div>
                                    )}
                                    {image.battery_voltage != null && (
                                      <div className="flex items-center col-span-2">
                                        <Battery className="w-3 h-3 mr-1 text-green-500" />
                                        <span className="text-gray-600">{image.battery_voltage.toFixed(2)}V</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Super Admin Edit Button */}
                              {isSuperAdmin && (
                                <button
                                  className="w-full mt-2 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-medium transition-colors flex items-center justify-center"
                                  onClick={() => {
                                    toast.info('MGI Score editing coming soon...');
                                  }}
                                >
                                  <ImageIcon className="w-3 h-3 mr-1" />
                                  Edit MGI Score
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* No Images State */}
                {devices.every(d => !d.images || d.images.length === 0) && (
                  <div className="text-center py-8">
                    <ImageIcon className="mx-auto h-16 w-16 text-gray-300" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No images captured yet</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Images will appear here as devices capture them during the session.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxState && (
        <DeviceImageLightbox
          isOpen={lightboxState.isOpen}
          onClose={closeLightbox}
          images={lightboxState.images}
          currentIndex={lightboxState.currentIndex}
          deviceInfo={lightboxState.deviceInfo}
          onNavigate={(newIndex) => {
            setLightboxState(prev => prev ? { ...prev, currentIndex: newIndex } : null);
          }}
        />
      )}

      {/* Manual Wake Modal */}
      {manualWakeModalState && (
        <ManualWakeModal
          isOpen={manualWakeModalState.isOpen}
          onClose={() => setManualWakeModalState(null)}
          deviceId={manualWakeModalState.deviceId}
          deviceCode={manualWakeModalState.deviceCode}
          onSuccess={() => {
            fetchEnhancedDeviceData();
            toast.success('Manual wake scheduled successfully');
          }}
        />
      )}
    </div>
  );
};

export default SiteDeviceSessionDetailPage;
