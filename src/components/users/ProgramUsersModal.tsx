import { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { X, Users, UserPlus, Trash2, Search } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { UserRole } from '../../lib/types';
import useUserRole from '../../hooks/useUserRole';

interface ProgramUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  programId: string;
  programName: string;
}

interface ProgramUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  role: UserRole | 'Company Member';
  // Flag to indicate if the user is a company member without explicit program access
  isCompanyMember?: boolean;
}

const roleOptions: UserRole[] = ['Admin', 'Edit', 'Respond', 'ReadOnly'];

const AddUserSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  role: Yup.string()
    .oneOf(roleOptions, 'Please select a valid role')
    .required('Role is required'),
});

const ProgramUsersModal = ({ 
  isOpen, 
  onClose, 
  programId,
  programName
}: ProgramUsersModalProps) => {
  const [users, setUsers] = useState<ProgramUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { role: currentUserRole, isAdmin } = useUserRole({ programId });
  
  const fetchUsers = async () => {
    if (!programId) return;
    
    setLoading(true);
    try {
      // Use a safer RPC function to get program users with their details
      const { data: programUsers, error: programUsersError } = await supabase
        .rpc('get_program_users', { program_id_param: programId });
        
      if (programUsersError) throw programUsersError;
      
      let allUsers: ProgramUser[] = [];
      
      if (programUsers && programUsers.length > 0) {
        // Transform the data into our expected format
        const programUsersList = programUsers.map(pu => {
          return {
            id: pu.id,
            user_id: pu.user_id,
            email: pu.email || '',
            full_name: pu.full_name,
            company: pu.company,
            role: pu.role,
            isCompanyMember: false
          };
        });
        
        allUsers = [...programUsersList];
      }
      
      // Try to get company members if available through a safer RPC function
      try {
        const { data: companyUsers, error: companyUsersError } = await supabase
          .rpc('get_company_members_for_program', { program_id_param: programId });
          
        if (!companyUsersError && companyUsers && companyUsers.length > 0) {
          // Filter out users who are already in the program
          const existingUserIds = new Set(allUsers.map(u => u.user_id));
          const companyOnlyUsers = companyUsers
            .filter(user => !existingUserIds.has(user.id))
            .map(user => ({
              id: `company-${user.id}`, // Use a prefix to distinguish from program users
              user_id: user.id,
              email: user.email,
              full_name: user.full_name,
              company: user.company,
              role: 'Company Member' as 'Company Member',
              isCompanyMember: true
            }));
            
          allUsers = [...allUsers, ...companyOnlyUsers];
        }
      } catch (error) {
        console.error('Error fetching company members:', error);
        // Don't throw here - we'll continue with the program users we have
      }
      
      setUsers(allUsers);
    } catch (error) {
      console.error('Error fetching program users:', error);
      toast.error('Failed to load program users');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen, programId]);
  
  const formik = useFormik({
    initialValues: {
      email: '',
      role: 'Respond' as UserRole,
    },
    validationSchema: AddUserSchema,
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      try {
        // Use an RPC function that handles user lookup safely
        const { data: result, error: addError } = await supabase
          .rpc('add_user_to_program', { 
            p_email: values.email.trim(),
            p_program_id: programId,
            p_role: values.role
          });
          
        if (addError) {
          throw addError;
        }
        
        if (!result || !result.success) {
          toast.error(result?.message || `No user found with email ${values.email}`);
          return;
        }
        
        // Refresh the user list to show the newly added user
        await fetchUsers();
        
        toast.success(`User ${values.email} added to the program`);
        resetForm();
      } catch (error) {
        console.error('Error adding user to program:', error);
        toast.error('Failed to add user to program');
      } finally {
        setSubmitting(false);
      }
    }
  });
  
  const handleUpdateRole = async (userId: string, relationId: string, newRole: UserRole) => {
    try {
      // Check if this is a company member being assigned a role for the first time
      if (relationId.startsWith('company-')) {
        // Use an RPC function to safely add the company member to program
        const { data: result, error } = await supabase
          .rpc('assign_role_to_company_member', {
            p_user_id: userId,
            p_program_id: programId,
            p_role: newRole
          });
          
        if (error) throw error;
        
        if (!result || !result.success) {
          throw new Error(result?.message || 'Failed to assign role to company member');
        }
        
        // Refresh the user list to show updated roles
        await fetchUsers();
        
        toast.success('User role updated successfully');
      } else {
        // Use an RPC function to safely update the role for an existing program user
        const { data: result, error } = await supabase
          .rpc('update_program_user_role', {
            p_relation_id: relationId,
            p_program_id: programId,
            p_role: newRole
          });
          
        if (error) throw error;
        
        if (!result || !result.success) {
          throw new Error(result?.message || 'Failed to update user role');
        }
        
        // Update local state for immediate UI feedback
        setUsers(prev => prev.map(user => 
          user.id === relationId ? { ...user, role: newRole } : user
        ));
        
        toast.success('User role updated successfully');
      }
    } catch (error) {
      console.error('Error updating user role:', error);
      toast.error('Failed to update user role');
    }
  };
  
  const handleRemoveUser = async (userId: string, relationId: string) => {
    try {
      // If the user is a company member, we can't "remove" them from the program
      // as they have implicit access through company membership
      if (relationId.startsWith('company-')) {
        toast.info('Company members cannot be removed from the program');
        return;
      }
      
      // Use an RPC function to safely remove the user from the program
      const { data: result, error } = await supabase
        .rpc('remove_user_from_program', {
          p_relation_id: relationId,
          p_program_id: programId
        });
        
      if (error) throw error;
      
      if (!result || !result.success) {
        throw new Error(result?.message || 'Failed to remove user from program');
      }
      
      // Update local state
      setUsers(prev => prev.filter(user => user.id !== relationId));
      toast.success('User removed from program');
    } catch (error) {
      console.error('Error removing user from program:', error);
      toast.error('Failed to remove user from program');
    }
  };
  
  const filteredUsers = searchQuery 
    ? users.filter(user => 
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.full_name && user.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.company && user.company.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : users;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center">
            <Users className="h-5 w-5 text-primary-600 mr-2" />
            <h2 className="text-xl font-semibold">Program Users - {programName}</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4">
          {isAdmin && (
            <div className="mb-6 border-b pb-6">
              <h3 className="text-lg font-medium mb-4">Add New User</h3>
              <form onSubmit={formik.handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Email Address"
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter user email"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.email && formik.errors.email ? formik.errors.email : undefined}
                  />
                </div>
                
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={formik.values.role}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                  >
                    {roleOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {formik.touched.role && formik.errors.role && (
                    <p className="mt-1 text-sm text-error-600">{formik.errors.role}</p>
                  )}
                </div>
                
                <div className="md:col-span-3 flex justify-end">
                  <Button 
                    type="submit"
                    variant="primary"
                    icon={<UserPlus size={16} />}
                    isLoading={formik.isSubmitting}
                    disabled={!(formik.isValid && formik.dirty)}
                  >
                    Add User
                  </Button>
                </div>
              </form>
            </div>
          )}
          
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Current Users</h3>
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
                  {searchQuery ? 'No users match your search' : 'No users in this program yet'}
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
                      {isAdmin && (
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
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
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.full_name || 'Unnamed User'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {user.email}
                              </div>
                              {user.company && (
                                <div className="text-xs text-gray-400">
                                  {user.company}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isAdmin && !user.isCompanyMember ? (
                            <select
                              className="text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              value={user.role as string}
                              onChange={(e) => handleUpdateRole(user.user_id, user.id, e.target.value as UserRole)}
                            >
                              {roleOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : isAdmin && user.isCompanyMember ? (
                            <select
                              className="text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              value={user.role as string}
                              onChange={(e) => handleUpdateRole(user.user_id, user.id, e.target.value as UserRole)}
                            >
                              <option value="Company Member" disabled>Company Member</option>
                              {roleOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              user.isCompanyMember
                                ? 'bg-gray-100 text-gray-800'
                                : user.role === 'Admin' 
                                ? 'bg-primary-100 text-primary-800' 
                                : user.role === 'Edit'
                                ? 'bg-secondary-100 text-secondary-800'
                                : user.role === 'ReadOnly'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-accent-100 text-accent-800'
                            }`}>
                              {user.role}
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {user.isCompanyMember ? (
                              <span className="text-xs text-gray-500">Access via company membership</span>
                            ) : user.user_id === currentUserRole ? (
                              <span className="text-xs text-gray-500">Current user</span>
                            ) : (
                              <button
                                onClick={() => handleRemoveUser(user.user_id, user.id)}
                                className="text-error-600 hover:text-error-900"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        )}
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
      </div>
    </div>
  );
};

export default ProgramUsersModal;