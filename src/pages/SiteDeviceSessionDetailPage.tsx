import { useState, useEffect } from 'react';
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
  Battery,
  Thermometer,
  Droplets,
  Gauge,
  Wind,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabaseClient';
import { SiteDeviceSession, DeviceWakePayload, useSiteDeviceSessions } from '../hooks/useSiteDeviceSessions';

const SiteDeviceSessionDetailPage = () => {
  const { programId, siteId, sessionId } = useParams<{
    programId: string;
    siteId: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<SiteDeviceSession | null>(null);
  const [wakePayloads, setWakePayloads] = useState<DeviceWakePayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [payloadsLoading, setPayloadsLoading] = useState(true);

  const { fetchWakePayloads } = useSiteDeviceSessions(siteId);

  useEffect(() => {
    if (sessionId) {
      fetchSessionData();
      fetchPayloadsData();
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

  const fetchPayloadsData = async () => {
    try {
      setPayloadsLoading(true);
      if (!sessionId) return;
      const payloads = await fetchWakePayloads(sessionId);
      setWakePayloads(payloads);
    } catch (error: any) {
      console.error('Error fetching wake payloads:', error);
      toast.error('Failed to load wake payloads');
    } finally {
      setPayloadsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchSessionData();
    fetchPayloadsData();
  };

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

  const getPayloadStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-300';
      case 'complete':
        return 'bg-green-50 text-green-700 border-green-300';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-300';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-300';
    }
  };

  const completionPercentage =
    session.expected_wake_count > 0
      ? Math.round((session.completed_wake_count / session.expected_wake_count) * 100)
      : 0;

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
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} icon={<RefreshCw size={16} />}>
          Refresh
        </Button>
      </div>

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
                  {session.completed_wake_count + session.failed_wake_count + session.extra_wake_count}
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
              <p className="text-2xl font-bold text-green-600">{session.completed_wake_count}</p>
              <p className="text-sm text-gray-600 mt-1">Completed</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <WifiOff className="h-6 w-6 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">{session.failed_wake_count}</p>
              <p className="text-sm text-gray-600 mt-1">Failed</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <AlertCircle className="h-6 w-6 text-yellow-500" />
              </div>
              <p className="text-2xl font-bold text-yellow-600">{session.extra_wake_count}</p>
              <p className="text-sm text-gray-600 mt-1">Extra</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-2">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">{session.expected_wake_count}</p>
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Wake Payloads ({wakePayloads.length})</h2>
            {payloadsLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {payloadsLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : wakePayloads.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-gray-600 mt-2">No wake payloads found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {wakePayloads.map((payload) => (
                <div
                  key={payload.payload_id}
                  className={`border rounded-lg p-4 ${getPayloadStatusColor(payload.payload_status)}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-base">
                        Wake #{payload.wake_window_index} - {payload.device_code || payload.device_name || 'Unknown Device'}
                      </h3>
                      <p className="text-xs mt-1">
                        {format(new Date(payload.captured_at), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getPayloadStatusColor(payload.payload_status)}`}>
                      {payload.payload_status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    {payload.temperature && (
                      <div className="flex items-center">
                        <Thermometer className="h-4 w-4 mr-2 text-red-500" />
                        <span>{payload.temperature}°C</span>
                      </div>
                    )}

                    {payload.humidity && (
                      <div className="flex items-center">
                        <Droplets className="h-4 w-4 mr-2 text-blue-500" />
                        <span>{payload.humidity}%</span>
                      </div>
                    )}

                    {payload.battery_voltage && (
                      <div className="flex items-center">
                        <Battery className="h-4 w-4 mr-2 text-green-500" />
                        <span>{payload.battery_voltage}V</span>
                      </div>
                    )}

                    {payload.wifi_rssi && (
                      <div className="flex items-center">
                        <Wifi className="h-4 w-4 mr-2 text-blue-500" />
                        <span>{payload.wifi_rssi} dBm</span>
                      </div>
                    )}

                    {payload.image_id && (
                      <div className="flex items-center">
                        <ImageIcon className="h-4 w-4 mr-2 text-purple-500" />
                        <span>Image attached</span>
                      </div>
                    )}
                  </div>

                  {payload.overage_flag && (
                    <div className="mt-3 pt-3 border-t border-yellow-300">
                      <div className="flex items-center text-xs text-yellow-700">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        This wake was outside the expected schedule (overage)
                      </div>
                    </div>
                  )}

                  {payload.resent_received_at && (
                    <div className="mt-3 pt-3 border-t border-blue-300">
                      <div className="flex items-center text-xs text-blue-700">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retried at {format(new Date(payload.resent_received_at), 'MMM dd, HH:mm:ss')}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteDeviceSessionDetailPage;
