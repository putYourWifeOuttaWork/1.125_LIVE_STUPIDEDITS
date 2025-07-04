import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import LoadingScreen from '../common/LoadingScreen';

const ProtectedRoute = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const [isUserActive, setIsUserActive] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUserStatus = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('is_active')
          .eq('id', user.id)
          .single();
          
        if (error) throw error;
        
        setIsUserActive(data.is_active !== false);
      } catch (error) {
        console.error('Error checking user status:', error);
        // Default to active if there's an error
        setIsUserActive(true);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkUserStatus();
  }, [user]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    // Redirect to the login page, but save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isUserActive === false) {
    // Redirect to deactivated page
    return <Navigate to="/deactivated" replace />;
  }

  // User is authenticated and active, render the child routes
  return <Outlet />;
};

export default ProtectedRoute;