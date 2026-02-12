import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, X, ExternalLink, Bell, BellOff, Settings, Clock } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import useCompanies from '../../hooks/useCompanies';
import CompanyAlertThresholdsModal from '../companies/CompanyAlertThresholdsModal';
import { createLogger } from '../../utils/logger';

const log = createLogger('ActiveAlerts');

type TimeRange = '24h' | '7d' | '30d' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

const STORAGE_KEY = 'alerts_panel_time_range';

function getTimeRangeCutoff(range: TimeRange): string | null {
  if (range === 'all') return null;
  const now = Date.now();
  const ms: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - ms[range]).toISOString();
}

function loadSavedTimeRange(): TimeRange {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ['24h', '7d', '30d', 'all'].includes(saved)) {
      return saved as TimeRange;
    }
  } catch { /* ignore storage errors */ }
  return '7d';
}

interface DeviceAlert {
  alert_id: string;
  device_id: string;
  alert_type: string;
  alert_category: 'absolute' | 'shift' | 'velocity' | 'speed' | 'combination' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  actual_value: number | null;
  threshold_value: number | null;
  threshold_context: any;
  measurement_timestamp: string;
  triggered_at: string;
  resolved_at: string | null;

  device_coords: string | null;
  zone_label: string | null;
  site_id: string | null;
  site_name: string | null;
  program_id: string | null;
  program_name: string | null;
  company_id: string | null;
  company_name: string | null;
  metadata: any;

  session_id: string | null;
  snapshot_id: string | null;
  wake_number: number | null;
}

const ActiveAlertsPanel = () => {
  const navigate = useNavigate();
  const { userCompany, isAdmin } = useCompanies();
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>(loadSavedTimeRange);
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    try { localStorage.setItem(STORAGE_KEY, range); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!userCompany) return;

    const loadAlerts = async () => {
      try {
        const limit = timeRange === 'all' ? 25 : 10;
        let query = supabase
          .from('device_alerts')
          .select('*')
          .eq('company_id', userCompany.company_id)
          .order('triggered_at', { ascending: false })
          .limit(limit);

        if (!showResolved) {
          query = query.is('resolved_at', null);
        }

        const cutoff = getTimeRangeCutoff(timeRange);
        if (cutoff) {
          query = query.gte('triggered_at', cutoff);
        }

        const { data, error } = await query;

        if (error) throw error;

        setAlerts(data || []);
      } catch (error) {
        log.error('Error loading alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();

    const subscription = supabase
      .channel(`device_alerts_${timeRange}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_alerts',
          filter: `company_id=eq.${userCompany.company_id}`,
        },
        () => {
          loadAlerts();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userCompany, showResolved, timeRange]);

  const handleViewSession = async (alert: DeviceAlert) => {
    // If we have a direct session_id, use it
    if (alert.session_id && alert.program_id && alert.site_id) {
      navigate(`/programs/${alert.program_id}/sites/${alert.site_id}/device-sessions/${alert.session_id}`);
      return;
    }

    // Otherwise, find the session by site and date
    if (!alert.site_id || !alert.program_id) {
      toast.error('Unable to find session - missing site information');
      return;
    }

    try {
      const alertDate = new Date(alert.triggered_at);
      // Format the date as YYYY-MM-DD for matching session_date
      const sessionDate = alertDate.toISOString().split('T')[0];

      // Find the session for this site on this day
      const { data: sessions, error } = await supabase
        .from('site_device_sessions')
        .select('session_id')
        .eq('site_id', alert.site_id)
        .eq('session_date', sessionDate)
        .order('session_start_time', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (sessions && sessions.length > 0) {
        navigate(`/programs/${alert.program_id}/sites/${alert.site_id}/device-sessions/${sessions[0].session_id}`);
      } else {
        toast.error('No session found for this site on this date');
      }
    } catch (error) {
      log.error('Error finding session:', error);
      toast.error('Failed to find session');
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('device_alerts')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Acknowledged by user',
        })
        .eq('alert_id', alertId);

      if (error) {
        log.error('Acknowledge error:', error);
        throw error;
      }

      toast.success('Alert acknowledged');

      setAlerts(alerts.filter(a => a.alert_id !== alertId));
    } catch (error: any) {
      log.error('Error acknowledging alert:', error);
      toast.error(error.message || 'Failed to acknowledge alert');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'error':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <AlertTriangle className="w-5 h-5" />;
      case 'warning':
        return <Bell className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'absolute':
        return 'Absolute Threshold';
      case 'shift':
        return 'Intra-Session Shift';
      case 'velocity':
        return 'MGI Velocity';
      case 'speed':
        return 'MGI Program Speed';
      case 'combination':
        return 'Danger Zone';
      case 'system':
        return 'System Alert';
      default:
        return category;
    }
  };

  // Count alerts by severity
  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolved_at).length;
  const warningCount = alerts.filter(a => a.severity === 'warning' && !a.resolved_at).length;
  const activeCount = alerts.filter(a => !a.resolved_at).length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold">Active Alerts</h2>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500 text-sm">
            Loading alerts...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            <div>
              <h2 className="text-lg font-semibold">Active Alerts</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {criticalCount > 0 && (
                  <span className="text-xs font-medium text-red-600">
                    {criticalCount} CRITICAL
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="text-xs font-medium text-yellow-600">
                    {warningCount} WARNING
                  </span>
                )}
                {activeCount === 0 && (
                  <span className="text-xs text-gray-500">All clear</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-md p-0.5">
              {TIME_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleTimeRangeChange(opt.value)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    timeRange === opt.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowThresholdsModal(true)}
                leftIcon={<Settings className="w-4 h-4" />}
              >
                Configure Thresholds
              </Button>
            )}
            <button
              onClick={() => setShowResolved(!showResolved)}
              className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              {showResolved ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
              {showResolved ? 'Hide' : 'Show'} Resolved
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">No active alerts</p>
            <p className="text-xs text-gray-500 mt-0.5">All systems operating normally</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`border rounded-lg ${getSeverityColor(alert.severity)} ${
                  alert.resolved_at ? 'opacity-60' : ''
                }`}
              >
                {/* Compact Header */}
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="mt-0.5 flex-shrink-0">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-0.5 uppercase">
                        {getCategoryLabel(alert.alert_category)} {alert.severity}
                      </div>
                      <p className="text-sm font-medium leading-snug">
                        {alert.message}
                      </p>
                      <div className="text-xs text-gray-700 mt-0.5">
                        Site: {alert.site_name || 'Unknown'} - Device: {alert.metadata?.device_code || 'Unknown'}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!alert.resolved_at && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeAlert(alert.alert_id);
                        }}
                        className="p-1.5 border border-gray-400 rounded hover:bg-white transition-colors"
                        title="Acknowledge"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* View Session button - show if we have site and program info */}
                    {(alert.site_id || alert.session_id) && alert.program_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewSession(alert);
                        }}
                        className="p-1.5 border border-gray-400 rounded hover:bg-white transition-colors"
                        title="View Session"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible Details */}
                <details className="border-t border-gray-300">
                  <summary className="px-2.5 py-1.5 text-xs font-medium cursor-pointer hover:bg-white/50 transition-colors">
                    View Details
                  </summary>
                  <div className="px-2.5 py-2 bg-white/30 text-xs space-y-1">
                    {/* Full Context */}
                    {alert.zone_label && (
                      <div>
                        <span className="font-semibold">Zone:</span> {alert.zone_label}
                      </div>
                    )}
                    {alert.device_coords && (
                      <div>
                        <span className="font-semibold">Coordinates:</span> {alert.device_coords}
                      </div>
                    )}
                    {alert.program_name && (
                      <div>
                        <span className="font-semibold">Program:</span> {alert.program_name}
                      </div>
                    )}
                    {alert.actual_value !== null && alert.threshold_value !== null && (
                      <div>
                        <span className="font-semibold">Value:</span> {alert.actual_value} (threshold: {alert.threshold_value})
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">Triggered:</span> {format(new Date(alert.triggered_at), 'MMM d, yyyy h:mm a')}
                    </div>

                    {/* Threshold Context */}
                    {alert.threshold_context && Object.keys(alert.threshold_context).length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-300">
                        <div className="font-semibold mb-0.5">Threshold Context:</div>
                        <div className="space-y-0.5 pl-2">
                          {Object.entries(alert.threshold_context).map(([key, value]) => (
                            <div key={key}>
                              <span className="font-medium">{key}:</span> {JSON.stringify(value)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Company Alert Thresholds Modal */}
      {userCompany && showThresholdsModal && (
        <CompanyAlertThresholdsModal
          isOpen={showThresholdsModal}
          onClose={() => setShowThresholdsModal(false)}
          companyId={userCompany.company_id}
          companyName={userCompany.name}
        />
      )}
    </Card>
  );
};

export default ActiveAlertsPanel;
