import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, User, BarChart4, X, ChevronRight, Users, Hash, PlusCircle, FileText, Hand, Plus } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { useSessionStore } from '../../stores/sessionStore';
import { usePilotProgramStore } from '../../stores/pilotProgramStore';
import sessionManager from '../../lib/sessionManager';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import SessionProgress from './SessionProgress';
import { toast } from 'react-toastify';
import usePilotPrograms from '../../hooks/usePilotPrograms';
import { useSites } from '../../hooks/useSites';
import SkeletonLoader, { SkeletonCard } from '../common/SkeletonLoader';

interface ActiveSessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ActiveSessionsDrawer: React.FC<ActiveSessionsDrawerProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { selectedProgram, selectedSite } = usePilotProgramStore();
  const { 
    activeSessions, 
    setActiveSessions, 
    setIsLoading,
    setError,
    currentSessionId,
    hasUnclaimedSessions,
    setHasUnclaimedSessions,
    claimSession
  } = useSessionStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sharedUsersDetails, setSharedUsersDetails] = useState<Map<string, { full_name: string | null; email: string }>>(new Map());
  const [showUnclaimedSessions, setShowUnclaimedSessions] = useState(false);

  // Add state for in-drawer program and site selection
  const [drawerProgramId, setDrawerProgramId] = useState<string | null>(null);
  const [drawerSiteId, setDrawerSiteId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Fetch programs and sites for selection
  const { programs, isLoading: programsLoading } = usePilotPrograms();
  const { sites, loading: sitesLoading } = useSites(drawerProgramId);

  // Load active sessions when the drawer is opened
  useEffect(() => {
    if (isOpen) {
      loadActiveSessions();
    }
  }, [isOpen]);

  // Set initial selected program and site based on global state when drawer opens
  useEffect(() => {
    if (isOpen && selectedProgram) {
      setDrawerProgramId(selectedProgram.program_id);
      if (selectedSite) {
        setDrawerSiteId(selectedSite.site_id);
      }
    }
  }, [isOpen, selectedProgram, selectedSite]);

  // Function to load active sessions
  const loadActiveSessions = async () => {
    setIsRefreshing(true);
    try {
      setIsLoading(true);
      
      // Get active sessions using the enhanced RPC function
      const { data, error } = await supabase.rpc('get_active_sessions_with_details');
      
      if (error) {
        console.error('Error getting active sessions:', error);
        throw error;
      }
      
      // Check if there are any unclaimed sessions
      const hasUnclaimed = data?.some(session => session.is_unclaimed === true) || false;
      setHasUnclaimedSessions(hasUnclaimed);
      
      // Collect all unique user IDs from escalated_to_user_ids arrays
      const uniqueUserIds = new Set<string>();
      data?.forEach(session => {
        if (session.escalated_to_user_ids && session.escalated_to_user_ids.length > 0) {
          session.escalated_to_user_ids.forEach(userId => uniqueUserIds.add(userId));
        }
      });
      
      // If we have shared users, fetch their details
      if (uniqueUserIds.size > 0) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', Array.from(uniqueUserIds));
          
        if (!userError && userData) {
          // Create a map for quick lookup
          const userDetailsMap = new Map<string, { full_name: string | null; email: string }>();
          userData.forEach(user => {
            userDetailsMap.set(user.id, { full_name: user.full_name, email: user.email });
          });
          setSharedUsersDetails(userDetailsMap);
        } else {
          console.error('Error fetching shared user details:', userError);
        }
      }
      
      setActiveSessions(data || []);
    } catch (error) {
      console.error('Error loading active sessions:', error);
      setError('Failed to load active sessions');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  // Handle claiming a session
  const handleClaimSession = async (sessionId: string) => {
    const success = await claimSession(sessionId);
    
    if (success) {
      toast.success('Session claimed successfully');
      // Navigate to the submission edit page
      const session = activeSessions.find(s => s.session_id === sessionId);
      if (session) {
        navigate(`/programs/${session.program_id}/sites/${session.site_id}/submissions/${session.submission_id}/edit`);
        onClose();
      }
    } else {
      toast.error('Failed to claim session');
    }
  };

  // Handle program selection
  const handleProgramSelect = (programId: string) => {
    setDrawerProgramId(programId);
    setDrawerSiteId(null); // Reset site selection when program changes
  };

  // Handle site selection
  const handleSiteSelect = (siteId: string) => {
    setDrawerSiteId(siteId);
  };

  // Function to create a new session
  const handleCreateNewSession = () => {
    const targetProgramId = drawerProgramId || selectedProgram?.program_id;
    const targetSiteId = drawerSiteId || selectedSite?.site_id;
    
    if (targetProgramId && targetSiteId) {
      navigate(`/programs/${targetProgramId}/sites/${targetSiteId}/new-submission`);
      onClose();
    } else {
      // If no program and site are selected, prompt the user to select them
      setIsSelectionMode(true);
    }
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    // If entering selection mode, show the My Sessions tab
    if (!isSelectionMode) {
      setShowUnclaimedSessions(false);
    }
  };

  // Filter sessions based on claimed/unclaimed status
  const filteredSessions = activeSessions.filter(session => 
    showUnclaimedSessions ? session.is_unclaimed : !session.is_unclaimed
  );

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
                            program.status === 'active' 
                              ? 'bg-success-100 text-success-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {program.status === 'active' ? 'Active' : 'Inactive'}
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
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  className={`flex-1 py-2 px-4 text-center font-medium ${
                    !showUnclaimedSessions 
                      ? 'text-primary-600 border-b-2 border-primary-600' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setShowUnclaimedSessions(false)}
                >
                  My Sessions
                </button>
                <button
                  className={`flex-1 py-2 px-4 text-center font-medium ${
                    showUnclaimedSessions 
                      ? 'text-primary-600 border-b-2 border-primary-600' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setShowUnclaimedSessions(true)}
                >
                  Unclaimed Sessions
                  {hasUnclaimedSessions && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-primary-600 rounded-full">
                      !
                    </span>
                  )}
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-sm text-gray-600">
                    {filteredSessions.length === 0 
                      ? showUnclaimedSessions 
                        ? 'No unclaimed sessions available' 
                        : 'You have no active sessions' 
                      : `${filteredSessions.length} ${showUnclaimedSessions ? 'unclaimed' : 'active'} session${filteredSessions.length !== 1 ? 's' : ''}`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadActiveSessions}
                    isLoading={isRefreshing}
                    disabled={isRefreshing}
                  >
                    Refresh
                  </Button>
                </div>
                
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-600 font-medium mb-2">
                      {showUnclaimedSessions 
                        ? 'No Unclaimed Sessions' 
                        : 'No Active Sessions'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {showUnclaimedSessions 
                        ? 'There are no unclaimed sessions available for you to take.' 
                        : 'When You Own or are Shared a Session It Will Show Here'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredSessions.map((session) => (
                      <div 
                        key={session.session_id} 
                        className={`p-2 border rounded-md ${
                          session.is_unclaimed 
                            ? 'bg-gray-50 border-gray-200 hover:bg-gray-100' 
                            : currentSessionId === session.session_id 
                              ? 'bg-primary-50 border-primary-200' 
                              : 'hover:bg-gray-50 border-gray-200'
                        } transition-colors`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-medium text-sm truncate">{session.site_name}</div>
                          <div className="flex items-center space-x-1">
                            {session.global_submission_id && (
                              <span className="inline-flex items-center text-xs text-primary-600 mr-1">
                                <Hash size={10} className="mr-0.5" />
                                {session.global_submission_id}
                              </span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              session.session_status === 'Working' 
                                ? 'bg-secondary-100 text-secondary-800'
                                : session.session_status === 'Opened' 
                                ? 'bg-primary-100 text-primary-800'
                                : session.session_status === 'Escalated' 
                                ? 'bg-warning-100 text-warning-800'
                                : session.session_status === 'Shared'
                                ? 'bg-accent-100 text-accent-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {session.session_status}
                            </span>
                          </div>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-primary-600 h-1.5 rounded-full" 
                              style={{ width: `${session.percentage_complete}%` }}
                            ></div>
                          </div>
                          <span className="text-xs whitespace-nowrap">
                            {session.percentage_complete}%
                          </span>
                        </div>
                        
                        {/* Team Section - Always show the Users icon, but only show names if there are shared users */}
                        {!session.is_unclaimed && (
                          <div className="flex items-center mt-1 text-xs text-gray-500">
                            <Users size={12} className="flex-shrink-0 mr-1" />
                            {session.escalated_to_user_ids && session.escalated_to_user_ids.length > 0 ? (
                              <span className="truncate">
                                {session.escalated_to_user_ids.map(userId => {
                                  const userDetails = sharedUsersDetails.get(userId);
                                  return userDetails?.full_name?.split(' ')[0] || userDetails?.email?.split('@')[0] || 'User';
                                }).join(', ')}
                              </span>
                            ) : (
                              <span className="text-gray-400">No team members</span>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500">
                            {session.is_unclaimed 
                              ? `Created ${formatDistanceToNow(new Date(session.session_start_time), { addSuffix: true })}` 
                              : `Updated ${formatDistanceToNow(new Date(session.last_activity_time), { addSuffix: true })}`}
                          </span>
                          {session.is_unclaimed ? (
                            <Button
                              variant="accent"
                              size="sm"
                              onClick={() => {
                                handleClaimSession(session.session_id);
                                // The drawer close is handled in handleClaimSession when successful
                              }}
                              className="!py-1 !px-2 text-xs"
                              icon={<Hand size={12} className="mr-1" />}
                            >
                              Claim
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                navigate(`/programs/${session.program_id}/sites/${session.site_id}/submissions/${session.submission_id}/edit`);
                                onClose();
                              }}
                              className="!py-1 !px-2 text-xs"
                            >
                              Resume
                            </Button>
                          )}
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