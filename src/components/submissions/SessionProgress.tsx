import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart4, Clock, User, Users, Hash, Hand } from 'lucide-react';
import Button from '../common/Button';
import { ActiveSession } from '../../types/session';
import { formatDistanceToNow, differenceInSeconds, set } from 'date-fns';
import { useSessionStore } from '../../stores/sessionStore';
import { toast } from 'react-toastify';

interface SessionProgressProps {
  session: ActiveSession;
  variant?: 'compact' | 'full';
  sharedUsersDetails?: Map<string, { full_name: string | null; email: string }>;
  currentSessionId?: string | null;
  onCloseDrawer?: () => void;
}

const SessionProgress: React.FC<SessionProgressProps> = ({ 
  session, 
  variant = 'full',
  sharedUsersDetails = new Map(),
  currentSessionId,
  onCloseDrawer
}) => {
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timeRemainingString, setTimeRemainingString] = useState<string>("");
  const [formattedSharedUsers, setFormattedSharedUsers] = useState<string>("");
  const isCurrentSession = currentSessionId === session.session_id;
  const { claimSession } = useSessionStore();
  
  // Calculate time until expiration (11:59:59 PM of the session start date)
  useEffect(() => {
    // Calculate expiration time (11:59:59 PM of the day the session started)
    const sessionStartTime = new Date(session.session_start_time);
    const expirationTime = set(sessionStartTime, { hours: 23, minutes: 59, seconds: 59 });
    const now = new Date();
    
    // If already expired, don't set up timer
    if (now > expirationTime || 
        ['Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(session.session_status)) {
      setTimeRemaining(0);
      setTimeRemainingString("Expired");
      return;
    }
    
    // Format time remaining as HH:MM:SS
    const formatTimeRemaining = (seconds: number) => {
      if (seconds <= 0) return "00:00:00";
      
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    // Initial calculation
    const initialRemaining = differenceInSeconds(expirationTime, now);
    setTimeRemaining(initialRemaining);
    setTimeRemainingString(formatTimeRemaining(initialRemaining));
    
    // Update every second
    const interval = setInterval(() => {
      const now = new Date();
      if (now > expirationTime) {
        clearInterval(interval);
        setTimeRemaining(0);
        setTimeRemainingString("Expired");
        return;
      }
      
      const seconds = differenceInSeconds(expirationTime, now);
      setTimeRemaining(seconds);
      setTimeRemainingString(formatTimeRemaining(seconds));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [session.session_start_time, session.session_status]);
  
  // Process shared users when they change
  useEffect(() => {
    if (!session.escalated_to_user_ids || session.escalated_to_user_ids.length === 0) {
      setFormattedSharedUsers("");
      return;
    }
    
    const userFirstNames: string[] = [];
    
    session.escalated_to_user_ids.forEach(userId => {
      const userDetails = sharedUsersDetails.get(userId);
      if (userDetails) {
        // Use first name from full name, or email prefix if no full name
        if (userDetails.full_name) {
          const firstName = userDetails.full_name.split(' ')[0];
          userFirstNames.push(firstName);
        } else {
          const emailPrefix = userDetails.email.split('@')[0];
          userFirstNames.push(emailPrefix);
        }
      }
    });
    
    // Format as comma-separated list with truncation
    let result = userFirstNames.join(', ');
    if (result.length > 40) {
      result = result.substring(0, 37) + '...';
    }
    
    setFormattedSharedUsers(result);
  }, [session.escalated_to_user_ids, sharedUsersDetails]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'working':
        return 'bg-secondary-100 text-secondary-800';
      case 'opened':
        return 'bg-primary-100 text-primary-800';
      case 'escalated':
        return 'bg-warning-100 text-warning-800';
      case 'shared':
        return 'bg-accent-100 text-accent-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  // Get color for countdown timer
  const getTimeRemainingColor = () => {
    const hoursRemaining = timeRemaining / 3600;
    if (hoursRemaining > 8) return "text-success-600"; // Green for > 8 hours
    if (hoursRemaining > 4) return "text-warning-600"; // Yellow for 4-8 hours
    return "text-error-600"; // Red for ≤ 4 hours
  };

  // Handle resuming the session
  const handleResumeSession = () => {
    // Close the drawer if the callback is provided
    if (onCloseDrawer) {
      onCloseDrawer();
    }
    
    navigate(`/programs/${session.program_id}/sites/${session.site_id}/submissions/${session.submission_id}/edit`);
  };
  
  // Handle claiming an unclaimed session
  const handleClaimSession = async () => {
    const success = await claimSession(session.session_id);
    
    if (success) {
      toast.success(`Session for ${session.site_name} claimed successfully!`);
      
      // Close the drawer if the callback is provided
      if (onCloseDrawer) {
        onCloseDrawer();
      }
      
      navigate(`/programs/${session.program_id}/sites/${session.site_id}/submissions/${session.submission_id}/edit`);
    } else {
      toast.error(`Failed to claim session for ${session.site_name}`);
    }
  };
  
  // Compact variant (for drawer items, etc.)
  if (variant === 'compact') {
    return (
      <div className={`p-2 border rounded-md ${isCurrentSession ? 'bg-primary-50 border-primary-200' : 'hover:bg-gray-50 border-gray-200'} transition-colors`}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-medium text-sm truncate">{session.site_name}</div>
          <div className="flex items-center space-x-1">
            {session.global_submission_id && (
              <span className="inline-flex items-center text-xs text-primary-600 mr-1">
                <Hash size={10} className="mr-0.5" />
                {session.global_submission_id}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${getStatusColor(session.session_status)}`}>
              {session.session_status}
            </span>
            {timeRemaining > 0 && (
              <span className={`text-xs font-mono font-medium ${getTimeRemainingColor()}`}>
                {timeRemainingString}
              </span>
            )}
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-primary-600 h-1.5 rounded-full"
              style={{ width: `${Math.min(session.percentage_complete, 100)}%` }}
            ></div>
          </div>
          <span className="text-xs whitespace-nowrap">
            {Math.min(session.percentage_complete, 100)}%
          </span>
        </div>
        
        {/* Team Section - Always show the Users icon, but only show names if there are shared users */}
        <div className="flex items-center mt-1 text-xs text-gray-500">
          <Users size={12} className="flex-shrink-0 mr-1" />
          {formattedSharedUsers ? (
            <span className="truncate">{formattedSharedUsers}</span>
          ) : (
            <span className="text-gray-400">No team members</span>
          )}
        </div>
        
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500">
            Updated {formatDistanceToNow(new Date(session.last_activity_time), { addSuffix: true })}
          </span>
          {session.is_unclaimed ? (
            <Button
              variant="accent"
              size="sm"
              onClick={handleClaimSession}
              className="!py-1 !px-2 text-xs"
              icon={<Hand size={12} />}
            >
              Grab
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleResumeSession}
              className="!py-1 !px-2 text-xs"
            >
              Resume
            </Button>
          )}
        </div>
      </div>
    );
  }
  
  // Full variant (for cards or main content)
  return (
    <div className={`p-4 border rounded-lg shadow-sm ${isCurrentSession ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200'} transition-colors`}>
      <div className="flex justify-between items-center mb-3">
        <div>
          <div className="flex items-center">
            <h3 className="font-medium">{session.site_name}</h3>
            <div className="flex items-center ml-2">
              {session.global_submission_id && (
                <span className="inline-flex items-center text-xs text-primary-600 mr-1">
                  <Hash size={12} className="mr-0.5" />
                  {session.global_submission_id}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(session.session_status)}`}>
                {session.session_status}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-600">{session.program_name}</p>
        </div>
        <div className="flex items-center">
          {timeRemaining > 0 && (
            <span className={`font-mono font-medium mr-3 ${getTimeRemainingColor()}`}>
              {timeRemainingString}
            </span>
          )}
          {session.is_unclaimed ? (
            <Button
              variant="accent"
              size="sm"
              onClick={handleClaimSession}
              icon={<Hand size={16} />}
            >
              Grab Session
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleResumeSession}
            >
              Resume Session
            </Button>
          )}
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">Progress: {Math.min(session.percentage_complete, 100)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full"
            style={{ width: `${Math.min(session.percentage_complete, 100)}%` }}
          ></div>
        </div>
      </div>
      
      {/* Team Section - Always show the Users icon, but only show names if there are shared users */}
      <div className="flex items-center mb-3 text-sm text-gray-600">
        <Users size={16} className="flex-shrink-0 text-gray-500 mr-2" />
        {formattedSharedUsers ? (
          <span>Shared with: {formattedSharedUsers}</span>
        ) : (
          <span className="text-gray-400">Not shared with team members</span>
        )}
      </div>
      
      <div className="text-xs text-gray-500 flex justify-between">
        <span>Started: {formatDistanceToNow(new Date(session.session_start_time), { addSuffix: true })}</span>
        <span>Last activity: {formatDistanceToNow(new Date(session.last_activity_time), { addSuffix: true })}</span>
      </div>
    </div>
  );
};

export default SessionProgress;