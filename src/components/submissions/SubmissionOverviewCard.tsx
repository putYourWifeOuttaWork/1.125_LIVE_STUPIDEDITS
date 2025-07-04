import { useState, useEffect } from 'react';
import { Clock, BarChart4, User, Users, Hash, Share2 } from 'lucide-react';
import { format, formatDistanceToNow, differenceInSeconds, set } from 'date-fns';
import Card, { CardHeader, CardContent } from '../common/Card';
import { SubmissionSession } from '../../types/session';
import SessionProgressStages from './SessionProgressStages';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';

interface SubmissionOverviewCardProps {
  session: SubmissionSession | null;
  submissionCreatedAt?: string;
  openedByUserEmail?: string;
  openedByUserName?: string;
  onShare?: () => void;
  canShare?: boolean;
  // Progress-related props
  petrisComplete?: number;
  petrisTotal?: number;
  gasifiersComplete?: number;
  gasifiersTotal?: number;
}

const SubmissionOverviewCard: React.FC<SubmissionOverviewCardProps> = ({
  session,
  submissionCreatedAt,
  openedByUserEmail,
  openedByUserName,
  onShare,
  canShare = false,
  petrisComplete = 0,
  petrisTotal = 0,
  gasifiersComplete = 0,
  gasifiersTotal = 0
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timeRemainingString, setTimeRemainingString] = useState<string>("");
  const [sharedUsersDetails, setSharedUsersDetails] = useState<Map<string, { full_name: string | null; email: string }>>(new Map());
  const [formattedSharedUsers, setFormattedSharedUsers] = useState<string>("");
  
  // Fetch shared users' details when session changes
  useEffect(() => {
    const fetchSharedUserDetails = async () => {
      if (!session?.escalated_to_user_ids || session.escalated_to_user_ids.length === 0) return;
      
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', session.escalated_to_user_ids);
          
        if (error) throw error;
        
        if (data) {
          // Create a map for quick lookup
          const userDetailsMap = new Map<string, { full_name: string | null; email: string }>();
          data.forEach(user => {
            userDetailsMap.set(user.id, { full_name: user.full_name, email: user.email });
          });
          setSharedUsersDetails(userDetailsMap);
        }
      } catch (error) {
        console.error('Error fetching shared user details:', error);
      }
    };
    
    fetchSharedUserDetails();
  }, [session?.escalated_to_user_ids]);
  
  // Format shared users into a readable string
  useEffect(() => {
    if (!session?.escalated_to_user_ids || session.escalated_to_user_ids.length === 0) {
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
    if (result.length > 50) {
      result = result.substring(0, 47) + '...';
    }
    
    setFormattedSharedUsers(result);
  }, [session?.escalated_to_user_ids, sharedUsersDetails]);

  if (!session && !submissionCreatedAt) return null;

  // Calculate expiration time (11:59:59 PM of the session start day)
  const calculateExpirationTime = () => {
    const startDate = session 
      ? new Date(session.session_start_time) 
      : submissionCreatedAt 
        ? new Date(submissionCreatedAt) 
        : new Date();
    
    // Create a new date set to 11:59:59 PM of the start date
    const expirationTime = new Date(startDate);
    expirationTime.setHours(23, 59, 59, 999);
    
    return expirationTime;
  };

  const expirationTime = calculateExpirationTime();
  const now = new Date();
  const isExpired = now > expirationTime;
  
  // Calculate and update time remaining
  useEffect(() => {
    if (isExpired || 
        !session || 
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
  }, [session, expirationTime, isExpired]);
  
  // Get status color for badges
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
  
  // Get display status - special case for Shared status
  const getDisplayStatus = () => {
    if (!session) return "Not Owned By You";
    return session.session_status;
  };

  const sessionOwner = openedByUserName || openedByUserEmail || 'Unknown User';
  const displayStatus = getDisplayStatus();

  // Format the session start time
  const sessionStartTime = session 
    ? format(new Date(session.session_start_time), 'PPp') 
    : submissionCreatedAt 
      ? format(new Date(submissionCreatedAt), 'PPp')
      : 'Unknown';
  
  // Format expiration time
  const expirationTimeString = format(expirationTime, 'PPp');

  // Determine if session is active
  const isActive = session && !['Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(session.session_status);

  return (
    <Card className="mb-4">
      <CardHeader>
        <h2 className="font-medium flex items-center">
          <Clock className="mr-2 h-5 w-5 text-primary-600" />
          Submission Status
        </h2>
      </CardHeader>
      <CardContent>
        {/* Progress stages */}
        {session && (
          <SessionProgressStages 
            status={session.session_status}
            percentageComplete={session.percentage_complete}
            petrisComplete={petrisComplete}
            petrisTotal={petrisTotal}
            gasifiersComplete={gasifiersComplete}
            gasifiersTotal={gasifiersTotal}
          />
        )}

        <div className="bg-gray-50 rounded-lg p-4 mt-4 border border-gray-200">
          <div className="flex flex-wrap gap-2 md:gap-4">
            <div>
              <h3 className="text-sm text-gray-600 mb-1">Status</h3>
              <div className="flex items-center space-x-2">
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(displayStatus)}`}>
                  {displayStatus}
                </span>
                {canShare && onShare && isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Share2 size={16} />}
                    onClick={onShare}
                    className="!py-1 !px-2"
                    testId="share-submission-button"
                  >
                    Share
                  </Button>
                )}
              </div>
            </div>
            
            <div>
              <h3 className="text-sm text-gray-600 mb-1">Created</h3>
              <p className="text-sm font-medium">{sessionStartTime}</p>
            </div>
            
            <div>
              <h3 className="text-sm text-gray-600 mb-1">By</h3>
              <div className="flex items-center text-sm font-medium">
                <User className="mr-1.5 h-3.5 w-3.5 text-gray-500" />
                {sessionOwner}
              </div>
            </div>
            
            {session && session.completion_time && (
              <div>
                <h3 className="text-sm text-gray-600 mb-1">Completed</h3>
                <p className="text-sm font-medium">
                  {format(new Date(session.completion_time), 'PPp')}
                </p>
              </div>
            )}

            {session && session.last_activity_time && (
              <div>
                <h3 className="text-sm text-gray-600 mb-1">Last Activity</h3>
                <p className="text-sm font-medium">
                  {formatDistanceToNow(new Date(session.last_activity_time), { addSuffix: true })}
                </p>
              </div>
            )}
          </div>

          {/* Team Members section */}
          {session?.escalated_to_user_ids && session.escalated_to_user_ids.length > 0 && (
            <div className="flex items-center mt-3 pt-3 border-t border-gray-200">
              <Users size={16} className="text-gray-500 mr-2 flex-shrink-0" />
              <div>
                <h3 className="text-sm text-gray-600 mb-1">Team Members</h3>
                <p className="text-sm font-medium">
                  {formattedSharedUsers || "Loading team members..."}
                </p>
              </div>
            </div>
          )}

          {/* Expiration details */}
          <div className="mt-4 flex justify-between items-center">
            <div>
              <h3 className="text-sm text-gray-600 mb-1">Session Window</h3>
              <p className="text-sm">
                {isExpired 
                  ? `Expired at ${expirationTimeString}` 
                  : `Expires at ${expirationTimeString}`}
              </p>
            </div>

            {isActive && !isExpired && (
              <div className={`font-mono font-medium ${getTimeRemainingColor()}`}>
                {timeRemainingString}
              </div>
            )}
          </div>

          {/* Session status message */}
          {session && ['Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(session.session_status) && (
            <div className="mt-4 p-3 bg-gray-100 border border-gray-200 rounded-md">
              <p className="text-sm text-gray-700">
                This submission is {session.session_status.toLowerCase()} and cannot be edited.
                {session.session_status.includes('Expired') 
                  ? ' The session window has closed.' : 
                  session.session_status === 'Cancelled' 
                    ? ' The session was manually cancelled.' : 
                    ' The submission has been finalized.'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SubmissionOverviewCard;