import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Trash2, Search, UserMinus, Info, History, Shield, ShieldOff, Archive } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import useCompanies, { CompanyUser } from '../../hooks/useCompanies';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';

interface CompanyUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}

const CompanyUsersModal = ({
  isOpen,
  onClose,
  companyId,
  companyName
}: CompanyUsersModalProps) => {
  const navigate = useNavigate();
  const { fetchCompanyUsers, updateUserAdminStatus, addUserToCompany, loading } = useCompanies();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [activeUsers, setActiveUsers] = useState<CompanyUser[]>([]);
  const [deactivatedUsers, setDeactivatedUsers] = useState<CompanyUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'deactivated'>('active');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  
  // Fetch company users
  const loadUsers = async () => {
    const companyUsers = await fetchCompanyUsers(companyId);
    setUsers(companyUsers);
    
    // Separate active and deactivated users
    const active = companyUsers.filter(user => user.is_active !== false);
    const deactivated = companyUsers.filter(user => user.is_active === false);
    
    setActiveUsers(active);
    setDeactivatedUsers(deactivated);
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen, companyId]);
  
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      // Use the RPC function to search for users safely
      const { data, error } = await supabase
        .rpc('search_users_by_email', { search_query: query });
        
      if (error) throw error;
      
      // Filter out users that are already in the company
      const filteredResults = data?.filter(
        user => !users.some(companyUser => companyUser.id === user.id)
      ) || [];
      
      setSearchResults(filteredResults);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleAddUser = async () => {
    if (!newUserEmail.trim()) return;
    
    const success = await addUserToCompany(newUserEmail.trim(), companyId);
    if (success) {
      setNewUserEmail('');
      await loadUsers();
    }
  };
  
  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
    setProcessingUserId(userId);
    
    try {
      const success = await updateUserAdminStatus(userId, !currentStatus);
      if (success) {
        // Update local state
        setUsers(users.map(user => 
          user.id === userId ? {...user, is_company_admin: !currentStatus} : user
        ));
        
        // Update active users
        setActiveUsers(activeUsers.map(user => 
          user.id === userId ? {...user, is_company_admin: !currentStatus} : user
        ));
        
        const action = !currentStatus ? 'promoted' : 'demoted';
        const targetUser = users.find(u => u.id === userId);
        const undoToast = toast.success(
          <div>
            User {targetUser?.email} {action} to {!currentStatus ? 'admin' : 'member'}.
            <button 
              className="ml-2 underline text-primary-700 hover:text-primary-900"
              onClick={() => handleToggleAdmin(userId, !currentStatus)}
            >
              Undo
            </button>
          </div>,
          { autoClose: 30000 } // 30 seconds for undo
        );
      }
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleDemoteUser = async (userId: string) => {
    setProcessingUserId(userId);
    try {
      const { data, error } = await supabase
        .rpc('demote_company_admin', {
          p_user_id: userId
        });
        
      if (error) {
        toast.error(`Failed to demote user: ${error.message}`);
        return;
      }
      
      if (data.success) {
        await loadUsers();
        
        const targetUser = users.find(u => u.id === userId);
        const undoToast = toast.info(
          <div>
            User {targetUser?.email} has been demoted to member with read-only access.
            <button 
              className="ml-2 underline text-primary-700 hover:text-primary-900"
              onClick={() => handleToggleAdmin(userId, false)}
            >
              Undo
            </button>
          </div>,
          { autoClose: 30000 } // 30 seconds for undo
        );
      } else {
        toast.error(data.message || 'Failed to demote user');
      }
    } catch (err) {
      console.error('Error demoting user:', err);
      toast.error('Failed to demote user');
    } finally {
      setProcessingUserId(null);
    }
  };
  
  const handleDeactivateUser = async (userId: string) => {
    setProcessingUserId(userId);
    try {
      const { data, error } = await supabase
        .rpc('deactivate_user', {
          p_user_id: userId
        });
        
      if (error) {
        toast.error(`Failed to deactivate user: ${error.message}`);
        return;
      }
      
      if (data.success) {
        await loadUsers();
        
        const targetUser = users.find(u => u.id === userId);
        const undoToast = toast.warning(
          <div>
            User {targetUser?.email} has been deactivated.
            <button 
              className="ml-2 underline text-primary-700 hover:text-primary-900"
              onClick={() => handleReactivateUser(userId)}
            >
              Undo
            </button>
          </div>,
          { autoClose: 30000 } // 30 seconds for undo
        );
      } else {
        toast.error(data.message || 'Failed to deactivate user');
      }
    } catch (err) {
      console.error('Error deactivating user:', err);
      toast.error('Failed to deactivate user');
    } finally {
      setProcessingUserId(null);
    }
  };
  
  const handleReactivateUser = async (userId: string) => {
    setProcessingUserId(userId);
    try {
      const { data, error } = await supabase
        .rpc('reactivate_user', {
          p_user_id: userId
        });
        
      if (error) {
        toast.error(`Failed to reactivate user: ${error.message}`);
        return;
      }
      
      if (data.success) {
        await loadUsers();
        
        const targetUser = deactivatedUsers.find(u => u.id === userId);
        const undoToast = toast.success(
          <div>
            User {targetUser?.email} has been reactivated.
            <button 
              className="ml-2 underline text-primary-700 hover:text-primary-900"
              onClick={() => handleDeactivateUser(userId)}
            >
              Undo
            </button>
          </div>,
          { autoClose: 30000 } // 30 seconds for undo
        );
      } else {
        toast.error(data.message || 'Failed to reactivate user');
      }
    } catch (err) {
      console.error('Error reactivating user:', err);
      toast.error('Failed to reactivate user');
    } finally {
      setProcessingUserId(null);
    }
  };
  
  const handleViewAudit = (userId: string) => {
    // Navigate to audit log with this user filter
    navigate(`/user-audit/${userId}`);
  };

  // Filter users based on search query
  const getFilteredUsers = useCallback(() => {
    const usersToFilter = activeTab === 'active' ? activeUsers : deactivatedUsers;
    
    if (!searchQuery.trim()) {
      return usersToFilter;
    }
    
    return usersToFilter.filter(user => 
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.full_name && user.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [activeUsers, deactivatedUsers, activeTab, searchQuery]);

  const filteredUsers = getFilteredUsers();
  const [searchResults, setSearchResults] = useState<{ id: string; email: string; full_name: string | null }[]>([]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <Users className="h-5 w-5 text-primary-600 mr-2" />
          <h2 className="text-xl font-semibold">Company Users - {companyName}</h2>
        </div>
      }
      maxWidth="4xl"
    >
      <div className="p-4">
        <div className="mb-6 border-b pb-6">
          <h3 className="text-lg font-medium mb-4">Add New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Input
                label="User Email"
                id="newUserEmail"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Enter user email to add to company"
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                type="button"
                variant="primary"
                icon={<UserPlus size={16} />}
                onClick={handleAddUser}
                isLoading={loading}
                disabled={!newUserEmail.trim()}
                fullWidth
              >
                Add User
              </Button>
            </div>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
              <Button
                variant={activeTab === 'active' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('active')}
                icon={<UserPlus size={16} />}
              >
                Active Users ({activeUsers.length})
              </Button>
              <Button
                variant={activeTab === 'deactivated' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('deactivated')}
                icon={<Archive size={16} />}
              >
                Deactivated Users ({deactivatedUsers.length})
              </Button>
            </div>
            <div className="relative w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search users..."
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-600">
                {searchQuery ? 'No users match your search' : 
                 activeTab === 'active' ? 'No active users in this company' : 'No deactivated users'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
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
                    <tr key={user.id} className={user.is_active === false ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {user.full_name 
                                ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()
                                : user.email.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.full_name || 'Unnamed User'}
                            </div>
                            <div className="text-sm text-gray-500">
                              {user.email}
                            </div>
                          </div>
                          {user.is_active === false && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.is_company_admin
                            ? 'bg-primary-100 text-primary-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {user.is_company_admin ? 'Company Admin' : 'Company Member'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          {activeTab === 'active' ? (
                            // Actions for active users
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<History size={14} />}
                                onClick={() => handleViewAudit(user.id)}
                                className="!py-1"
                              >
                                Audit
                              </Button>
                              
                              {user.is_company_admin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={<ShieldOff size={14} />}
                                  onClick={() => handleDemoteUser(user.id)}
                                  disabled={processingUserId === user.id}
                                  className="!py-1"
                                >
                                  Demote
                                </Button>
                              )}
                              
                              {!user.is_company_admin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={<Shield size={14} />}
                                  onClick={() => handleToggleAdmin(user.id, false)}
                                  disabled={processingUserId === user.id}
                                  className="!py-1"
                                >
                                  Promote
                                </Button>
                              )}
                              
                              <Button
                                variant="danger"
                                size="sm"
                                icon={<UserMinus size={14} />}
                                onClick={() => handleDeactivateUser(user.id)}
                                disabled={processingUserId === user.id}
                                className="!py-1"
                              >
                                Deactivate
                              </Button>
                            </>
                          ) : (
                            // Actions for deactivated users
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                icon={<History size={14} />}
                                onClick={() => handleViewAudit(user.id)}
                                className="!py-1"
                              >
                                Audit
                              </Button>
                              
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<UserPlus size={14} />}
                                onClick={() => handleReactivateUser(user.id)}
                                disabled={processingUserId === user.id}
                                className="!py-1"
                              >
                                Reactivate
                              </Button>
                            </>
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

export default CompanyUsersModal;