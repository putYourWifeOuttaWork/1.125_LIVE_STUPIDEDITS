import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import LoadingScreen from '../common/LoadingScreen';
import { User } from '../../lib/types';

const ProtectedRoute = () => {
  const { user, setUser } = useAuthStore();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserProfile = async () => {
      // First check if we have an authenticated session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      try {
        // Load complete user profile from database
        const { data: userProfile, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) throw error;

        // Merge auth user data with profile data
        const fullUser: User = {
          id: session.user.id,
          email: session.user.email || userProfile.email,
          full_name: userProfile.full_name,
          company: userProfile.company,
          company_id: userProfile.company_id,
          avatar_url: userProfile.avatar_url,
          is_active: userProfile.is_active,
          is_company_admin: userProfile.is_company_admin,
          is_super_admin: userProfile.is_super_admin,
          user_role: userProfile.user_role,
          export_rights: userProfile.export_rights,
          created_at: userProfile.created_at,
          updated_at: userProfile.updated_at,
          user_metadata: session.user.user_metadata
        };

        setUser(fullUser);
      } catch (error) {
        console.error('Error loading user profile:', error);
        // If we can't load the profile, clear the user
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserProfile();
  }, [setUser]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    // Redirect to the login page, but save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.is_active === false) {
    // Redirect to deactivated page
    return <Navigate to="/deactivated" replace />;
  }

  // User is authenticated and active, render the child routes
  return <Outlet />;
};

export default ProtectedRoute;