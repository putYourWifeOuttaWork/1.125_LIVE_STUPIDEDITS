import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingScreen from '../components/common/LoadingScreen';
import DeviceSessionCard from '../components/devices/DeviceSessionCard';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabaseClient';
import { SiteDeviceSession } from '../hooks/useSiteDeviceSessions';
import { useUserRole } from '../hooks/useUserRole';

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

  const { role } = useUserRole();
  const canEdit = role === 'company_admin' || role === 'maintenance' || role === 'super_admin';
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleRefresh = () => {
    fetchSessionData();
    fetchDevicesData();
  };

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

  const completionPercentage = totalExpectedWakes > 0
    ? Math.round((totalCompletedWakes / totalExpectedWakes) * 100)
    : 0;

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
        <Button variant="outline" onClick={handleRefresh} icon={<RefreshCw size={16} />}>
          Refresh
        </Button>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
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

        <Card>
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
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
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

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Session Statistics</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="flex justify-center mb-2">
                <Wifi className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">{totalCompletedWakes}</p>
              <p className="text-sm text-gray-600 mt-1">Completed</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <WifiOff className="h-6 w-6 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">{totalFailedWakes}</p>
              <p className="text-sm text-gray-600 mt-1">Failed</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              </div>
              <p className="text-2xl font-bold text-yellow-600">{totalExtraWakes}</p>
              <p className="text-sm text-gray-600 mt-1">Extra</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">{totalExpectedWakes}</p>
              <p className="text-sm text-gray-600 mt-1">Expected</p>
            </div>
          </div>
        </CardContent>
      </Card>

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

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Devices in This Session ({devices.length})</h2>
          {devicesLoading && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          )}
        </div>

        {devicesLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : devices.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Activity className="mx-auto h-16 w-16 text-gray-300" />
                <p className="text-gray-600 mt-4 text-lg">No devices found in this session</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => (
              <DeviceSessionCard
                key={device.device_id}
                device={device}
                canEdit={canEdit}
                onEdit={handleEditDevice}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteDeviceSessionDetailPage;
