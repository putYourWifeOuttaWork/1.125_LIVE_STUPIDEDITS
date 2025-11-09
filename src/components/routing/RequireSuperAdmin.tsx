import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import LoadingScreen from '../common/LoadingScreen';

interface RequireSuperAdminProps {
  children: ReactNode;
  fallbackPath?: string;
  showMessage?: boolean;
}

const RequireSuperAdmin = ({
  children,
  fallbackPath = '/',
  showMessage = true
}: RequireSuperAdminProps) => {
  const { profile, loading } = useUserProfile();

  if (loading) {
    return <LoadingScreen />;
  }

  const isSuperAdmin = profile?.is_super_admin === true && profile?.is_active === true;

  if (!isSuperAdmin) {
    if (showMessage) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-red-100 p-3">
                <ShieldOff className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Super Admin Access Required
            </h2>
            <p className="text-gray-600 mb-6">
              This page is restricted to super administrators only. You don't have the necessary permissions to access this resource.
            </p>
            <a
              href="/"
              className="inline-block bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors"
            >
              Return to Home
            </a>
          </div>
        </div>
      );
    }

    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};

export default RequireSuperAdmin;
