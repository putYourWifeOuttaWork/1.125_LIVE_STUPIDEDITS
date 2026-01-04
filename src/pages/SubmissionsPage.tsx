import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { Plus, Search, ArrowLeft, Settings, History, FileText, MapPin } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import LoadingScreen from '../components/common/LoadingScreen';
import { useSites } from '../hooks/useSites';
import { usePilotPrograms } from '../hooks/usePilotPrograms';
import useUserRole from '../hooks/useUserRole';
import PermissionModal from '../components/common/PermissionModal';
import SiteCard from '../components/sites/SiteCard';
import { Site } from '../lib/types';
import { toast } from 'react-toastify';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import SubmissionCard from '../components/submissions/SubmissionCard';
import DeviceSubmissionCard, { DeviceSubmission } from '../components/submissions/DeviceSubmissionCard';
import { useSubmissions } from '../hooks/useSubmissions';
import { useSiteDeviceSessions } from '../hooks/useSiteDeviceSessions';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import SubmissionCardSkeleton from '../components/submissions/SubmissionCardSkeleton';
import { supabase } from '../lib/supabaseClient';
import { debounce } from '../utils/helpers';
import SiteMapAnalyticsViewer from '../components/lab/SiteMapAnalyticsViewer';
import ZoneAnalytics from '../components/lab/ZoneAnalytics';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import { TimelineController } from '../components/lab/TimelineController';
import { useSiteSnapshots } from '../hooks/useSiteSnapshots';
import { useMemo } from 'react';
import SiteDeviceSessionCard from '../components/devices/SiteDeviceSessionCard';

const SubmissionsPage = () => {
  const navigate = useNavigate();
  const { programId, siteId } = useParams<{ programId: string, siteId: string }>();
  const { 
    selectedProgram, 
    setSelectedProgram, 
    selectedSite, 
    setSelectedSite,
  } = usePilotProgramStore();
  const { fetchSite, loading: siteLoading } = useSites(programId);
  const { fetchPilotProgram, loading: programLoading } = usePilotPrograms();
  const { canCreateSubmission, canDeleteSubmission, canManageSiteTemplates, canViewAuditLog } = useUserRole({ programId });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [submissionToDelete, setSubmissionToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [sessionStatuses, setSessionStatuses] = useState<{ [key: string]: string }>({});
  const [lastActivityTimes, setLastActivityTimes] = useState<{ [key: string]: string }>({});
  const [searchDelayCompleted, setSearchDelayCompleted] = useState(true);
  const queryClient = useQueryClient();
  const [siteDevices, setSiteDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [zoneMode, setZoneMode] = useState<'none' | 'temperature' | 'humidity' | 'battery'>('temperature');
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(0);
  const [timelineMode, setTimelineMode] = useState<'live' | 'timeline'>('live');
  const [transitionProgress, setTransitionProgress] = useState(1); // 0 = start of transition, 1 = end
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Load aggregated wake snapshots for this site + program (4 per day max to prevent performance issues)
  const { snapshots, loading: snapshotsLoading } = useSiteSnapshots(siteId || null, programId || null, { aggregated: true, snapshotsPerDay: 4 });

  // Easing function for smooth transitions (ease-in-out)
  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Interpolate between two values
  const lerp = (start: number | null, end: number | null, progress: number): number | null => {
    if (start === null || end === null) return end;
    const easedProgress = easeInOutCubic(progress);
    return start + (end - start) * easedProgress;
  };

  // Transform snapshot data for timeline mode with smooth transitions
  const displayDevices = useMemo(() => {
    if (timelineMode !== 'timeline' || snapshots.length === 0) {
      return [];
    }

    const currentSnapshot = snapshots[currentSnapshotIndex];
    if (!currentSnapshot || !currentSnapshot.site_state) {
      return [];
    }

    try {
      const currentState = typeof currentSnapshot.site_state === 'string'
        ? JSON.parse(currentSnapshot.site_state)
        : currentSnapshot.site_state;

      const currentDevices = currentState.devices || [];

      // Get next snapshot for interpolation
      const nextSnapshot = snapshots[currentSnapshotIndex + 1];
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

      console.log('[SubmissionsPage] Snapshot device sample:', currentDevices[0]);
      console.log('[SubmissionsPage] Transition progress:', transitionProgress);

      const transformedDevices = currentDevices
        .filter((d: any) => d.position && d.position.x !== null && d.position.y !== null)
        .map((d: any) => {
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

          const transformed = {
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
          return transformed;
        });

      console.log('[SubmissionsPage] Transformed device sample:', transformedDevices[0]);
      return transformedDevices;
    } catch (error) {
      console.error('Error parsing snapshot data:', error);
      return [];
    }
  }, [snapshots, currentSnapshotIndex, timelineMode, transitionProgress]);

  // Animate transitions between snapshots
  useEffect(() => {
    if (timelineMode !== 'timeline') return;

    // Reset transition to start
    setTransitionProgress(0);
    setIsTransitioning(true);

    const transitionDuration = 500; // 500ms smooth transition
    const frameRate = 60; // 60fps
    const totalFrames = (transitionDuration / 1000) * frameRate;
    const increment = 1 / totalFrames;

    let frame = 0;
    const animationInterval = setInterval(() => {
      frame++;
      const progress = Math.min(frame * increment, 1);
      setTransitionProgress(progress);

      if (progress >= 1) {
        clearInterval(animationInterval);
        setIsTransitioning(false);
      }
    }, 1000 / frameRate);

    return () => clearInterval(animationInterval);
  }, [currentSnapshotIndex, timelineMode]);

  // Use the useSubmissions hook to get access to submissions and related functions
  const {
    submissions,
    loading: submissionsLoading,
    fetchSubmissions,
    deleteSubmission
  } = useSubmissions(siteId);

  // Fetch device submissions for this site
  const {
    sessions: deviceSessions,
    isLoading: deviceSessionsLoading,
    refetchSessions: refetchDeviceSessions
  } = useSiteDeviceSessions(siteId);

  // Load devices for site map
  useEffect(() => {
    const loadSiteDevices = async () => {
      if (!siteId) {
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
            last_seen_at,
            latest_mgi_score,
            latest_mgi_velocity
          `)
          .eq('site_id', siteId)
          .not('x_position', 'is', null)
          .not('y_position', 'is', null)
          .order('device_code');

        if (error) throw error;

        // Batch fetch latest telemetry for all devices
        const deviceIds = (data || []).map(d => d.device_id);
        const { data: telemetryData } = await supabase
          .from('device_telemetry')
          .select('device_id, temperature, humidity, captured_at')
          .in('device_id', deviceIds)
          .order('captured_at', { ascending: false });

        // Create a map of device_id to latest telemetry
        const telemetryMap = new Map();
        (telemetryData || []).forEach(t => {
          if (!telemetryMap.has(t.device_id)) {
            telemetryMap.set(t.device_id, {
              temperature: t.temperature,
              humidity: t.humidity
            });
          }
        });

        // Combine device data with telemetry
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
  }, [siteId]);
  
  // Session status query
  const sessionStatusesQuery = useQuery({
    queryKey: ['sessionStatuses', submissions?.map(s => s.submission_id)],
    queryFn: async () => {
      if (!submissions || submissions.length === 0) return {};
      
      const submissionIds = submissions.map(s => s.submission_id);
      
      const { data, error } = await supabase
        .from('submission_sessions')
        .select('submission_id, session_status, last_activity_time')
        .in('submission_id', submissionIds);
        
      if (error) throw error;
      
      // Create lookup maps
      const statusMap: { [key: string]: string } = {};
      const activityMap: { [key: string]: string } = {};
      
      if (data && data.length > 0) {
        data.forEach(session => {
          statusMap[session.submission_id] = session.session_status;
          activityMap[session.submission_id] = session.last_activity_time;
        });
      }
      
      return { statusMap, activityMap };
    },
    enabled: !!submissions && submissions.length > 0,
    staleTime: 60000, // 1 minute
  });
  
  // Handle search with debounce
  const debouncedSearch = debounce((query: string) => {
    setDebouncedSearchQuery(query);
    setSearchDelayCompleted(true);
  }, 300);
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setSearchDelayCompleted(false);
    debouncedSearch(e.target.value);
  };

  // Use useCallback to memoize the loadProgramAndSite function
  const loadProgramAndSite = useCallback(async () => {
    if (!programId || !siteId) return;
    
    // Define the conditions for fetching program and site
    const shouldFetchProgram = !selectedProgram || selectedProgram.program_id !== programId;
    const shouldFetchSite = !selectedSite || selectedSite.site_id !== siteId;
    
    // Only fetch the program if needed
    if (shouldFetchProgram) {
      const program = await fetchPilotProgram(programId);
      if (program) {
        setSelectedProgram(program);
      } else {
        navigate('/programs');
        return;
      }
    }
    
    // Only fetch the site if needed
    if (shouldFetchSite) {
      const site = await fetchSite(siteId);
      if (site) {
        setSelectedSite(site);
      } else {
        navigate(`/programs/${programId}/sites`);
        return;
      }
    }
  }, [programId, siteId, selectedProgram, selectedSite, fetchPilotProgram, fetchSite, setSelectedProgram, setSelectedSite, navigate]);

  // Initialize the component only once
  useEffect(() => {
    if (!hasInitialized) {
      loadProgramAndSite();
      setHasInitialized(true);
    }
  }, [hasInitialized, loadProgramAndSite]);

  // Update when route parameters change
  useEffect(() => {
    if (hasInitialized && (
      (selectedProgram?.program_id !== programId) ||
      (selectedSite?.site_id !== siteId)
    )) {
      loadProgramAndSite();
    }
  }, [programId, siteId, selectedProgram, selectedSite, loadProgramAndSite, hasInitialized]);

  // Effect to update session statuses from query results
  useEffect(() => {
    if (sessionStatusesQuery.data) {
      if (sessionStatusesQuery.data.statusMap) {
        setSessionStatuses(sessionStatusesQuery.data.statusMap);
      }
      if (sessionStatusesQuery.data.activityMap) {
        setLastActivityTimes(sessionStatusesQuery.data.activityMap);
      }
    }
  }, [sessionStatusesQuery.data]);

  const handleNewSubmission = () => {
    if (canCreateSubmission) {
      navigate(`/programs/${programId}/sites/${siteId}/new-submission`);
    } else {
      setPermissionMessage("You don't have permission to create new submissions. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };

  const handleViewSubmission = async (submission: any) => {
    navigate(`/programs/${programId}/sites/${siteId}/submissions/${submission.submission_id}/edit`);
  };

  const handleDeleteSubmission = (submission: any) => {
    if (canDeleteSubmission) {
      setSubmissionToDelete(submission);
    } else {
      setPermissionMessage("You don't have permission to delete submissions. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };
  
  const confirmDeleteSubmission = async () => {
    if (!submissionToDelete) return;
    
    setIsDeleting(true);
    try {
      const success = await deleteSubmission(submissionToDelete.submission_id);
      if (success) {
        toast.success('Submission deleted successfully');
        setSubmissionToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleManageTemplate = () => {
    if (canManageSiteTemplates) {
      navigate(`/programs/${programId}/sites/${siteId}/template`);
    } else {
      setPermissionMessage("You don't have permission to manage site templates. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };
  
  const handleViewSiteAuditLog = () => {
    if (canViewAuditLog) {
      navigate(`/programs/${programId}/sites/${siteId}/audit-log`);
    } else {
      setPermissionMessage("You don't have permission to view the audit log. Please contact your program administrator for access.");
      setShowPermissionModal(true);
    }
  };

  // Merge manual submissions and device submissions into unified list
  type UnifiedSubmission = typeof submissions[0] & { submission_type: 'manual' | 'device'; device_submission?: DeviceSubmission };

  const allSubmissions: UnifiedSubmission[] = [
    // Manual submissions
    ...submissions.map(sub => ({
      ...sub,
      submission_type: 'manual' as const,
      created_at: sub.created_at || new Date().toISOString()
    })),
    // Device submissions (map to match submission structure for sorting)
    ...deviceSessions.map(session => ({
      submission_id: session.session_id,
      site_id: session.site_id,
      program_id: session.program_id,
      created_at: session.created_at,
      submission_type: 'device' as const,
      device_submission: session,
      global_submission_id: null,
      notes: null,
      temperature: null,
      humidity: null,
    } as UnifiedSubmission))
  ].sort((a, b) => {
    // Sort by created_at descending (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Filter out cancelled sessions and apply search
  const filteredSubmissions = debouncedSearchQuery && searchDelayCompleted
    ? allSubmissions
        .filter(submission => {
          // Filter out cancelled manual sessions
          if (submission.submission_type === 'manual') {
            return !sessionStatuses[submission.submission_id] ||
              sessionStatuses[submission.submission_id] !== 'Cancelled';
          }
          return true; // Include all device submissions
        })
        .filter(submission => {
          // Apply search filter
          if (submission.submission_type === 'manual') {
            return (submission.notes && submission.notes.toLowerCase().includes(debouncedSearchQuery.toLowerCase())) ||
              submission.submission_id.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
              (submission.global_submission_id &&
               submission.global_submission_id.toString().includes(debouncedSearchQuery));
          } else {
            // Search device submissions by session date or ID
            return submission.submission_id.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
          }
        })
    : allSubmissions.filter(submission => {
        // Just filter out cancelled sessions when no search query
        if (submission.submission_type === 'manual') {
          return !sessionStatuses[submission.submission_id] ||
            sessionStatuses[submission.submission_id] !== 'Cancelled';
        }
        return true;
      });

  // Only show loading screen on initial load when we have no data
  if ((programLoading || submissionsLoading) && !selectedProgram) {
    return <LoadingScreen />;
  }

  if (!selectedProgram || !selectedSite) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Data not found. Please return to the previous page.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate(`/programs/${programId}/sites`)}
        >
          Go to Sites
        </Button>
      </div>
    );
  }

  const isLoading = submissionsLoading || deviceSessionsLoading || sessionStatusesQuery.isLoading || !searchDelayCompleted;
  const hasAnyData = submissions.length > 0 || deviceSessions.length > 0;

  return (
    <div className="animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-6 gap-2">
        <div className="flex items-center">
          <button
            onClick={() => navigate(`/programs/${programId}/sites`)}
            className="mr-3 p-2 rounded-full hover:bg-gray-100"
            aria-label="Go back to sites"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">{selectedSite.name}</h1>
            <p className="text-sm md:text-base text-gray-600 mt-0.5">{selectedSite.type} - Submissions History</p>
          </div>
        </div>
        
        {/* Desktop action buttons */}
        <div className="hidden md:flex space-x-3">
          {canViewAuditLog && (
            <Button 
              variant="outline" 
              icon={<History size={18} />}
              onClick={handleViewSiteAuditLog}
              testId="view-site-audit-log-button"
            >
              Audit Log
            </Button>
          )}
          {canManageSiteTemplates && (
            <Button 
              variant="outline" 
              icon={<Settings size={18} />}
              onClick={handleManageTemplate}
              testId="manage-template-button"
            >
              Manage Template
            </Button>
          )}
          <Button 
            variant="primary" 
            icon={<Plus size={18} />}
            onClick={handleNewSubmission}
            testId="new-submission-button"
          >
            New Submission
          </Button>
        </div>
      </div>

      {/* Site Map with Timeline */}
      {selectedSite && selectedSite.length && selectedSite.width && (
        <div className="mb-4 md:mb-6 space-y-4">
          {/* Site Timeline Summary */}
          {snapshots.length > 0 && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Total Snapshots:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {snapshots.length}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div>
                      <span className="text-gray-500">Date Range:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {format(new Date(snapshots[0].wake_round_start), 'MMM d, yyyy')} - {format(new Date(snapshots[snapshots.length - 1].wake_round_start), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div>
                      <span className="text-gray-500">Active Devices:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {snapshots[currentSnapshotIndex]?.active_devices_count || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline Controller - ABOVE the map */}
          {snapshots.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  variant={timelineMode === 'live' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setTimelineMode('live')}
                >
                  Live View
                </Button>
                <Button
                  variant={timelineMode === 'timeline' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setTimelineMode('timeline')}
                  disabled={snapshots.length === 0}
                >
                  Timeline Playback ({snapshots.length} snapshots)
                </Button>
              </div>

              {timelineMode === 'timeline' && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">
                    Snapshot {currentSnapshotIndex + 1} of {snapshots.length}
                    {snapshots[currentSnapshotIndex] && (
                      <span className="ml-2">
                        ({format(new Date(snapshots[currentSnapshotIndex].wake_round_start), 'MMM d, yyyy h:mm a')})
                      </span>
                    )}
                  </div>
                  <TimelineController
                    totalWakes={snapshots.length}
                    currentWake={currentSnapshotIndex + 1}
                    onWakeChange={(wakeNum) => setCurrentSnapshotIndex(Math.max(0, Math.min(snapshots.length - 1, wakeNum - 1)))}
                    wakeTimestamps={snapshots.map(s => s.wake_round_start)}
                    autoPlaySpeed={2000}
                  />
                </div>
              )}
            </div>
          )}

          {/* Site Map */}
          {devicesLoading ? (
            <Card>
              <CardContent>
                <div className="flex justify-center items-center py-20">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">Loading site map...</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : ((timelineMode === 'live' && siteDevices.length > 0) || (timelineMode === 'timeline' && displayDevices.length > 0)) ? (
            <SiteMapAnalyticsViewer
              siteLength={selectedSite.length}
              siteWidth={selectedSite.width}
              siteName={selectedSite.name}
              devices={timelineMode === 'live' ? siteDevices : displayDevices}
              showControls={true}
              height={375}
              zoneMode={zoneMode}
              onZoneModeChange={setZoneMode}
              onDeviceClick={(deviceId) => navigate(`/devices/${deviceId}`)}
            />
          ) : timelineMode === 'live' && siteDevices.length === 0 && !devicesLoading ? (
            <Card>
              <CardContent>
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <MapPin className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="text-gray-600 mt-3 font-medium">No Devices on Map</p>
                  <p className="text-sm text-gray-500 mt-1">
                    No devices have been placed on this site map yet.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Zone Analytics */}
          {zoneMode !== 'none' && ((timelineMode === 'live' && siteDevices.length >= 2) || (timelineMode === 'timeline' && displayDevices.length >= 2)) && (
            <ZoneAnalytics devices={timelineMode === 'live' ? siteDevices : displayDevices} zoneMode={zoneMode} />
          )}
        </div>
      )}

      {/* Device Sessions List */}
      {deviceSessions && deviceSessions.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Device Session History</h2>
            <span className="text-sm text-gray-500">{deviceSessions.length} sessions</span>
          </div>
          <div className="space-y-3">
            {deviceSessions.map((session) => (
              <SiteDeviceSessionCard
                key={session.session_id}
                session={session}
                testId={`device-session-card-${session.session_id}`}
              />
            ))}
          </div>
        </div>
      )}

      {hasAnyData && (
        <div className="relative mb-4 md:mb-6">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <Input
            type="text"
            placeholder="Search submissions by ID or notes..."
            defaultValue={searchQuery}
            onChange={handleSearchChange}
            className="pl-10"
            testId="submission-search-input"
          />
        </div>
      )}

      {!hasAnyData && !isLoading ? (
        <div className="text-center py-8 md:py-12 bg-gray-50 rounded-lg border border-gray-200" data-testid="empty-submissions-message">
          <FileText className="mx-auto h-10 w-10 md:h-12 md:w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No submissions yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first submission for this site.</p>
          <div className="mt-4 md:mt-6">
            <Button 
              variant="primary"
              icon={<Plus size={16} />}
              onClick={handleNewSubmission}
              testId="empty-new-submission-button"
            >
              New Submission
            </Button>
          </div>
        </div>
      ) : filteredSubmissions.length === 0 && !isLoading ? (
        <div className="text-center py-6 md:py-8 bg-gray-50 rounded-lg border border-gray-200" data-testid="no-search-results-message">
          <p className="text-gray-600">No submissions match your search</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => {
              setSearchQuery('');
              setDebouncedSearchQuery('');
            }}
            testId="clear-search-button"
          >
            Clear search
          </Button>
        </div>
      ) : isLoading ? (
        // Show skeleton loader during loading
        <SubmissionCardSkeleton count={3} testId="submissions-loading-skeleton" />
      ) : (
        <div className="space-y-3 md:space-y-4" data-testid="submissions-list">
          {filteredSubmissions.map(submission => {
            // Skip device submissions - they're already shown in Device Session History above
            if (submission.submission_type === 'device') {
              return null;
            }

            // Render manual submission card
            const sessionStatus = sessionStatuses[submission.submission_id];
            const lastActivityTime = lastActivityTimes[submission.submission_id];

            return (
              <SubmissionCard
                key={submission.submission_id}
                submission={submission}
                onDelete={handleDeleteSubmission}
                canDelete={canDeleteSubmission}
                sessionStatus={sessionStatus}
                lastActivityTime={lastActivityTime}
                testId={`submission-card-${submission.submission_id}`}
              />
            );
          })}
        </div>
      )}
      
      {/* Mobile bottom action bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex justify-around z-10">
        {canViewAuditLog && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleViewSiteAuditLog}
            className="flex-1 mx-1 !py-2"
            icon={<History size={16} />}
          >
            Audit
          </Button>
        )}
        {canManageSiteTemplates && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleManageTemplate}
            className="flex-1 mx-1 !py-2"
            icon={<Settings size={16} />}
          >
            Template
          </Button>
        )}
        <Button 
          variant="primary" 
          size="sm"
          onClick={handleNewSubmission}
          className="flex-1 mx-1 !py-2"
          icon={<Plus size={16} />}
        >
          New
        </Button>
      </div>
      
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        message={permissionMessage}
      />

      <DeleteConfirmModal
        isOpen={!!submissionToDelete}
        onClose={() => setSubmissionToDelete(null)}
        onConfirm={confirmDeleteSubmission}
        title="Delete Submission"
        message={`Are you sure you want to delete this submission ${submissionToDelete?.global_submission_id ? `(#${submissionToDelete.global_submission_id})` : ''} from ${submissionToDelete ? format(new Date(submissionToDelete.created_at), 'PPp') : ''}? This will also delete all associated petri observations, gasifier observations, and images. This action cannot be undone.`}
        confirmText="Delete Submission"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default SubmissionsPage;