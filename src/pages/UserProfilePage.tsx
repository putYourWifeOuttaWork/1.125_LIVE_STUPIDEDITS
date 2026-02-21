import { User, Building, Users, Info, Link as LinkIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '../components/common/Card';
import Button from '../components/common/Button';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import EditProfileModal from '../components/profile/EditProfileModal';
import { useState } from 'react';
import { useUserProfile } from '../hooks/useUserProfile';
import ProgramDetailsModal from '../components/pilotPrograms/ProgramDetailsModal';
import ProgramStatusBadge from '../components/pilotPrograms/ProgramStatusBadge';
import { PilotProgram } from '../lib/types';
import useCompanies from '../hooks/useCompanies';

const UserProfilePage = () => {
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<PilotProgram | null>(null);
  const { profile, userPrograms, recentSubmissions, loading } = useUserProfile();
  const { userCompany, isAdmin: isCompanyAdmin, loading: companyLoading } = useCompanies();

  if (loading || companyLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Info */}
        <Card className="md:col-span-1">
          <CardHeader>
            <h2 className="text-lg font-semibold">User Information</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center mb-4">
              <div className="bg-primary-100 rounded-full p-6 w-24 h-24 flex items-center justify-center">
                <User size={48} className="text-primary-600" />
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Email</h3>
              <p className="text-gray-900">{profile.email}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Full Name</h3>
              <p className="text-gray-900">{profile.full_name || 'Not set'}</p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Company</h3>
              {userCompany ? (
                <div className="flex items-center">
                  <p className="text-gray-900 mr-2">{userCompany.name}</p>
                  {isCompanyAdmin && <span className="pill bg-primary-100 text-primary-800">Admin</span>}
                </div>
              ) : (
                <p className="text-gray-500">No company associated</p>
              )}
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-500">Account Created</h3>
              <p className="text-gray-900">{format(new Date(profile.created_at), 'PPP')}</p>
            </div>
            
            <div className="flex flex-col space-y-2 pt-2">
              <Button 
                variant="outline"
                onClick={() => setIsEditModalOpen(true)}
              >
                Edit Profile
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => navigate('/company')}
              >
                {userCompany ? 'Manage Company' : 'Join/Create Company'}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          currentEmail={profile.email}
          currentFullName={profile.full_name || ''}
          currentCompany={profile.company || ''}
          currentAvatarUrl={profile.avatar_url}
        />
        
        {/* Company Info (if available) */}
        {userCompany && (
          <Card className="md:col-span-2">
            <CardHeader>
              <h2 className="text-lg font-semibold">My Company</h2>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded-lg">
                  <Building className="h-12 w-12 text-gray-400" />
                </div>
              </div>
              
              <div className="md:col-span-2 space-y-3">
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
                
                <div className="pt-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/company')}
                  >
                    Manage Company
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* My Pilot Programs */}
        <Card className="md:col-span-3">
          <CardHeader>
            <h2 className="text-lg font-semibold">My Pilot Programs</h2>
          </CardHeader>
          <CardContent>
            {userPrograms.length === 0 ? (
              <div className="text-center py-8">
                <Building className="mx-auto h-10 w-10 text-gray-400" />
                <h3 className="mt-2 font-medium text-gray-900">No pilot programs yet</h3>
                <p className="text-sm text-gray-500">You haven't been added to any pilot programs.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userPrograms.map(({ program, role }) => (
                  <div key={program.program_id} className="border border-gray-200 rounded-md p-4">
                    <div className="flex justify-between mb-2">
                      <h3 
                        className="font-medium text-gray-900 cursor-pointer hover:text-primary-600"
                        onClick={() => navigate(`/programs/${program.program_id}/sites`)}
                      >
                        {program.name}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <ProgramStatusBadge
                          effectiveStatus={program.effective_status}
                          hasActiveDevices={program.has_active_devices}
                          size="sm"
                        />
                        <button 
                          className="text-gray-500 hover:text-gray-700"
                          onClick={() => setSelectedProgram(program)}
                          aria-label="View program details"
                        >
                          <Info size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">{program.description}</p>
                    <div className="flex justify-between text-sm">
                      <div className="flex items-center text-gray-500">
                        <Building size={14} className="mr-1" />
                        <span>{program.total_sites} Sites</span>
                      </div>
                      <div className="flex items-center text-gray-500">
                        <Users size={14} className="mr-1" />
                        <span>Role: {role}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Recent Activity */}
        <Card className="md:col-span-3">
          <CardHeader>
            <h2 className="text-lg font-semibold">Recent Activity</h2>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No recent activity</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Site</th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Temperature</th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Humidity</th>
                      <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Petri Samples</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentSubmissions.map((submission) => (
                      <tr key={submission.submission_id} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(submission.created_at), 'PPp')}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.sites?.name || 'Unknown Site'}
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.temperature}°F
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                          {submission.humidity}%
                        </td>
                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                          {Array.isArray(submission.petri_observations) && submission.petri_observations.length > 0 
                            ? submission.petri_observations[0].count 
                            : 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Program Details Modal */}
      {selectedProgram && (
        <ProgramDetailsModal
          isOpen={!!selectedProgram}
          onClose={() => setSelectedProgram(null)}
          program={selectedProgram}
        />
      )}
    </div>
  );
};

export default UserProfilePage;