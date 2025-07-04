import { useState, useEffect } from 'react';
import { Users, UserPlus, Search, UserMinus, AlertOctagon } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import sessionManager from '../../lib/sessionManager';
import { useAuthStore } from '../../stores/authStore';

interface SessionShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  programId: string;
}

interface ProgramUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_company_admin?: boolean;
  is_program_admin?: boolean;
}

const SessionShareModal = ({
  isOpen,
  onClose,
  sessionId,
  programId
}: SessionShareModalProps) => {
  const { user } = useAuthStore();
  const [programUsers, setProgramUsers] = useState<ProgramUser[]>([]);
  const [sharedUsers, setSharedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [escalateToUser, setEscalateToUser] = useState<string | null>(null);
  
  // Fetch program users and session info when modal opens
  useEffect(() => {
    if (!isOpen || !programId || !sessionId) return;
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch program users
        const { data: usersData, error: usersError } = await supabase
          .rpc('get_program_users', { program_id_param: programId });
          
        if (usersError) throw usersError;
        
        // Enhance user data with admin flags
        const enhancedUsers = await Promise.all((usersData || []).map(async (u: any) => {
          // Check if user is a program admin
          const isProgramAdmin = u.role === 'Admin';
          
          // Check if user is a company admin
          const isCompanyAdmin = !!u.is_company_admin;
          
          return {
            ...u,
            is_program_admin: isProgramAdmin,
            is_company_admin: isCompanyAdmin
          };
        }));
        
        setProgramUsers(enhancedUsers || []);
        
        // Fetch session to get currently shared users
        const { data: sessionData, error: sessionError } = await supabase
          .from('submission_sessions')
          .select('escalated_to_user_ids')
          .eq('session_id', sessionId)
          .single();
        
        if (sessionError) throw sessionError;
        setSharedUsers(sessionData.escalated_to_user_ids || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load users data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [isOpen, programId, sessionId]);
  
  // Handle sharing with a user
  const handleShareWithUser = async (userId: string, isAdmin: boolean) => {
    if (sharedUsers.includes(userId)) return;
    
    setIsSharing(true);
    try {
      // Use 'share' as the action type for regular sharing
      const result = await sessionManager.shareSubmissionSession(sessionId, [...sharedUsers, userId], 'share');
      
      if (result.success) {
        setSharedUsers([...sharedUsers, userId]);
        
        if (isAdmin) {
          toast.success('Session shared with administrator');
        } else {
          toast.success('Session shared successfully');
        }
      } else {
        toast.error(result.message || 'Failed to share session');
      }
    } catch (error) {
      console.error('Error sharing session:', error);
      toast.error('Failed to share session');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveSharing = async (userId: string) => {
    if (!sharedUsers.includes(userId)) return;
    
    setIsSharing(true);
    try {
      const newSharedUsers = sharedUsers.filter(id => id !== userId);
      // Use 'share' as the action type since we're just updating the shared list
      const result = await sessionManager.shareSubmissionSession(sessionId, newSharedUsers, 'share');
      
      if (result.success) {
        setSharedUsers(newSharedUsers);
        toast.success('User removed from session sharing');
      } else {
        toast.error(result.message || 'Failed to update session sharing');
      }
    } catch (error) {
      console.error('Error updating session sharing:', error);
      toast.error('Failed to update session sharing');
    } finally {
      setIsSharing(false);
    }
  };
  
  // Handle manually escalating to a site admin
  const handleEscalateManually = async (userId: string) => {
    setEscalateToUser(userId);
    
    setIsSharing(true);
    try {
      // Check if user is already in shared users list
      const alreadyShared = sharedUsers.includes(userId);
      
      // If not already shared, add them to the shared users
      if (!alreadyShared) {
        // Use 'escalate' action type to ensure session is marked as escalated
        await sessionManager.shareSubmissionSession(sessionId, [...sharedUsers, userId], 'escalate');
      } else {
        // If user is already shared with, just update the session status to escalated
        const { data, error } = await supabase
          .from('submission_sessions')
          .update({ 
            session_status: 'Escalated',
            last_activity_time: new Date().toISOString()
          })
          .eq('session_id', sessionId)
          .select();
        
        if (error) throw error;
        
        toast.success('Session escalated successfully');
      }
    } catch (error) {
      console.error('Error escalating session:', error);
      toast.error('Faile to escalate session');
    } finally {
      setIsSharing(false);
      setEscalateToUser(null);
    }
  };
  
  // Filter users based on search query and exclude current user
  const filteredUsers = searchQuery 
    ? programUsers.filter(user => 
        user.user_id !== user?.id && // Exclude current user
        (searchQuery === '' || 
         user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
         (user.full_name && user.full_name.toLowerCase().includes(searchQuery.toLowerCase())))
      )
    : programUsers.filter(user => user.user_id !== user?.id); // Exclude current user

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <Users className="h-5 w-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold">Share Submission Session</h2>
        </div>
      }
      maxWidth="2xl"
    >
      <div className="p-4">
        <div className="bg-primary-50 border border-primary-100 p-3 rounded-md mb-4">
          <p className="text-sm text-primary-700">
            Share this submission session with other users who have access to this program.
            They will be able to view and edit the submission.
          </p>
        </div>
        
        <div className="mb-4 relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users by name or email..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-600">
              {searchQuery ? 'No users match your search' : 'No other users have access to this program'}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 font-medium">
                            {user.full_name 
                              ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()
                              : user.email.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4 min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {user.full_name || 'Unnamed User'}
                          </div>
                          <div className="text-sm text-gray-500 truncate max-w-[150px] sm:max-w-[200px]">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'Admin' 
                          ? 'bg-primary-100 text-primary-800' 
                          : user.role === 'Edit'
                          ? 'bg-secondary-100 text-secondary-800'
                          : user.role === 'Respond'
                          ? 'bg-accent-100 text-accent-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role}
                      </span>
                      {user.is_company_admin && (
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800">
                          Company Admin
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {sharedUsers.includes(user.user_id) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<UserMinus size={14} />}
                            onClick={() => handleRemoveSharing(user.user_id)}
                            disabled={isSharing}
                            className="!py-1"
                          >
                            Remove
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<UserPlus size={14} />}
                            onClick={() => handleShareWithUser(user.user_id, user.is_company_admin || user.is_program_admin)}
                            disabled={isSharing}
                            className="!py-1"
                          >
                            Share
                          </Button>
                        )}
                        
                        {(user.is_company_admin || user.is_program_admin) && (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<AlertOctagon size={14} />}
                            onClick={() => handleEscalateManually(user.user_id)}
                            disabled={isSharing || escalateToUser === user.user_id}
                            className="!py-1 text-warning-600 border-warning-300 hover:bg-warning-50"
                          >
                            Escalate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <div className="flex justify-end p-4 border-t">
        <Button 
          type="button"
          variant="outline"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default SessionShareModal;