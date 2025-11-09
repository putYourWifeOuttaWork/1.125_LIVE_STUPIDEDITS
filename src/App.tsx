import { useEffect, useState, Suspense, lazy, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { useAuthStore } from './stores/authStore';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DeactivatedUserPage from './pages/DeactivatedUserPage';
import ProtectedRoute from './components/routing/ProtectedRoute';
import AppLayout from './components/layouts/AppLayout';
import LoadingScreen from './components/common/LoadingScreen';
import syncManager from './utils/syncManager';
import ErrorPage from './pages/ErrorPage';
import ErrorBoundary from './components/common/ErrorBoundary';
import { toast } from 'react-toastify';
import sessionManager from './lib/sessionManager';
import { useSessionStore } from './stores/sessionStore';
import { usePilotProgramStore } from './stores/pilotProgramStore';
import NetworkStatusIndicator from './components/common/NetworkStatusIndicator';
import { registerAuthErrorHandler } from './lib/queryClient';
import RequireSuperAdmin from './components/routing/RequireSuperAdmin';

// Lazy load pages to improve initial load time
const HomePage = lazy(() => import('./pages/HomePage'));
const PilotProgramsPage = lazy(() => import('./pages/PilotProgramsPage'));
const SitesPage = lazy(() => import('./pages/SitesPage'));
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage'));
const SubmissionEditPage = lazy(() => import('./pages/SubmissionEditPage'));
const NewSubmissionPage = lazy(() => import('./pages/NewSubmissionPage'));
const SiteTemplateManagementPage = lazy(() => import('./pages/SiteTemplateManagementPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const CompanyManagementPage = lazy(() => import('./pages/CompanyManagementPage'));
const UserAuditPage = lazy(() => import('./pages/UserAuditPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const DeviceDetailPage = lazy(() => import('./pages/DeviceDetailPage'));
const DevicePoolPage = lazy(() => import('./pages/DevicePoolPage'));

function App() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { resetAll } = usePilotProgramStore();
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [authError, setAuthError] = useState<Error | null>(null);
  const [isUserDeactivated, setIsUserDeactivated] = useState(false);
  
  // Session management from session store
  const { 
    setActiveSessions, 
    setIsLoading, 
    setCurrentSessionId
  } = useSessionStore();
  
  // Add a ref to track if auto-sync has been initialized
  const autoSyncInitialized = useRef(false);
  const visibilityChangeInitialized = useRef(false);

  // Register auth error handler
  useEffect(() => {
    // Register a handler for auth errors
    const unregister = registerAuthErrorHandler(() => {
      console.log('Auth error handler triggered in App.tsx');
      setUser(null);
      setCurrentSessionId(null);
      resetAll();
      // No need to navigate here, the global handler will redirect
    });

    // Cleanup on unmount
    return () => {
      unregister();
    };
  }, [setUser, setCurrentSessionId, resetAll]);

  // Check for pending submissions
  useEffect(() => {
    const checkPendingSubmissions = async () => {
      if (!user) return;
      
      const count = await syncManager.getPendingSubmissionsCount();
      setPendingCount(count);
      
      if (count > 0 && isOnline) {
        // Attempt to sync pending submissions
        const { success, pendingCount: remainingCount } = await syncManager.syncPendingSubmissions();
        
        setPendingCount(remainingCount);
      }
    };
    
    checkPendingSubmissions();
  }, [user, isOnline]);

  // Set up auto-sync when online
  useEffect(() => {
    // Don't setup auto-sync if no user or already initialized
    if (!user || autoSyncInitialized.current) return;
    
    autoSyncInitialized.current = true;
    
    const cleanup = syncManager.setupAutoSync();
    
    return () => {
      cleanup();
      // Reset flag if component unmounts (rare for App component but good practice)
      autoSyncInitialized.current = false;
    };
  }, [user]);

  // Handle visibility change event to detect when app comes back into focus
  useEffect(() => {
    // Only set up once and only if we have a user
    if (visibilityChangeInitialized.current || !user) return;
    
    visibilityChangeInitialized.current = true;
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && user) {
        console.log('App has come back into focus, checking connection state');

        // NOTE: Removed force reload as it causes infinite loop
        // The rest of this function handles reconnection gracefully
        try {
          // Verify the session is still valid
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('Session error during reconnection:', sessionError);
            return;
          }
          
          if (!sessionData.session) {
            console.log('No session found during reconnection check');
            setUser(null);
            setCurrentSessionId(null);
            resetAll();
            window.location.reload(true);
            return;
          }
          
          // If we're online, check for pending submissions and try to sync
          if (isOnline) {
            console.log('Online after visibility change, checking for pending submissions');
            const count = await syncManager.getPendingSubmissionsCount();
            setPendingCount(count);
            
            if (count > 0) {
              // Attempt to sync pending submissions
              const { pendingCount: remainingCount } = await syncManager.syncPendingSubmissions();
              setPendingCount(remainingCount);
            }
          }
          
          // Refresh active sessions
          try {
            setIsLoading(true);
            const sessions = await sessionManager.getActiveSessions();
            // Filter out cancelled and expired sessions
            const filteredSessions = sessions.filter(
              session => !['Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(session.session_status)
            );
            setActiveSessions(filteredSessions);
          } catch (error) {
            console.error('Error refreshing active sessions after visibility change:', error);
          } finally {
            setIsLoading(false);
          }
          
        } catch (error) {
          console.error('Error during reconnection process:', error);
          toast.error('Error reconnecting to the server. Please reload the page.');
          return;
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      visibilityChangeInitialized.current = false;
    };
  }, [user, isOnline, navigate, setUser, resetAll, setCurrentSessionId, setActiveSessions, setIsLoading]);

  // Check if user is deactivated and redirect if necessary
  const checkUserActive = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('is_active')
        .eq('id', userId)
        .single();
        
      if (error) throw error;
      
      if (data && data.is_active === false) {
        setIsUserDeactivated(true);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking user status:', error);
      return true; // Default to active if there's an error
    }
  };

  useEffect(() => {
    const setupAuth = async () => {
      try {
        console.log('Setting up auth...');
        
        // Check initial session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          throw sessionError;
        }
        
        if (sessionData.session) {
          console.log('User is authenticated:', sessionData.session.user.email);
          
          // Check if user is active
          const isActive = await checkUserActive(sessionData.session.user.id);
          
          if (!isActive) {
            console.log('User is deactivated');
            // Still set the user in auth store for DeactivatedUserPage to use
            setUser(sessionData.session.user);
            navigate('/deactivated');
          } else {
            setUser(sessionData.session.user);
          }
        } else {
          console.log('No active session found');
        }
        
        // Set up auth state listener
        const { data: authListener } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('Auth state changed:', event);

            // Handle token refresh failures specifically
            if (event === 'TOKEN_REFRESHED' && !session) {
              console.log('Token refresh failed, redirecting to login');
              setUser(null);
              setCurrentSessionId(null);
              resetAll();
              // Replace navigation with a hard page reload
              window.location.reload();
              return;
            }

            if (session) {
              // Check if user is active on auth state change
              const isActive = await checkUserActive(session.user.id);
              
              if (!isActive) {
                console.log('User is deactivated on auth state change');
                // Still set the user in auth store for DeactivatedUserPage to use
                setUser(session.user);
                navigate('/deactivated');
              } else {
                setUser(session.user);
              }
            } else {
              setUser(null);
              setCurrentSessionId(null);
              resetAll();
              setIsUserDeactivated(false);
            }
          }
        );
        
        return () => {
          authListener.subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Auth setup error:', error);
        
        // Check if error is related to refresh token issues
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (
          errorMessage.includes('refresh_token_not_found') || 
          errorMessage.includes('Invalid Refresh Token') ||
          errorMessage.includes('Refresh Token Not Found')
        ) {
          console.log('Refresh token error, redirecting to login');
          setUser(null);
          setCurrentSessionId(null);
          resetAll();
          // Replace navigation with a hard page reload
          window.location.reload();
        } else {
          setAuthError(error instanceof Error ? error : new Error('Unknown authentication error'));
        }
      } finally {
        setLoading(false);
      }
    };
    
    setupAuth();
  }, [setUser, navigate, resetAll, setCurrentSessionId]);

  if (loading) {
    return <LoadingScreen />;
  }
  
  if (authError) {
    return <ErrorPage error={authError} />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Network status indicator */}
        <NetworkStatusIndicator />
        
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/home" />} />
          <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/home" />} />
          <Route path="/forgot-password" element={!user ? <ForgotPasswordPage /> : <Navigate to="/home" />} />
          <Route path="/reset-password" element={!user ? <ResetPasswordPage /> : <Navigate to="/home" />} />
          <Route path="/deactivated" element={isUserDeactivated ? <DeactivatedUserPage /> : <Navigate to="/home" />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/home" element={
                <Suspense fallback={<LoadingScreen />}>
                  <HomePage />
                </Suspense>
              } />
              <Route path="/programs" element={
                <Suspense fallback={<LoadingScreen />}>
                  <PilotProgramsPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/sites" element={
                <Suspense fallback={<LoadingScreen />}>
                  <SitesPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/sites/:siteId" element={
                <Suspense fallback={<LoadingScreen />}>
                  <SubmissionsPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/sites/:siteId/new-submission" element={
                <Suspense fallback={<LoadingScreen />}>
                  <NewSubmissionPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/sites/:siteId/submissions/:submissionId/edit" element={
                <Suspense fallback={<LoadingScreen />}>
                  <SubmissionEditPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/sites/:siteId/template" element={
                <Suspense fallback={<LoadingScreen />}>
                  <SiteTemplateManagementPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/audit-log" element={
                <Suspense fallback={<LoadingScreen />}>
                  <AuditLogPage />
                </Suspense>
              } />
              <Route path="/programs/:programId/sites/:siteId/audit-log" element={
                <Suspense fallback={<LoadingScreen />}>
                  <AuditLogPage />
                </Suspense>
              } />
              <Route path="/user-audit/:userId" element={
                <Suspense fallback={<LoadingScreen />}>
                  <UserAuditPage />
                </Suspense>
              } />
              <Route path="/profile" element={
                <Suspense fallback={<LoadingScreen />}>
                  <UserProfilePage />
                </Suspense>
              } />
              <Route path="/company" element={
                <Suspense fallback={<LoadingScreen />}>
                  <CompanyManagementPage />
                </Suspense>
              } />
              <Route path="/devices" element={
                <Suspense fallback={<LoadingScreen />}>
                  <DevicesPage />
                </Suspense>
              } />
              <Route path="/devices/:deviceId" element={
                <Suspense fallback={<LoadingScreen />}>
                  <DeviceDetailPage />
                </Suspense>
              } />
              <Route path="/device-pool" element={
                <RequireSuperAdmin>
                  <Suspense fallback={<LoadingScreen />}>
                    <DevicePoolPage />
                  </Suspense>
                </RequireSuperAdmin>
              } />
            </Route>
          </Route>
          
          <Route path="/error" element={<ErrorPage />} />
          <Route path="*" element={<Navigate to={user ? '/home' : '/login'} />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

export default App;