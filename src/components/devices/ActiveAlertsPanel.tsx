import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, X, ExternalLink, Bell, BellOff } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import useCompanies from '../../hooks/useCompanies';

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

  // Routing context
  device_coords: string | null;
  zone_label: string | null;
  site_id: string | null;
  site_name: string | null;
  program_id: string | null;
  program_name: string | null;
  company_id: string | null;
  company_name: string | null;
  metadata: any;
}

const ActiveAlertsPanel = () => {
  const { userCompany } = useCompanies();
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  // Load active alerts
  useEffect(() => {
    if (!userCompany) return;

    const loadAlerts = async () => {
      try {
        let query = supabase
          .from('device_alerts')
          .select('*')
          .eq('company_id', userCompany.company_id)
          .order('triggered_at', { ascending: false })
          .limit(10);

        if (!showResolved) {
          query = query.is('resolved_at', null);
        }

        const { data, error } = await query;

        if (error) throw error;

        setAlerts(data || []);
      } catch (error) {
        console.error('Error loading alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('device_alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_alerts',
          filter: `company_id=eq.${userCompany.company_id}`,
        },
        () => {
          loadAlerts(); // Reload on any change
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userCompany, showResolved]);

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('device_alerts')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Acknowledged by user',
        })
        .eq('alert_id', alertId);

      if (error) throw error;

      toast.success('Alert acknowledged');

      // Reload alerts
      setAlerts(alerts.filter(a => a.alert_id !== alertId));
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
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
          <div className="text-center py-8 text-gray-500">
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
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            <div>
              <h2 className="text-lg font-semibold">Active Alerts</h2>
              <div className="flex items-center gap-3 mt-1">
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

          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            {showResolved ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
            {showResolved ? 'Hide' : 'Show'} Resolved
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No active alerts</p>
            <p className="text-sm text-gray-500 mt-1">All systems operating normally</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)} ${
                  alert.resolved_at ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-0.5">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Category & Severity */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">
                          {getCategoryLabel(alert.alert_category)}
                        </span>
                        <span className="text-xs uppercase font-bold">
                          {alert.severity}
                        </span>
                      </div>

                      {/* Message */}
                      <p className="text-sm font-medium mb-2">{alert.message}</p>

                      {/* Routing Context */}
                      <div className="text-xs space-y-1">
                        {alert.metadata?.device_code && (
                          <div>
                            <span className="font-medium">Device:</span> {alert.metadata.device_code}
                          </div>
                        )}
                        {alert.zone_label && (
                          <div>
                            <span className="font-medium">Zone:</span> {alert.zone_label}
                          </div>
                        )}
                        {alert.site_name && (
                          <div>
                            <span className="font-medium">Site:</span> {alert.site_name}
                          </div>
                        )}
                        {alert.program_name && (
                          <div>
                            <span className="font-medium">Program:</span> {alert.program_name}
                          </div>
                        )}
                        <div className="text-gray-600">
                          {format(new Date(alert.triggered_at), 'MMM d, h:mm a')}
                        </div>
                      </div>

                      {/* Threshold Context */}
                      {alert.threshold_context && Object.keys(alert.threshold_context).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs font-medium cursor-pointer hover:text-gray-900">
                            View Details
                          </summary>
                          <div className="mt-1 text-xs space-y-1 pl-3 border-l-2 border-gray-300">
                            {Object.entries(alert.threshold_context).map(([key, value]) => (
                              <div key={key}>
                                <span className="font-medium">{key}:</span> {JSON.stringify(value)}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {!alert.resolved_at && (
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledgeAlert(alert.alert_id)}
                        title="Acknowledge"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      {alert.device_id && (
                        <a
                          href={`/devices/${alert.device_id}`}
                          className="p-2 border border-gray-300 rounded-md hover:bg-white transition-colors"
                          title="View Device"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveAlertsPanel;
