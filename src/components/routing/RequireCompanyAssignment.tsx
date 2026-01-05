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
        const { data, error } = await supabase
          .rpc('get_user_permission_status');

        if (error) {
          console.error('Error checking permissions:', error);
          setLoading(false);
          return;
        }

        setHasCompany(data.has_company);
        setIsSuperAdmin(data.is_super_admin);
      } catch (error) {
        console.error('Error in RequireCompanyAssignment:', error);
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  // Super admins can access everything
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Users without a company assignment go to demo
  if (!hasCompany) {
    return <Navigate to="/demo" state={{ from: location }} replace />;
  }

  // Users with a company can proceed
  return <>{children}</>;
};

export default RequireCompanyAssignment;
