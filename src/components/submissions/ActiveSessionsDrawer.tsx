import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, X, PlusCircle, FileText, Plus, MapPin, Eye } from 'lucide-react';
import Button from '../common/Button';
import { useSessionStore } from '../../stores/sessionStore';
import { usePilotProgramStore } from '../../stores/pilotProgramStore';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import usePilotPrograms from '../../hooks/usePilotPrograms';
import { useSites } from '../../hooks/useSites';
import SkeletonLoader from '../common/SkeletonLoader';

interface DeviceSession {
  session_id: string;
  session_date: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  company_name: string;
  status: string;
  started_at: string;
  expected_items: number;
  completed_items: number;
  progress_percent: number;
  failed_wake_count: number;
  extra_wake_count: number;
}

interface ActiveSessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ActiveSessionsDrawer: React.FC<ActiveSessionsDrawerProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { selectedProgram, selectedSite } = usePilotProgramStore();
  const { isSessionsDrawerOpen, setIsSessionsDrawerOpen } = useSessionStore();

  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drawerProgramId, setDrawerProgramId] = useState<string | null>(null);
  const [drawerSiteId, setDrawerSiteId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const { programs, isLoading: programsLoading } = usePilotPrograms();
  const { sites, loading: sitesLoading } = useSites(drawerProgramId);

  useEffect(() => {
    if (isOpen) {
      loadDeviceSessions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && selectedProgram) {
      setDrawerProgramId(selectedProgram.program_id);
      if (selectedSite) {
        setDrawerSiteId(selectedSite.site_id);
      }
    }
  }, [isOpen, selectedProgram, selectedSite]);

  const loadDeviceSessions = async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('site_device_sessions')
        .select(`
          session_id,
          session_date,
          expected_wake_count,
          completed_wake_count,
          status,
          site_id,
          program_id,
          company_id,
          session_start_time,
          failed_wake_count,
          extra_wake_count,
          session_end_time,
          locked_at,
          sites!inner(name),
          pilot_programs!inner(name),
          companies!inner(name)
        `)
        .in('status', ['in_progress'])
        .gte('session_date', todayStr)
        .order('session_start_time', { ascending: false });

      if (error) {
        console.error('Error getting active device sessions:', error);
        throw error;
      }

      const mapped: DeviceSession[] = (data || []).map((s: any) => ({
        session_id: s.session_id,
        session_date: s.session_date,
        site_id: s.site_id,
        site_name: s.sites?.name || 'Unknown Site',
        program_id: s.program_id,
        program_name: s.pilot_programs?.name || 'Unknown Program',
        company_name: s.companies?.name || '',
        status: s.status,
        started_at: s.session_start_time,
        expected_items: s.expected_wake_count || 0,
        completed_items: s.completed_wake_count || 0,
        progress_percent: s.expected_wake_count > 0
          ? Math.round((s.completed_wake_count / s.expected_wake_count) * 1000) / 10
          : 0,
        failed_wake_count: s.failed_wake_count || 0,
        extra_wake_count: s.extra_wake_count || 0,
      }));

      setDeviceSessions(mapped);
    } catch (error) {
      console.error('Error loading device sessions:', error);
      setLoadError('Failed to load active sessions');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProgramSelect = (programId: string) => {
    setDrawerProgramId(programId);
    setDrawerSiteId(null);
  };

  const handleSiteSelect = (siteId: string) => {
    setDrawerSiteId(siteId);
  };

  const handleCreateNewSession = () => {
    const targetProgramId = drawerProgramId || selectedProgram?.program_id;
    const targetSiteId = drawerSiteId || selectedSite?.site_id;

    if (targetProgramId && targetSiteId) {
      navigate(`/programs/${targetProgramId}/sites/${targetSiteId}/new-submission`);
      onClose();
    } else {
      setIsSelectionMode(true);
    }
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
  };

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? 'block' : 'hidden'}`}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full sm:w-4/5 md:w-3/5 lg:max-w-md bg-white shadow-lg transform transition-transform duration-300 ease-in-out overflow-hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center">
              <ClipboardList size={20} className="text-primary-600 mr-2" />
              <h2 className="text-lg font-semibold">Sessions</h2>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="primary"
                size="sm"
                onClick={toggleSelectionMode}
                icon={isSelectionMode ? <ClipboardList size={14} /> : <PlusCircle size={14} />}
                className={isSelectionMode ? "bg-gray-600 hover:bg-gray-700" : "bg-green-600 hover:bg-green-700"}
                testId="new-session-toggle-button"
              >
                {isSelectionMode ? "View Sessions" : "New"}
              </Button>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close drawer"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          
          {isSelectionMode ? (
            /* Program and Site Selection View */
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-lg font-semibold mb-3">Create New Submission</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select a program and site to create a new submission.
              </p>

              {/* Program Selection */}
              <div className="mb-4">
                <h4 className="text-md font-medium mb-2">Select Program</h4>
                {programsLoading ? (
                  <div className="space-y-3">
                    <SkeletonLoader variant="rectangular" width="100%" height="60px" count={3} />
                  </div>
                ) : programs.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-gray-500">No programs available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {programs.map(program => (
                      <button
                        key={program.program_id}
                        onClick={() => handleProgramSelect(program.program_id)}
                        className={`p-3 rounded-md text-left transition-colors ${
                          drawerProgramId === program.program_id
                            ? 'bg-primary-100 border-primary-300 border text-primary-800'
                            : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium truncate">{program.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            program.effective_status === 'active'
                              ? 'bg-success-100 text-success-800'
                              : program.effective_status === 'scheduled'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {program.effective_status === 'active' ? 'Active' :
                             program.effective_status === 'scheduled' ? 'Scheduled' : 'Expired'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{program.total_sites} Sites</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Site Selection - Only show if a program is selected */}
              {drawerProgramId && (
                <div className="mb-4">
                  <h4 className="text-md font-medium mb-2">Select Site</h4>
                  {sitesLoading ? (
                    <div className="space-y-3">
                      <SkeletonLoader variant="rectangular" width="100%" height="60px" count={3} />
                    </div>
                  ) : sites.length === 0 ? (
                    <div className="p-4 bg-gray-50 rounded-lg text-center">
                      <p className="text-gray-500">No sites available for this program</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                      {sites.map(site => (
                        <button
                          key={site.site_id}
                          onClick={() => handleSiteSelect(site.site_id)}
                          className={`p-3 rounded-md text-left transition-colors ${
                            drawerSiteId === site.site_id
                              ? 'bg-secondary-100 border-secondary-300 border text-secondary-800'
                              : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-medium truncate">{site.name}</span>
                            <span className="text-xs bg-gray-100 text-gray-800 px-1 rounded">
                              {site.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {site.total_petris} petri samples
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Create Button */}
              <div className="mt-6 flex justify-end">
                <Button
                  variant="primary"
                  onClick={handleCreateNewSession}
                  disabled={!drawerProgramId || !drawerSiteId}
                  icon={<Plus size={16} />}
                  testId="create-new-session-button"
                >
                  Create New Submission
                </Button>
              </div>
            </div>
          ) : (
            /* Sessions View */
            <>
              <div className="flex border-b border-gray-200">
                <button
                  className="flex-1 py-2 px-4 text-center font-medium text-primary-600 border-b-2 border-primary-600"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Device Sessions</span>
                    {deviceSessions.length > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-primary-600 bg-primary-100 rounded-full">
                        {deviceSessions.length}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-sm text-gray-600">
                    {isRefreshing
                      ? 'Loading sessions...'
                      : deviceSessions.length === 0
                        ? 'No active device sessions'
                        : `${deviceSessions.length} active session${deviceSessions.length !== 1 ? 's' : ''}`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadDeviceSessions}
                    isLoading={isRefreshing}
                    disabled={isRefreshing}
                  >
                    Refresh
                  </Button>
                </div>

                {loadError && (
                  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {loadError}
                  </div>
                )}

                {!isRefreshing && deviceSessions.length === 0 && !loadError ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-600 font-medium mb-2">
                      No Active Device Sessions
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Device sessions are created automatically when sites have scheduled wake times
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deviceSessions.map((session) => (
                      <div
                        key={session.session_id}
                        className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-medium text-sm truncate">{session.site_name}</div>
                          </div>
                          <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-800">
                            {session.status === 'in_progress' ? 'In Progress' : session.status}
                          </span>
                        </div>

                        <p className="text-xs text-gray-500 mb-2 truncate">{session.program_name}</p>

                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-primary-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(session.progress_percent || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 whitespace-nowrap font-medium">
                            {Math.min(Math.round(session.progress_percent || 0), 100)}%
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                          <span>{session.completed_items} / {session.expected_items} wakes</span>
                          <span>Started {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}</span>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                          <button
                            onClick={() => {
                              navigate(`/programs/${session.program_id}/sites/${session.site_id}`);
                              onClose();
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                          >
                            <MapPin size={12} />
                            <span>View Site</span>
                          </button>
                          <button
                            onClick={() => {
                              navigate(`/programs/${session.program_id}/sites/${session.site_id}/device-sessions/${session.session_id}`);
                              onClose();
                            }}
                            className="flex items-center gap-1 ml-auto px-3 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded transition-colors"
                          >
                            <Eye size={12} />
                            <span>View Session</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActiveSessionsDrawer;