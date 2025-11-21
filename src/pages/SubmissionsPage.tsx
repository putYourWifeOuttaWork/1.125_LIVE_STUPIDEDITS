import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { Plus, Search, ArrowLeft, Settings, History, FileText } from 'lucide-react';
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

        // Fetch latest telemetry
        const devicesWithTelemetry = await Promise.all(
          (data || []).map(async (device) => {
            const { data: telemetryData } = await supabase
              .from('device_telemetry')
              .select('temperature, humidity')
              .eq('device_id', device.device_id)
              .order('captured_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            return {
              device_id: device.device_id,
              device_code: device.device_code,
              device_name: device.device_name,
              x: device.x_position,
              y: device.y_position,
              battery_level: device.battery_health_percent,
              status: device.is_active ? 'active' : 'inactive',
              last_seen: device.last_seen_at,
              temperature: telemetryData?.temperature || null,
              humidity: telemetryData?.humidity || null,
              mgi_score: device.latest_mgi_score,
              mgi_velocity: device.latest_mgi_velocity,
            };
          })
        );

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

      {/* Site Map with Zones */}
      {selectedSite && selectedSite.length && selectedSite.width && siteDevices.length > 0 && (
        <div className="mb-4 md:mb-6">
          <SiteMapAnalyticsViewer
            siteLength={selectedSite.length}
            siteWidth={selectedSite.width}
            siteName={selectedSite.name}
            devices={siteDevices}
            showControls={true}
            height={300}
            zoneMode={zoneMode}
            onZoneModeChange={setZoneMode}
          />
          {zoneMode !== 'none' && siteDevices.length >= 2 && (
            <ZoneAnalytics devices={siteDevices} zoneMode={zoneMode} />
          )}
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
            // Render device submission card
            if (submission.submission_type === 'device' && submission.device_submission) {
              return (
                <DeviceSubmissionCard
                  key={submission.submission_id}
                  submission={submission.device_submission}
                  programId={programId || ''}
                  siteId={siteId || ''}
                  testId={`device-submission-card-${submission.submission_id}`}
                />
              );
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