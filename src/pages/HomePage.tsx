import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building,
  ClipboardList,
  MapPin,
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
import { useCompanyFilterStore } from '../stores/companyFilterStore';
import useUserRole from '../hooks/useUserRole';

const HomePage = () => {
  console.log('HomePage: Component mounting/rendering');

  const navigate = useNavigate();
  const { loading: companyLoading } = useCompanies();
  const { selectedCompanyId: activeCompanyId } = useCompanyFilterStore();
  const { isSuperAdmin } = useUserRole();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<ActiveSession | null>(null);
  const [sessionSiteData, setSessionSiteData] = useState<Site | null>(null);
  const [sessionDevices, setSessionDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [renderError, setRenderError] = useState<Error | null>(null);

  const {
    setIsSessionsDrawerOpen,
  } = useSessionStore();

  // Component mount effect
  useEffect(() => {
    console.log('HomePage: Component mounted');
    return () => {
      console.log('HomePage: Component unmounting');
    };
  }, []);

  // Handle session selection
  const handleSessionSelect = async (session: ActiveSession) => {
    setSelectedSessionId(session.session_id);
    setSelectedSessionData(session);

    // Load site data and devices for the map
    await loadSessionSiteData(session.site_id);
  };

  // Load site data and devices for the selected session
  const loadSessionSiteData = async (siteId: string) => {
    try {
      setDevicesLoading(true);

      // Fetch site data
      const { data: siteData, error: siteError } = await supabase
        .from('sites')
        .select('*')
        .eq('site_id', siteId)
        .single();

      if (siteError) throw siteError;
      setSessionSiteData(siteData);

      // Fetch devices for the map
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

      // Fetch latest telemetry
      const deviceIds = (devicesData || []).map(d => d.device_id);
      const { data: telemetryData } = await supabase
        .from('device_telemetry')
        .select('device_id, temperature, humidity, captured_at')
        .in('device_id', deviceIds)
        .order('captured_at', { ascending: false });

      // Get latest telemetry per device
      const telemetryMap = new Map();
      (telemetryData || []).forEach(t => {
        if (!telemetryMap.has(t.device_id)) {
          telemetryMap.set(t.device_id, {
            temperature: t.temperature,
            humidity: t.humidity
          });
        }
      });

      // Format devices for the map
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
      console.error('Error loading session site data:', error);
    } finally {
      setDevicesLoading(false);
    }
  };

  // Debug logging
  console.log('HomePage render:', {
    companyLoading,
    isSuperAdmin,
    activeCompanyId,
    selectedSessionId,
    hasSessionSiteData: !!sessionSiteData
  });

  // Display any render errors
  if (renderError) {
    console.error('HomePage: Render error:', renderError);
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-bold text-red-800 mb-2">Render Error</h2>
        <p className="text-red-600">{renderError.message}</p>
        <pre className="mt-4 text-xs text-red-700 overflow-auto">{renderError.stack}</pre>
      </div>
    );
  }

  if (companyLoading) {
    console.log('HomePage: Showing LoadingScreen due to companyLoading');
    return <LoadingScreen />;
  }

  console.log('HomePage: Rendering main content');

  try {
    return (
      <div className="animate-fade-in space-y-4">
      {/* Tier 1: Company Context Banner (Super Admin Only) + Header */}
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

      {/* Header Section */}
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

      {/* Tier 2: Active Sessions + Session Details/Map (50/50 Split) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Active Alerts + Active Sessions List */}
        <div className="space-y-4">
          {/* Active Alerts - Top 50% - SCROLLABLE */}
          <div className="max-h-[400px] overflow-y-auto">
            {(() => {
              try {
                console.log('Rendering ActiveAlertsPanel');
                return <ActiveAlertsPanel />;
              } catch (error) {
                console.error('Error rendering ActiveAlertsPanel:', error);
                return (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-red-600">Error loading alerts panel</p>
                    </CardContent>
                  </Card>
                );
              }
            })()}
          </div>

          {/* Active Sessions List - Bottom 50% */}
          <div className="max-h-[400px] overflow-y-auto">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Active Sessions Today</h2>
                <p className="text-sm text-gray-600 mt-1">Real-time device session monitoring</p>
              </CardHeader>
              <CardContent>
                {(() => {
                  try {
                    console.log('Rendering ActiveSessionsGrid');
                    return <ActiveSessionsGrid
                      limit={20}
                      companyFilter={activeCompanyId}
                      onSessionSelect={handleSessionSelect}
                      selectedSessionId={selectedSessionId}
                    />;
                  } catch (error) {
                    console.error('Error rendering ActiveSessionsGrid:', error);
                    return <p className="text-red-600">Error loading active sessions</p>;
                  }
                })()}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Session Details + Map */}
        <div className="space-y-4">
          {/* Session Details Panel */}
          <div className="max-h-[400px] overflow-y-auto">
            <SessionDetailsPanel
              selectedSession={selectedSessionData}
              sessionId={selectedSessionId || ''}
            />
          </div>

          {/* Site Map */}
          {selectedSessionData && sessionSiteData && (
            <Card className="min-h-[500px]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold">Site Map</h3>
                </div>
                <p className="text-sm text-gray-600 mt-1">Device positions and live metrics</p>
              </CardHeader>
              <CardContent>
                {devicesLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : sessionDevices.length > 0 &&
                     sessionSiteData?.length &&
                     sessionSiteData.length > 0 &&
                     sessionSiteData?.width &&
                     sessionSiteData.width > 0 ? (
                  <SiteMapAnalyticsViewer
                    siteLength={sessionSiteData.length}
                    siteWidth={sessionSiteData.width}
                    siteName={sessionSiteData.name}
                    devices={sessionDevices}
                    onDeviceClick={(deviceId) => {
                      navigate(`/devices/${deviceId}`);
                    }}
                    showControls={true}
                  />
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <MapPin className="mx-auto h-16 w-16 text-gray-300" />
                    <p className="text-gray-600 mt-4 font-medium">Site Map Not Ready</p>
                    <p className="text-sm text-gray-500 mt-2">
                      {!sessionSiteData?.length || sessionSiteData.length <= 0 || !sessionSiteData?.width || sessionSiteData.width <= 0
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
    </div>
    );
  } catch (error: any) {
    console.error('HomePage: Caught render error:', error);
    // Set error state to trigger error display on next render
    setTimeout(() => setRenderError(error), 0);
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-bold text-red-800 mb-2">Unexpected Error</h2>
        <p className="text-red-600">{error?.message || 'An unknown error occurred'}</p>
      </div>
    );
  }
};

export default HomePage;
