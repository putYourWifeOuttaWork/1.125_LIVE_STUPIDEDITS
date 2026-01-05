import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import LoadingScreen from '../common/LoadingScreen';

interface RequireCompanyAssignmentProps {
  children: ReactNode;
}

/**
 * Protects routes that require users to be assigned to a company.
 * Redirects unassigned users to the demo experience.
 * Super admins bypass this check.
 */
const RequireCompanyAssignment = ({ children }: RequireCompanyAssignmentProps) => {
  const [loading, setLoading] = useState(true);
  const [hasCompany, setHasCompany] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        console.log('RequireCompanyAssignment: Checking permissions...');
        const { data, error } = await supabase
          .rpc('get_user_permission_status');

        if (error) {
          console.error('RequireCompanyAssignment: RPC error:', error);
          setLoading(false);
          return;
        }

        console.log('RequireCompanyAssignment: Permission data:', data);
        setHasCompany(data.has_company);
        setIsSuperAdmin(data.is_super_admin);
      } catch (error) {
        console.error('RequireCompanyAssignment: Exception:', error);
      } finally {
        console.log('RequireCompanyAssignment: Done loading');
        setLoading(false);
      }
    };

    checkPermissions();
  }, []);

  if (loading) {
    console.log('RequireCompanyAssignment: Still loading, showing LoadingScreen');
    return <LoadingScreen />;
  }

  console.log('RequireCompanyAssignment: Rendering decision:', { isSuperAdmin, hasCompany });

  // Super admins can access everything
  if (isSuperAdmin) {
    console.log('RequireCompanyAssignment: User is super admin, allowing access');
    return <>{children}</>;
  }

  // Users without a company assignment go to demo
  if (!hasCompany) {
    console.log('RequireCompanyAssignment: User has no company, redirecting to /demo');
    return <Navigate to="/demo" state={{ from: location }} replace />;
  }

  // Users with a company can proceed
  console.log('RequireCompanyAssignment: User has company, rendering children');
  return <>{children}</>;
};

export default RequireCompanyAssignment;
