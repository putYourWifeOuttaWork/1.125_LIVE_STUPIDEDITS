import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building,
  Calendar,
  Clock,
  AlertTriangle,
  Activity,
  Thermometer,
  Droplets,
  TrendingUp,
  Cpu,
  ExternalLink,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { parseDateOnly } from '../../utils/timeFormatters';
import { ActiveSession } from './ActiveSessionsGrid';
import { useActiveCompany } from '../../hooks/useActiveCompany';

interface SessionDetailsPanelProps {
  selectedSession: ActiveSession | null;
  loading?: boolean;
}

interface SessionMetrics {
  totalDevices: number;
  activeDevices: number;
  pendingDevices: number;
  avgTemperature: number | null;
  avgHumidity: number | null;
  avgMgiScore: number | null;
  deviceHealthDistribution: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

export default function SessionDetailsPanel({
  selectedSession,
  loading = false,
}: SessionDetailsPanelProps) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useActiveCompany();
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  useEffect(() => {
    if (selectedSession) {
      loadSessionMetrics();
    } else {
      setMetrics(null);
    }
  }, [selectedSession?.session_id]);

  const loadSessionMetrics = async () => {
    if (!selectedSession) return;

    try {
      setLoadingMetrics(true);

      // Fetch devices for this site
      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select('device_id, battery_health_percent, latest_mgi_score, is_active')
        .eq('site_id', selectedSession.site_id);

      if (devicesError) throw devicesError;

      const deviceIds = (devicesData || []).map(d => d.device_id);

      // Fetch latest environmental data from device_images (single source of truth)
      const { data: telemetryData } = await supabase
        .from('device_images')
        .select('device_id, temperature, humidity, captured_at')
        .in('device_id', deviceIds)
        .eq('status', 'complete')  // Only complete images with valid data
        .gte('captured_at', selectedSession.session_date)
        .order('captured_at', { ascending: false });

      // Calculate averages
      const uniqueTelemetry = new Map();
      (telemetryData || []).forEach(t => {
        if (!uniqueTelemetry.has(t.device_id)) {
          uniqueTelemetry.set(t.device_id, t);
        }
      });

      const telemetryValues = Array.from(uniqueTelemetry.values());
      const avgTemp = telemetryValues.length > 0
        ? telemetryValues.reduce((sum, t) => sum + (t.temperature || 0), 0) / telemetryValues.length
        : null;
      const avgHum = telemetryValues.length > 0
        ? telemetryValues.reduce((sum, t) => sum + (t.humidity || 0), 0) / telemetryValues.length
        : null;

      // Calculate MGI average
      const mgiScores = (devicesData || [])
        .map(d => d.latest_mgi_score)
        .filter(score => score !== null && score !== undefined);
      const avgMgi = mgiScores.length > 0
        ? mgiScores.reduce((sum, score) => sum + score, 0) / mgiScores.length
        : null;

      // Calculate device health distribution
      const healthDistribution = {
        healthy: 0,
        warning: 0,
        critical: 0,
      };

      (devicesData || []).forEach(device => {
        const battery = device.battery_health_percent || 0;
        if (battery >= 70) {
          healthDistribution.healthy++;
        } else if (battery >= 30) {
          healthDistribution.warning++;
        } else {
          healthDistribution.critical++;
        }
      });

      setMetrics({
        totalDevices: devicesData?.length || 0,
        activeDevices: telemetryValues.length,
        pendingDevices: (devicesData?.length || 0) - telemetryValues.length,
        avgTemperature: avgTemp,
        avgHumidity: avgHum,
        avgMgiScore: avgMgi,
        deviceHealthDistribution: healthDistribution,
      });
    } catch (error) {
      console.error('Error loading session metrics:', error);
    } finally {
      setLoadingMetrics(false);
    }
  };

  if (!selectedSession) {
    return (
      <Card className="h-full flex items-center justify-center min-h-[400px]">
        <CardContent className="text-center py-12">
          <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Session</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Click on any session card to view detailed metrics and the site map with live device data
          </p>
        </CardContent>
      </Card>
    );
  }

  const progress = selectedSession.expected_wake_count > 0
    ? (selectedSession.completed_wake_count / selectedSession.expected_wake_count) * 100
    : selectedSession.completed_wake_count > 0
    ? 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-gray-900">{selectedSession.site_name}</h2>
                <button
                  onClick={() =>
                    navigate(
                      `/programs/${selectedSession.program_id}/sites/${selectedSession.site_id}/device-sessions/${selectedSession.session_id}`
                    )
                  }
                  className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                  title="Visit full session page"
                >
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                </button>
              </div>
              <p className="text-sm text-gray-600">{selectedSession.program_name}</p>
              {isSuperAdmin && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <Building className="w-3 h-3" />
                  {selectedSession.company_name}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <Calendar className="w-4 h-4" />
                {format(parseDateOnly(selectedSession.session_date), 'MMM d, yyyy')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Card */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-gray-700">Session Progress</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900">
                {selectedSession.completed_wake_count} / {selectedSession.expected_wake_count}
              </span>
              <span className="text-lg font-semibold text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  selectedSession.critical_alert_count > 0
                    ? 'bg-red-500'
                    : selectedSession.warning_alert_count > 0
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">Completed wakes in this session</p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Alerts Card */}
        <Card className={selectedSession.alert_count > 0 ? 'border-l-4 border-l-red-500' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle
                className={`w-5 h-5 ${
                  selectedSession.critical_alert_count > 0 ? 'text-red-600' : 'text-yellow-600'
                }`}
              />
              <span className="text-2xl font-bold text-gray-900">{selectedSession.alert_count}</span>
            </div>
            <p className="text-xs text-gray-600 font-medium">Active Alerts</p>
            {selectedSession.critical_alert_count > 0 && (
              <p className="text-xs text-red-600 mt-1">{selectedSession.critical_alert_count} critical</p>
            )}
          </CardContent>
        </Card>

        {/* Devices Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Cpu className="w-5 h-5 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">
                {loadingMetrics ? '...' : metrics?.totalDevices || 0}
              </span>
            </div>
            <p className="text-xs text-gray-600 font-medium">Total Devices</p>
            {metrics && (
              <p className="text-xs text-gray-500 mt-1">
                {metrics.activeDevices} reported
              </p>
            )}
          </CardContent>
        </Card>

        {/* Temperature Card */}
        {metrics && metrics.avgTemperature !== null && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Thermometer className="w-5 h-5 text-orange-600" />
                <span className="text-2xl font-bold text-gray-900">
                  {metrics.avgTemperature.toFixed(1)}°
                </span>
              </div>
              <p className="text-xs text-gray-600 font-medium">Avg Temperature</p>
            </CardContent>
          </Card>
        )}

        {/* Humidity Card */}
        {metrics && metrics.avgHumidity !== null && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Droplets className="w-5 h-5 text-blue-600" />
                <span className="text-2xl font-bold text-gray-900">
                  {metrics.avgHumidity.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-gray-600 font-medium">Avg Humidity</p>
            </CardContent>
          </Card>
        )}

        {/* MGI Score Card */}
        {metrics && metrics.avgMgiScore !== null && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-2xl font-bold text-gray-900">
                  {metrics.avgMgiScore.toFixed(1)}
                </span>
              </div>
              <p className="text-xs text-gray-600 font-medium">Avg MGI Score</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Device Health Distribution */}
      {metrics && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-700">Device Health</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Healthy</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {metrics.deviceHealthDistribution.healthy}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{
                      width: `${
                        metrics.totalDevices > 0
                          ? (metrics.deviceHealthDistribution.healthy / metrics.totalDevices) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Warning</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {metrics.deviceHealthDistribution.warning}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{
                      width: `${
                        metrics.totalDevices > 0
                          ? (metrics.deviceHealthDistribution.warning / metrics.totalDevices) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Critical</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {metrics.deviceHealthDistribution.critical}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{
                      width: `${
                        metrics.totalDevices > 0
                          ? (metrics.deviceHealthDistribution.critical / metrics.totalDevices) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
