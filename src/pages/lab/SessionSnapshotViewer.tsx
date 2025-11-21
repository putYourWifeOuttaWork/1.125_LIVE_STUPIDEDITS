import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import SiteMapAnalyticsViewer from '../../components/lab/SiteMapAnalyticsViewer';
import { TimelineController } from '../../components/lab/TimelineController';
import { MGILegend } from '../../components/lab/MGILegend';
import ZoneAnalytics from '../../components/lab/ZoneAnalytics';
import { useSiteSnapshots } from '../../hooks/useSiteSnapshots';
import { DeviceSnapshotData } from '../../lib/types';
import LoadingScreen from '../../components/common/LoadingScreen';
import { toast } from 'react-toastify';
import { ArrowLeft, RefreshCw, Calendar, MapPin, Activity } from 'lucide-react';
import Button from '../../components/common/Button';
import Card, { CardContent } from '../../components/common/Card';
import { format } from 'date-fns';

export default function SessionSnapshotViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [currentWakeNumber, setCurrentWakeNumber] = useState(1);
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceSnapshotData | null>(null);
  const [zoneMode, setZoneMode] = useState<'temperature' | 'humidity' | 'battery' | 'none'>('temperature');

  // Fetch ALL snapshots for the site (not just this session)
  const { snapshots: allSiteSnapshots, loading, error, refetch } = useSiteSnapshots(
    sessionInfo?.site_id || null,
    sessionInfo?.program_id || null
  );

  // Fetch session info
  useEffect(() => {
    if (!sessionId) return;

    const fetchSessionInfo = async () => {
      const { data, error } = await supabase
        .from('device_wake_sessions')
        .select(`
          *,
          sites!inner(name, length, width, height, program_id, wall_details, door_details, zones),
          pilot_programs!inner(name)
        `)
        .eq('session_id', sessionId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching session:', error);
        toast.error('Failed to load session details');
        return;
      }

      setSessionInfo(data);
    };

    fetchSessionInfo();
  }, [sessionId]);

  // Filter snapshots to only those for the current session
  const sessionSnapshots = useMemo(() => {
    return allSiteSnapshots.filter(s => s.session_id === sessionId);
  }, [allSiteSnapshots, sessionId]);

  // Process ALL site snapshots with site-wide LOCF (session-agnostic, device-specific)
  const processedSnapshots = useMemo(() => {
    if (allSiteSnapshots.length === 0) return [];

    const processed: any[] = [];
    const deviceStateCache = new Map<string, any>(); // device_id -> last known state

    // Already sorted by wake_round_start from the hook
    for (const snapshot of allSiteSnapshots) {
      try {
        const siteState = snapshot.site_state;
        const currentDevices = siteState?.devices || [];

        // Update cache with new data from this snapshot
        currentDevices.forEach((device: any) => {
          const deviceId = device.device_id;
          const cachedState = deviceStateCache.get(deviceId) || {};

          // Helper: Use new value if it's not null/0/undefined, otherwise keep cached
          const carryForward = (newVal: any, cachedVal: any) => {
            if (newVal !== null && newVal !== undefined && newVal !== 0) {
              return newVal;
            }
            return cachedVal;
          };

          // Merge with LOCF rules: ignore null/0 from new data, keep old data
          deviceStateCache.set(deviceId, {
            device_id: device.device_id,
            device_code: device.device_code,
            device_name: carryForward(device.device_name, cachedState.device_name),
            position: device.position || cachedState.position,
            status: carryForward(device.status, cachedState.status) || 'active',
            last_seen_at: device.last_seen_at || cachedState.last_seen_at,
            battery_health_percent: carryForward(
              device.battery_health_percent,
              cachedState.battery_health_percent
            ),
            telemetry: {
              latest_temperature: carryForward(
                device.telemetry?.latest_temperature,
                cachedState.telemetry?.latest_temperature
              ),
              latest_humidity: carryForward(
                device.telemetry?.latest_humidity,
                cachedState.telemetry?.latest_humidity
              ),
            },
            mgi_state: {
              latest_mgi_score: carryForward(
                device.mgi_state?.latest_mgi_score,
                cachedState.mgi_state?.latest_mgi_score
              ),
              mgi_velocity: carryForward(
                device.mgi_state?.mgi_velocity,
                cachedState.mgi_state?.mgi_velocity
              ),
            },
          });
        });

        // Build complete device list from cache
        const completeDevices = Array.from(deviceStateCache.values())
          .filter(d => d.position && d.position.x !== null && d.position.y !== null);

        processed.push({
          ...snapshot,
          site_state: {
            ...siteState,
            devices: completeDevices,
          },
        });
      } catch (error) {
        console.error('Error processing snapshot:', error);
        processed.push(snapshot);
      }
    }

    return processed;
  }, [allSiteSnapshots]);

  // Get only processed snapshots for current session, indexed by wake_number
  const currentSessionProcessedSnapshots = useMemo(() => {
    return processedSnapshots.filter(s => s.session_id === sessionId);
  }, [processedSnapshots, sessionId]);

  // Get current snapshot from processed session snapshots
  const currentSnapshot = useMemo(() => {
    return currentSessionProcessedSnapshots.find((s) => s.wake_number === currentWakeNumber);
  }, [currentSessionProcessedSnapshots, currentWakeNumber]);

  // Extract site layout from session info
  const siteLayout = useMemo(() => {
    if (!sessionInfo?.sites) return null;

    return {
      length: sessionInfo.sites.length || 100,
      width: sessionInfo.sites.width || 100,
      height: sessionInfo.sites.height || 10,
      wall_details: sessionInfo.sites.wall_details || [],
      door_details: sessionInfo.sites.door_details || [],
      platform_details: [],
      zones: sessionInfo.sites.zones || [],
    };
  }, [sessionInfo]);

  // Get devices from processed snapshot or empty array
  const devices = currentSnapshot?.site_state?.devices || [];

  // Get wake timestamps from current session's processed snapshots
  const wakeTimestamps = useMemo(() => {
    return currentSessionProcessedSnapshots.map((s) => s.wake_round_start);
  }, [currentSessionProcessedSnapshots]);

  const handleDeviceClick = (device: DeviceSnapshotData) => {
    setSelectedDevice(device);
  };

  if (loading && !sessionInfo) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error Loading Snapshots</h3>
          <p className="text-red-600 text-sm mt-1">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="mt-3">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!sessionInfo || !siteLayout) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">Session not found or no site data available.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="mt-3">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const totalWakes = currentSessionProcessedSnapshots.length || 24; // Default to 24 if no snapshots yet

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Session Wake Snapshot Viewer
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{sessionInfo.sites.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>
                  {format(new Date(sessionInfo.session_date), 'MMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="w-4 h-4" />
                <span>{currentSessionProcessedSnapshots.length} snapshots loaded</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left sidebar - Legend */}
        <div className="col-span-12 lg:col-span-3">
          <MGILegend />
        </div>

        {/* Center - Site Map */}
        <div className="col-span-12 lg:col-span-6">
          {/* Zone Mode Selector */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Site Map</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Zones:</span>
              <select
                value={zoneMode}
                onChange={(e) => setZoneMode(e.target.value as any)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="temperature">Temperature</option>
                <option value="humidity">Humidity</option>
                <option value="battery">Battery</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          {siteLayout && (
            <SiteMapAnalyticsViewer
              siteLength={siteLayout.length}
              siteWidth={siteLayout.width}
              siteName={sessionInfo?.sites?.name || 'Site'}
              devices={devices}
              showControls={false}
              height={500}
              zoneMode={zoneMode}
              onDeviceClick={(deviceId) => {
                const device = devices.find(d => d.device_id === deviceId);
                if (device) handleDeviceClick(device);
              }}
            />
          )}

          {/* Timeline Controller */}
          <div className="mt-4">
            <TimelineController
              totalWakes={totalWakes}
              currentWake={currentWakeNumber}
              onWakeChange={setCurrentWakeNumber}
              wakeTimestamps={wakeTimestamps}
              autoPlaySpeed={2000}
            />
          </div>

          {/* Zone Analytics */}
          {zoneMode !== 'none' && devices.length >= 2 && (
            <div className="mt-4">
              <ZoneAnalytics devices={devices} zoneMode={zoneMode as any} />
            </div>
          )}

          {/* No snapshot warning */}
          {!currentSnapshot && currentSessionProcessedSnapshots.length > 0 && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 text-sm">
                No snapshot available for wake #{currentWakeNumber}.
              </p>
            </div>
          )}
        </div>

        {/* Right sidebar - Device Details */}
        <div className="col-span-12 lg:col-span-3">
          {selectedDevice ? (
            <Card>
              <CardContent>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  {selectedDevice.device_name}
                </h3>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">MGI Score</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {selectedDevice.mgi_score !== null
                        ? selectedDevice.mgi_score.toFixed(3)
                        : 'N/A'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Temperature</div>
                      <div className="text-sm font-semibold text-gray-800">
                        {selectedDevice.temperature !== null
                          ? `${selectedDevice.temperature.toFixed(1)}°F`
                          : 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Humidity</div>
                      <div className="text-sm font-semibold text-gray-800">
                        {selectedDevice.humidity !== null
                          ? `${selectedDevice.humidity.toFixed(1)}%`
                          : 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Battery</div>
                      <div className="text-sm font-semibold text-gray-800">
                        {selectedDevice.battery_voltage !== null
                          ? `${selectedDevice.battery_voltage.toFixed(2)}V`
                          : 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Status</div>
                      <div className="text-sm font-semibold text-gray-800 capitalize">
                        {selectedDevice.status}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Position</div>
                    <div className="text-sm text-gray-700">
                      ({selectedDevice.x_position}, {selectedDevice.y_position})
                    </div>
                  </div>

                  {selectedDevice.mgi_velocity !== null && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">MGI Velocity</div>
                      <div className="text-sm text-gray-700">
                        {selectedDevice.mgi_velocity.toFixed(4)} / wake
                      </div>
                    </div>
                  )}

                  {selectedDevice.placement_notes && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Notes</div>
                      <div className="text-sm text-gray-700">
                        {selectedDevice.placement_notes}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <div className="text-center text-gray-500 py-8">
                  <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    Click a device on the map to view details
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Session Summary */}
          {currentSnapshot?.site_state?.session_summary && (
            <Card className="mt-4">
              <CardContent>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Session Summary
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Devices:</span>
                    <span className="font-semibold text-gray-900">
                      {currentSnapshot.site_state.session_summary.total_devices}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active:</span>
                    <span className="font-semibold text-gray-900">
                      {currentSnapshot.site_state.session_summary.active_devices}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg MGI:</span>
                    <span className="font-semibold text-gray-900">
                      {currentSnapshot.site_state.session_summary.avg_mgi !== null
                        ? currentSnapshot.site_state.session_summary.avg_mgi.toFixed(3)
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">High Risk:</span>
                    <span className="font-semibold text-red-600">
                      {currentSnapshot.site_state.session_summary.high_risk_device_count}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
