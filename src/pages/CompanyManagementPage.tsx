import { useState } from 'react';
import { Building, Edit, Users, Link as LinkIcon } from 'lucide-react';
import useCompanies from '../hooks/useCompanies';
import Button from '../components/common/Button';
import Card, { CardContent, CardHeader } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import CompanyFormModal from '../components/companies/CompanyFormModal';
import CompanyUsersModal from '../components/companies/CompanyUsersModal';
import { toast } from 'react-toastify';

const CompanyManagementPage = () => {
  const {
    userCompany,
    isAdmin,
    isSuperAdmin,
    canCreate,
    loading,
    error,
    updateCompany,
    createCompany
  } = useCompanies();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);

  if (loading) {
    return <LoadingScreen />;
  }

  const handleCreateCompany = () => {
    if (canCreate) {
      setIsCreateModalOpen(true);
    } else {
      toast.error("You don't have permission to create a company");
    }
  };

  // Check if user can edit company details (company admin or super admin)
  const canEditCompany = isAdmin || isSuperAdmin;

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Company Management</h1>

      {error && (
        <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {!userCompany ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Building className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No Company Found</h3>
          <p className="mt-1 text-sm text-gray-500">
            You are not associated with any company yet.
          </p>
          {canCreate ? (
            <div className="mt-6">
              <Button
                variant="primary"
                onClick={handleCreateCompany}
              >
                Create New Company
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-error-600">
              You do not have permission to create a company. Please contact an administrator.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Company Details</h2>
                {canEditCompany && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Edit size={16} />}
                    onClick={() => setIsEditModalOpen(true)}
                  >
                    Edit Company
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 flex items-center justify-center bg-gray-100 rounded-lg border border-gray-300">
                  <Building className="h-12 w-12 text-gray-400" />
                </div>
              </div>

              <div className="md:col-span-2 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Company Name</h3>
                  <p className="text-gray-900 font-medium">{userCompany.name}</p>
                </div>

                {userCompany.description && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Description</h3>
                    <p className="text-gray-900">{userCompany.description}</p>
                  </div>
                )}

                {userCompany.website && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Website</h3>
                    <a
                      href={userCompany.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-800 flex items-center"
                    >
                      <LinkIcon size={14} className="mr-1" />
                      {userCompany.website}
                    </a>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Your Role</h3>
                  <p className="text-gray-900">
                    {isAdmin ? 'Company Administrator' : 'Company Member'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Company Users</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Users size={16} />}
                    onClick={() => setIsUsersModalOpen(true)}
                  >
                    Manage Users
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">
                  View and manage users associated with your company. You can designate which users have administrative rights 
                  to manage company details and other users.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Company Pilot Programs</h2>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">
                All members of your company can view data across all pilot programs associated with your company.
                {isAdmin && ' As a company administrator, you can create new pilot programs for your company.'}
              </p>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/programs'}
                >
                  View Pilot Programs
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals */}
      {isCreateModalOpen && (
        <CompanyFormModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={createCompany}
        />
      )}

      {isEditModalOpen && userCompany && (
        <CompanyFormModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSubmit={(data) => updateCompany(userCompany.company_id, data)}
          initialData={userCompany}
        />
      )}

      {isUsersModalOpen && userCompany && (
        <CompanyUsersModal
          isOpen={isUsersModalOpen}
          onClose={() => setIsUsersModalOpen(false)}
          companyId={userCompany.company_id}
          companyName={userCompany.name}
        />
      )}
    </div>
  );
};

export default CompanyManagementPage;