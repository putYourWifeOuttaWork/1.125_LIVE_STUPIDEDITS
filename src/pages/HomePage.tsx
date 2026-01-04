import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Building,
  MapPin,
  ClipboardList,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import usePilotPrograms from '../hooks/usePilotPrograms';
import useCompanies from '../hooks/useCompanies';
import LoadingScreen from '../components/common/LoadingScreen';
import { supabase } from '../lib/supabaseClient';
import { PilotProgram, Site } from '../lib/types';
import { toast } from 'react-toastify';
import { useSessionStore } from '../stores/sessionStore';
import ActiveAlertsPanel from '../components/devices/ActiveAlertsPanel';
import ActiveSessionsGrid from '../components/devices/ActiveSessionsGrid';
import SiteMapAnalyticsViewer from '../components/lab/SiteMapAnalyticsViewer';
import { useActiveCompany } from '../hooks/useActiveCompany';

const HomePage = () => {
  const navigate = useNavigate();
  const { programs, isLoading: programsLoading } = usePilotPrograms();
  const { userCompany, isAdmin: isCompanyAdmin, loading: companyLoading } = useCompanies();
  const { activeCompanyId, isSuperAdmin } = useActiveCompany();

  const isInitialProgramSelectionDone = useRef(false);
  const isInitialSiteSelectionDone = useRef(false);

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<PilotProgram | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [siteDevices, setSiteDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const {
    setIsSessionsDrawerOpen,
  } = useSessionStore();

  // Load devices for selected site
  useEffect(() => {
    const loadSiteDevices = async () => {
      if (!selectedSiteId) {
        setSiteDevices([]);
        return;
      }

      try {
        setDevicesLoading(true);

        const { data, error } = await supabase
          .from('devices')
          .select(`
            device_id,
            device_code,
            device_name,
            x_position,
            y_position,
            battery_health_percent,
            is_active,
            provisioning_status,
            last_seen_at,
            latest_mgi_score,
            latest_mgi_velocity
          `)
          .eq('site_id', selectedSiteId)
          .not('x_position', 'is', null)
          .not('y_position', 'is', null)
          .order('device_code');

        if (error) throw error;

        const deviceIds = (data || []).map(d => d.device_id);
        const { data: telemetryData } = await supabase
          .from('device_telemetry')
          .select('device_id, temperature, humidity, captured_at')
          .in('device_id', deviceIds)
          .order('captured_at', { ascending: false });

        const telemetryMap = new Map();
        (telemetryData || []).forEach(t => {
          if (!telemetryMap.has(t.device_id)) {
            telemetryMap.set(t.device_id, {
              temperature: t.temperature,
              humidity: t.humidity
            });
          }
        });

        const devicesWithTelemetry = (data || []).map((device) => {
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

        setSiteDevices(devicesWithTelemetry);
      } catch (error: any) {
        console.error('Error loading site devices:', error);
      } finally {
        setDevicesLoading(false);
      }
    };

    loadSiteDevices();
  }, [selectedSiteId]);

  // Pre-select the first active program when the page loads, but only once
  useEffect(() => {
    if (!programsLoading && programs.length > 0 && !selectedProgramId && !isInitialProgramSelectionDone.current) {
      const firstActiveProgram = programs.find(program => program.status === 'active');

      if (firstActiveProgram) {
        setSelectedProgramId(firstActiveProgram.program_id);
        setSelectedProgram(firstActiveProgram);
      }

      isInitialProgramSelectionDone.current = true;
    }
  }, [programs, programsLoading, selectedProgramId]);

  // Handle program selection
  const handleProgramSelect = useCallback((programId: string) => {
    if (selectedProgramId === programId) {
      setSelectedProgramId(null);
      setSelectedProgram(null);
      setSelectedSiteId(null);
      setSelectedSite(null);
    } else {
      setSelectedProgramId(programId);
    }
  }, [selectedProgramId]);

  // Handle site selection
  const handleSiteSelect = useCallback((siteId: string) => {
    if (selectedSiteId === siteId) {
      setSelectedSiteId(null);
      setSelectedSite(null);
      setIsMapExpanded(false);
    } else {
      setSelectedSiteId(siteId);
      setIsMapExpanded(true);
    }
  }, [selectedSiteId]);

  // Update selected program when program ID changes
  useEffect(() => {
    if (selectedProgramId && programs.length > 0) {
      const program = programs.find(p => p.program_id === selectedProgramId);
      setSelectedProgram(program || null);

      setSelectedSiteId(null);
      setSelectedSite(null);
      isInitialSiteSelectionDone.current = false;
    } else {
      setSelectedProgram(null);
    }
  }, [selectedProgramId, programs]);

  // Fetch sites when program is selected
  const loadSites = useCallback(async () => {
    if (!selectedProgramId) {
      setSites([]);
      return;
    }

    setSitesLoading(true);
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('program_id', selectedProgramId)
        .order('name');

      if (error) throw error;
      setSites(data || []);

      if (data && data.length > 0 && !selectedSiteId && !isInitialSiteSelectionDone.current) {
        setSelectedSiteId(data[0].site_id);
        setSelectedSite(data[0]);
        isInitialSiteSelectionDone.current = true;
      }
    } catch (error) {
      console.error('Error loading sites:', error);
      toast.error('Failed to load sites');
    } finally {
      setSitesLoading(false);
    }
  }, [selectedProgramId, selectedSiteId]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  // Update selected site when site ID changes
  useEffect(() => {
    if (selectedSiteId && sites.length > 0) {
      const site = sites.find(s => s.site_id === selectedSiteId);
      setSelectedSite(site || null);
    } else {
      setSelectedSite(null);
    }
  }, [selectedSiteId, sites]);

  // Handle quick log button
  const handleQuickLog = useCallback(() => {
    if (!selectedSite || !selectedProgram) {
      toast.warning('Please select a site first');
      return;
    }

    navigate(`/programs/${selectedProgram.program_id}/sites/${selectedSite.site_id}/new-submission`);
  }, [selectedSite, selectedProgram, navigate]);

  if (programsLoading || companyLoading) {
    return <LoadingScreen />;
  }

  const activePrograms = programs.filter(program => program.status === 'active');

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

      {/* Tier 2: Active Alerts (Full Width) - MOST PROMINENT */}
      <ActiveAlertsPanel />

      {/* Tier 3: Active Sessions Grid (2/3 width) + Program/Site Selector (1/3 width) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Active Sessions Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Active Sessions Today</h2>
              <p className="text-sm text-gray-600 mt-1">Real-time device session monitoring</p>
            </CardHeader>
            <CardContent>
              <ActiveSessionsGrid limit={9} companyFilter={activeCompanyId} />
            </CardContent>
          </Card>
        </div>

        {/* Right: Program/Site Quick Selector */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Quick Selector</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Program Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Program
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {activePrograms.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600">
                        No active programs
                      </p>
                    </div>
                  ) : (
                    activePrograms.slice(0, 4).map(program => (
                      <button
                        key={program.program_id}
                        onClick={() => handleProgramSelect(program.program_id)}
                        className={`p-2 rounded-md text-left transition-colors text-sm ${
                          selectedProgramId === program.program_id
                            ? 'bg-blue-100 border-blue-200 border text-blue-900'
                            : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <p className="font-medium truncate">{program.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {program.total_sites} Sites
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Site Selector */}
              {selectedProgramId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Site
                  </label>
                  {sitesLoading ? (
                    <div className="flex justify-center p-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : sites.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center p-4 bg-gray-50 rounded-md">
                      No sites in this program
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {sites.slice(0, 4).map(site => (
                        <button
                          key={site.site_id}
                          onClick={() => handleSiteSelect(site.site_id)}
                          className={`p-2 rounded-md text-left transition-colors text-sm ${
                            selectedSiteId === site.site_id
                              ? 'bg-green-100 border-green-200 border text-green-900'
                              : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <p className="font-medium truncate">{site.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {site.total_petris} samples
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Create Submission Button */}
              {selectedSite && (
                <Button
                  variant="primary"
                  onClick={handleQuickLog}
                  icon={<Plus size={16} />}
                  className="w-full"
                >
                  Create Submission
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier 4: Site Map (Collapsible Accordion) */}
      {selectedSite && (
        <Card>
          <CardHeader>
            <button
              onClick={() => setIsMapExpanded(!isMapExpanded)}
              className="w-full flex items-center justify-between hover:bg-gray-50 -m-4 p-4 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <h2 className="text-lg font-semibold">{selectedSite.name} - Site Map</h2>
                  <p className="text-sm text-gray-600">Device positions and environmental zones</p>
                </div>
              </div>
              {isMapExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
          </CardHeader>

          {isMapExpanded && (
            <CardContent>
              {devicesLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : siteDevices.length > 0 && selectedSite.length && selectedSite.width ? (
                <SiteMapAnalyticsViewer
                  siteLength={selectedSite.length}
                  siteWidth={selectedSite.width}
                  siteName={selectedSite.name}
                  devices={siteDevices}
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
                    {!selectedSite.length || !selectedSite.width
                      ? 'Site dimensions need to be configured'
                      : 'No devices have been placed on this site map yet'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
};

export default HomePage;
