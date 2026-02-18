import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building,
  ClipboardList,
  MapPin,
  Activity,
} from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import useCompanies from '../hooks/useCompanies';
import LoadingScreen from '../components/common/LoadingScreen';
import { supabase } from '../lib/supabaseClient';
import { Site } from '../lib/types';
import { useSessionStore } from '../stores/sessionStore';
import ActiveAlertsPanel from '../components/devices/ActiveAlertsPanel';
import ActiveSessionsGrid, { ActiveSession } from '../components/devices/ActiveSessionsGrid';
import SessionDetailsPanel from '../components/devices/SessionDetailsPanel';
import SiteMapAnalyticsViewer from '../components/lab/SiteMapAnalyticsViewer';
import AlertInvestigationPanel from '../components/devices/AlertInvestigationPanel';
import { useActiveCompany } from '../hooks/useActiveCompany';
import { createLogger } from '../utils/logger';
import type { DeviceAlert } from '../types/alerts';

const log = createLogger('HomePage');

const HomePage = () => {
  const navigate = useNavigate();
  const { loading: companyLoading } = useCompanies();
  const { activeCompanyId, isSuperAdmin } = useActiveCompany();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<ActiveSession | null>(null);
  const [sessionSiteData, setSessionSiteData] = useState<Site | null>(null);
  const [sessionDevices, setSessionDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<DeviceAlert | null>(null);
  const [lastAction, setLastAction] = useState<'alert' | 'session' | null>(null);

  const sessionDetailsRef = useRef<HTMLDivElement>(null);
  const investigationRef = useRef<HTMLDivElement>(null);

  const {
    setIsSessionsDrawerOpen,
  } = useSessionStore();

  const handleAlertSelect = async (alert: DeviceAlert) => {
    setSelectedAlert(alert);
    setLastAction('alert');

    if (alert.session_id && alert.site_id) {
      setSelectedSessionId(alert.session_id);
      setSelectedSessionData({
        session_id: alert.session_id,
        site_name: alert.site_name || 'Unknown',
        site_id: alert.site_id,
        program_name: alert.program_name || 'Unknown',
        program_id: alert.program_id || '',
        company_name: alert.company_name || '',
        company_id: alert.company_id || '',
        session_date: new Date(alert.triggered_at).toISOString().split('T')[0],
        expected_wake_count: 0,
        completed_wake_count: 0,
        status: 'in_progress',
        alert_count: 1,
        critical_alert_count: alert.severity === 'critical' ? 1 : 0,
        warning_alert_count: alert.severity === 'warning' ? 1 : 0,
        latest_alert_severity: alert.severity,
      });
      await loadSessionSiteData(alert.site_id);
    }

    setTimeout(() => {
      investigationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSessionSelect = async (session: ActiveSession) => {
    setSelectedSessionId(session.session_id);
    setSelectedSessionData(session);
    setLastAction('session');

    await loadSessionSiteData(session.site_id);

    setTimeout(() => {
      sessionDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const loadSessionSiteData = async (siteId: string) => {
    try {
      setDevicesLoading(true);

      const { data: siteData, error: siteError } = await supabase
        .from('sites')
        .select('*')
        .eq('site_id', siteId)
        .single();

      if (siteError) throw siteError;
      setSessionSiteData(siteData);

      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select(`
          device_id,
          device_code,
          device_name,
          x_position,
          y_position,
          battery_health_percent,
          is_active,
          last_seen_at,
          latest_mgi_score,
          latest_mgi_velocity
        `)
        .eq('site_id', siteId)
        .not('x_position', 'is', null)
        .not('y_position', 'is', null)
        .order('device_code');

      if (devicesError) throw devicesError;

      const deviceIds = (devicesData || []).map(d => d.device_id);
      const { data: telemetryData } = deviceIds.length > 0
        ? await supabase
            .from('device_telemetry')
            .select('device_id, temperature, humidity, captured_at')
            .in('device_id', deviceIds)
            .order('captured_at', { ascending: false })
            .limit(deviceIds.length * 2)
        : { data: [] };

      const telemetryMap = new Map();
      (telemetryData || []).forEach(t => {
        if (!telemetryMap.has(t.device_id)) {
          telemetryMap.set(t.device_id, {
            temperature: t.temperature,
            humidity: t.humidity
          });
        }
      });

      const formattedDevices = (devicesData || []).map((device) => {
        const telemetry = telemetryMap.get(device.device_id);
        return {
          device_id: device.device_id,
          device_code: device.device_code,
          device_name: device.device_name,
          x: device.x_position,
          y: device.y_position,
          battery_level: device.battery_health_percent,
          status: device.is_active ? 'active' : 'inactive',
          last_seen: device.last_seen_at,
          temperature: telemetry?.temperature || null,
          humidity: telemetry?.humidity || null,
          mgi_score: device.latest_mgi_score,
          mgi_velocity: device.latest_mgi_velocity,
        };
      });

      setSessionDevices(formattedDevices);
    } catch (error: any) {
      log.error('Error loading session site data:', error);
    } finally {
      setDevicesLoading(false);
    }
  };

  if (companyLoading) {
    return <LoadingScreen />;
  }

  const hasSiteMap = selectedSessionData && sessionSiteData &&
    sessionDevices.length > 0 && sessionSiteData.length && sessionSiteData.width;

  return (
     <div className="animate-fade-in space-y-6">
      {isSuperAdmin && activeCompanyId && (
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Viewing Company Context
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    All data filtered to selected company
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-grow">
          <h1 className="text-2xl font-bold text-gray-900">Command Center</h1>
          <p className="text-gray-600 mt-1">Real-time monitoring and triage</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="contained"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            onClick={() => setIsSessionsDrawerOpen(true)}
            icon={<ClipboardList size={16} />}
          >
            Manage Sessions
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/programs')}
          >
            View Programs
          </Button>
        </div>
      </div>

      {/* Row 1: Active Alerts (left) + Active Sessions (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="max-h-[400px] overflow-y-auto">
          <ActiveAlertsPanel
            onAlertSelect={handleAlertSelect}
            selectedAlertId={selectedAlert?.alert_id || null}
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Active Sessions Today</h2>
              <p className="text-sm text-gray-600 mt-1">Real-time device session monitoring</p>
            </CardHeader>
            <CardContent>
              <ActiveSessionsGrid
                limit={20}
                companyFilter={activeCompanyId}
                onSessionSelect={handleSessionSelect}
                selectedSessionId={selectedSessionId}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alert Investigation (shown first when alert was the last action) */}
      {lastAction === 'alert' && selectedAlert && (
        <div ref={investigationRef} className="scroll-mt-4">
          <AlertInvestigationPanel
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
          />
        </div>
      )}

      {/* Session Details + Site Map (full width) */}
      <div ref={sessionDetailsRef} className="scroll-mt-4">
        {!selectedSessionData ? (
          <Card className="flex items-center justify-center min-h-[200px]">
            <CardContent className="text-center py-12">
              <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Session or Alert</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Click on any session card or alert above to view detailed metrics, investigation charts, and the site map
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <SessionDetailsPanel
                selectedSession={selectedSessionData}
                sessionId={selectedSessionId || ''}
              />
            </div>

            <div className="lg:col-span-3">
              {sessionSiteData && (
                <Card className="min-h-[500px] h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold">Site Map</h3>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Device positions and live metrics</p>
                  </CardHeader>
                  <CardContent>
                    {devicesLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : hasSiteMap ? (
                      <SiteMapAnalyticsViewer
                        siteLength={sessionSiteData.length!}
                        siteWidth={sessionSiteData.width!}
                        siteName={sessionSiteData.name}
                        devices={sessionDevices}
                        highlightDeviceId={selectedAlert?.device_id || null}
                        onDeviceClick={(deviceId) => {
                          navigate(`/devices/${deviceId}`);
                        }}
                        showControls={true}
                      />
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <MapPin className="mx-auto h-16 w-16 text-gray-300" />
                        <p className="text-gray-600 mt-4 font-medium">Site Map Not Ready</p>
                        <p className="text-sm text-gray-500 mt-2">
                          {!sessionSiteData.length || !sessionSiteData.width
                            ? 'Site dimensions need to be configured'
                            : 'No devices have been placed on this site map yet'
                          }
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Alert Investigation (shown after session when session was the last action) */}
      {lastAction !== 'alert' && selectedAlert && (
        <div ref={investigationRef} className="scroll-mt-4">
          <AlertInvestigationPanel
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
          />
        </div>
      )}
    </div>
  );
};

export default HomePage;
