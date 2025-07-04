import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { Hand, Clock, RefreshCw } from 'lucide-react';
import Button from '../common/Button';
import Card, { CardHeader, CardContent } from '../common/Card';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabaseClient';
import SkeletonLoader from '../common/SkeletonLoader';
import { ActiveSession } from '../../types/session';

interface UnclaimedSessionsCardProps {
  className?: string;
  limit?: number;
}

const UnclaimedSessionsCard = ({ className = 'mb-6', limit = 5 }: UnclaimedSessionsCardProps) => {
  const navigate = useNavigate();
  const { 
    activeSessions, 
    claimSession, 
    isLoading, 
    setIsLoading, 
    error, 
    setError,
    setActiveSessions
  } = useSessionStore();
  const [refreshing, setRefreshing] = useState(false);

  // Filter active sessions to get unclaimed ones (where opened_by_user_id is null)
  const unclaimedSessions = Array.isArray(activeSessions) 
    ? activeSessions.filter(session => session.opened_by_user_id === null)
    : [];

  const refreshSessions = async () => {
    setRefreshing(true);
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_active_sessions_with_details');
      
      if (error) throw error;
      
      setActiveSessions(data || []);
    } catch (err) {
      console.error('Error refreshing sessions:', err);
      setError('Failed to refresh sessions');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleClaimSession = async (session: ActiveSession) => {
    const success = await claimSession(session.session_id);
    
    if (success) {
      toast.success(`Session for ${session.site_name} claimed successfully!`);
      navigate(`/programs/${session.program_id}/sites/${session.site_id}/submissions/${session.submission_id}/edit`);
    } else {
      toast.error(`Failed to claim session for ${session.site_name}`);
      // Refresh sessions to get the latest state
      refreshSessions();
    }
  };

  // Refresh sessions when component mounts
  useEffect(() => {
    refreshSessions();
  }, []);

  // Get limited sessions to display
  const displayedSessions = unclaimedSessions.slice(0, limit);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <h2 className="text-lg font-semibold">Grab Your Facility!</h2>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-8">
          <SkeletonLoader count={3} className="w-full" />
        </CardContent>
      </Card>
    );
  }

  if (unclaimedSessions.length === 0) {
    return null;  // Don't show the card if there are no unclaimed sessions
  }

  return (
    <Card className={`${className} border-accent-200 bg-accent-50`}>
      <CardHeader className="flex justify-between items-center">
        <div className="flex items-center">
          <Hand className="mr-2 h-5 w-5 text-accent-600" />
          <h2 className="text-lg font-semibold">Grab Your Facility!</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={refreshSessions}
          isLoading={refreshing}
          testId="refresh-unclaimed-sessions"
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayedSessions.length > 0 && displayedSessions.map((session) => (
            <div 
              key={session.session_id} 
              className="border border-accent-200 rounded-lg p-4 bg-white hover:shadow-md transition-all"
              data-testid={`unclaimed-session-${session.session_id}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="font-medium text-gray-900">{session.site_name}</h3>
                  <p className="text-sm text-gray-500">{session.program_name}</p>
                </div>
                <div className="flex items-center space-x-1 text-sm text-gray-500">
                  <Clock size={14} />
                  <span>{formatDistanceToNow(new Date(session.session_start_time), { addSuffix: true })}</span>
                </div>
              </div>
              <Button
                variant="accent"
                size="sm"
                onClick={() => handleClaimSession(session)}
                fullWidth
                testId={`claim-session-${session.session_id}`}
              >
                Grab This Session
              </Button>
            </div>
          ))}
        </div>
        
        {unclaimedSessions.length > limit && (
          <div className="mt-3 text-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsLoading(false)}
              className="text-accent-600 border-accent-300 hover:bg-accent-50"
            >
              View {unclaimedSessions.length - limit} More Available Sessions
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UnclaimedSessionsCard;