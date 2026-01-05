import { useState, useEffect } from 'react';
import { Users, Building2, UserPlus, Search, Shield, ShieldOff, Mail, UserCog, CheckCircle, XCircle } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import CompanyFormModal from '../components/companies/CompanyFormModal';
import CompanyUsersModal from '../components/companies/CompanyUsersModal';
import type { Company } from '../hooks/useCompanies';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  is_super_admin: boolean;
  is_company_admin: boolean;
  is_active: boolean;
  user_role: string;
  export_rights: string;
  created_at: string;
}

interface CompanyWithStats extends Company {
  user_count?: number;
  admin_count?: number;
}

const SuperAdminPanelPage = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'companies'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<CompanyWithStats[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);

  // Load users
  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, company_id, is_super_admin, is_company_admin, is_active, user_role, export_rights, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    }
  };

  // Load companies with stats
  const loadCompanies = async () => {
    try {
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (companiesError) throw companiesError;

      // Get user counts for each company
      const { data: userCounts, error: countsError } = await supabase
        .from('users')
        .select('company_id, is_company_admin')
        .not('company_id', 'is', null);

      if (countsError) throw countsError;

      const companiesWithStats = (companiesData || []).map(company => {
        const companyUsers = (userCounts || []).filter(u => u.company_id === company.company_id);
        return {
          ...company,
          user_count: companyUsers.length,
          admin_count: companyUsers.filter(u => u.is_company_admin).length
        };
      });

      setCompanies(companiesWithStats);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast.error('Failed to load companies');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadUsers(), loadCompanies()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // Filter users based on search
  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      user.email.toLowerCase().includes(search) ||
      user.full_name?.toLowerCase().includes(search) ||
      false
    );
  });

  // Group users
  const unassignedUsers = filteredUsers.filter(u => !u.company_id);
  const assignedUsers = filteredUsers.filter(u => u.company_id);
  const superAdmins = filteredUsers.filter(u => u.is_super_admin);

  // Assign user to company
  const handleAssignToCompany = async (userId: string, companyId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('add_user_to_company', {
          p_user_email: users.find(u => u.id === userId)?.email,
          p_company_id: companyId
        });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.message);
      }

      toast.success('User assigned to company');
      await loadUsers();
    } catch (error: any) {
      console.error('Error assigning user:', error);
      toast.error(error.message || 'Failed to assign user to company');
    }
  };

  // Remove user from company
  const handleRemoveFromCompany = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user from their company?')) return;

    try {
      const { data, error } = await supabase
        .rpc('remove_user_from_company', {
          p_user_id: userId
        });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.message);
      }

      toast.success('User removed from company');
      await loadUsers();
    } catch (error: any) {
      console.error('Error removing user:', error);
      toast.error(error.message || 'Failed to remove user from company');
    }
  };

  // Grant super admin
  const handleGrantSuperAdmin = async (userId: string) => {
    if (!confirm('Grant super admin privileges to this user?')) return;

    try {
      const { data, error } = await supabase
        .rpc('grant_super_admin', {
          p_user_id: userId
        });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.message);
      }

      toast.success('Super admin privileges granted');
      await loadUsers();
    } catch (error: any) {
      console.error('Error granting super admin:', error);
      toast.error(error.message || 'Failed to grant super admin');
    }
  };

  // Revoke super admin
  const handleRevokeSuperAdmin = async (userId: string) => {
    if (!confirm('Revoke super admin privileges from this user?')) return;

    try {
      const { data, error } = await supabase
        .rpc('revoke_super_admin', {
          p_user_id: userId
        });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.message);
      }

      toast.success('Super admin privileges revoked');
      await loadUsers();
    } catch (error: any) {
      console.error('Error revoking super admin:', error);
      toast.error(error.message || 'Failed to revoke super admin');
    }
  };

  // Deactivate user
  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`User ${action}d successfully`);
      await loadUsers();
    } catch (error: any) {
      console.error(`Error ${action}ing user:`, error);
      toast.error(`Failed to ${action} user`);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading admin panel...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          Super Admin Panel
        </h1>
        <p className="text-gray-600 mt-1">Manage users, companies, and system permissions</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('companies')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'companies'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Building2 className="w-4 h-4 inline mr-2" />
          Companies ({companies.length})
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Search */}
          <Card>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Input
                    leftIcon={<Search className="w-4 h-4" />}
                    placeholder="Search users by email or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Super Admins */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <h2 className="text-xl font-semibold">Super Administrators</h2>
                  <span className="text-sm text-gray-500">({superAdmins.length})</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {superAdmins.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No super admins</p>
              ) : (
                <div className="space-y-2">
                  {superAdmins.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Shield className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{user.email}</div>
                          {user.full_name && <div className="text-xs text-gray-600">{user.full_name}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!user.is_active && (
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">Inactive</span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeSuperAdmin(user.id)}
                          leftIcon={<ShieldOff className="w-3 h-3" />}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unassigned Users (Demo Mode) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-orange-600" />
                  <h2 className="text-xl font-semibold">Unassigned Users (Demo Mode)</h2>
                  <span className="text-sm text-gray-500">({unassignedUsers.length})</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {unassignedUsers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No unassigned users</p>
              ) : (
                <div className="space-y-2">
                  {unassignedUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{user.email}</div>
                          {user.full_name && <div className="text-xs text-gray-600">{user.full_name}</div>}
                          <div className="text-xs text-gray-500 mt-0.5">
                            Registered: {new Date(user.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignToCompany(user.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="text-sm px-3 py-1.5 border border-gray-300 rounded-md"
                        >
                          <option value="">Assign to Company...</option>
                          {companies.map(company => (
                            <option key={company.company_id} value={company.company_id}>
                              {company.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGrantSuperAdmin(user.id)}
                          leftIcon={<Shield className="w-3 h-3" />}
                        >
                          Make Super Admin
                        </Button>
                        <button
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                          className={`p-1.5 rounded ${
                            user.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={user.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {user.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assigned Users */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-semibold">Assigned Users</h2>
                  <span className="text-sm text-gray-500">({assignedUsers.length})</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assignedUsers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No assigned users</p>
              ) : (
                <div className="space-y-2">
                  {assignedUsers.map(user => {
                    const userCompany = companies.find(c => c.company_id === user.company_id);
                    return (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <UserCog className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="font-medium text-sm text-gray-900">{user.email}</div>
                            {user.full_name && <div className="text-xs text-gray-600">{user.full_name}</div>}
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-500">
                                {userCompany?.name || 'Unknown Company'}
                              </span>
                              {user.is_company_admin && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">Admin</span>
                              )}
                              <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                                {user.user_role}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!user.is_active && (
                            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">Inactive</span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveFromCompany(user.id)}
                          >
                            Remove
                          </Button>
                          <button
                            onClick={() => handleToggleActive(user.id, user.is_active)}
                            className={`p-1.5 rounded ${
                              user.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={user.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {user.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Companies Tab */}
      {activeTab === 'companies' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Companies</h2>
                <Button
                  variant="primary"
                  onClick={() => setShowCompanyModal(true)}
                  leftIcon={<Building2 className="w-4 h-4" />}
                >
                  New Company
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {companies.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No companies yet. Create one to get started.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {companies.map(company => (
                    <div
                      key={company.company_id}
                      className="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{company.name}</h3>
                          {company.description && (
                            <p className="text-xs text-gray-600 mt-1">{company.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-600 mt-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>{company.user_count || 0} users</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>{company.admin_count || 0} admins</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => {
                            setSelectedCompanyId(company.company_id);
                            setShowUsersModal(true);
                          }}
                        >
                          Manage Users
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals */}
      {showCompanyModal && (
        <CompanyFormModal
          isOpen={showCompanyModal}
          onClose={() => {
            setShowCompanyModal(false);
            loadCompanies();
          }}
        />
      )}

      {showUsersModal && selectedCompanyId && (
        <CompanyUsersModal
          isOpen={showUsersModal}
          onClose={() => {
            setShowUsersModal(false);
            setSelectedCompanyId(null);
            loadUsers();
            loadCompanies();
          }}
          companyId={selectedCompanyId}
          companyName={companies.find(c => c.company_id === selectedCompanyId)?.name || ''}
        />
      )}
    </div>
  );
};

export default SuperAdminPanelPage;
