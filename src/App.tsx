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
import RequireCompanyAdmin from './components/routing/RequireCompanyAdmin';
import { createLogger } from './utils/logger';

const log = createLogger('Auth');

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
const SiteDeviceSessionDetailPage = lazy(() => import('./pages/SiteDeviceSessionDetailPage'));
const NotificationSettingsPage = lazy(() => import('./pages/NotificationSettingsPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const LanderPage = lazy(() => import('./pages/LanderPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ReportBuilderPage = lazy(() => import('./pages/ReportBuilderPage'));
const ReportViewPage = lazy(() => import('./pages/ReportViewPage'));
const MgiReviewPage = lazy(() => import('./pages/MgiReviewPage'));

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
  
  const autoSyncInitialized = useRef(false);
  const visibilityChangeInitialized = useRef(false);

  // Register auth error handler
  useEffect(() => {
    // Register a handler for auth errors
    const unregister = registerAuthErrorHandler(() => {
      log.debug('Auth error handler triggered');
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

  useEffect(() => {
    if (visibilityChangeInitialized.current || !user) return;
    visibilityChangeInitialized.current = true;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        window.location.reload();
      }
    };

    const handleOnline = () => {
      window.location.reload();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      visibilityChangeInitialized.current = false;
    };
  }, [user]);

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
      log.error('Error checking user status:', error);
      return true;
    }
  };

  // Auth setup - runs once on app mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupAuth = async () => {
      try {
        log.debug('Setting up auth...');

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          log.error('Session error:', sessionError);
          throw sessionError;
        }

        if (sessionData.session) {
          log.debug('User is authenticated:', sessionData.session.user.email);

          const isActive = await checkUserActive(sessionData.session.user.id);

          if (!isActive) {
            log.warn('User is deactivated');
            setUser(sessionData.session.user);
            navigate('/deactivated');
          } else {
            setUser(sessionData.session.user);
          }
        } else {
          log.debug('No active session found');
        }

        const { data: authListener } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            log.debug('Auth state changed:', event);

            if (event === 'TOKEN_REFRESHED' && !session) {
              log.warn('Token refresh failed, redirecting to login');
              setUser(null);
              setCurrentSessionId(null);
              resetAll();
              window.location.reload();
              return;
            }

            if (session) {
              const isActive = await checkUserActive(session.user.id);

              if (!isActive) {
                log.warn('User is deactivated on auth state change');
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

        unsubscribe = () => {
          authListener.subscription.unsubscribe();
        };
      } catch (error) {
        log.error('Auth setup error:', error);

        const errorMessage = error instanceof Error ? error.message : String(error);

        if (
          errorMessage.includes('refresh_token_not_found') ||
          errorMessage.includes('Invalid Refresh Token') ||
          errorMessage.includes('Refresh Token Not Found')
        ) {
          log.warn('Refresh token error, redirecting to login');
          setUser(null);
          setCurrentSessionId(null);
          resetAll();
          window.location.reload();
        } else {
          setAuthError(error instanceof Error ? error : new Error('Unknown authentication error'));
        }
      } finally {
        setLoading(false);
      }
    };

    setupAuth();

    // Return cleanup function - only runs on app unmount
    return () => {
      if (unsubscribe) {
        log.debug('Cleaning up auth listener on unmount');
        unsubscribe();
      }
    };
  }, []);

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
          <Route path="/lander" element={
            <Suspense fallback={<LoadingScreen />}>
              <LanderPage />
            </Suspense>
          } />
          
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
              <Route path="/programs/:programId/sites/:siteId/device-sessions/:sessionId" element={
                <Suspense fallback={<LoadingScreen />}>
                  <SiteDeviceSessionDetailPage />
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
              <Route path="/notifications" element={
                <Suspense fallback={<LoadingScreen />}>
                  <NotificationSettingsPage />
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
              <Route path="/alerts" element={
                <Suspense fallback={<LoadingScreen />}>
                  <AlertsPage />
                </Suspense>
              } />
              <Route path="/analytics" element={
                <Suspense fallback={<LoadingScreen />}>
                  <AnalyticsPage />
                </Suspense>
              } />
              <Route path="/analytics/builder" element={
                <Suspense fallback={<LoadingScreen />}>
                  <ReportBuilderPage />
                </Suspense>
              } />
              <Route path="/analytics/:reportId" element={
                <Suspense fallback={<LoadingScreen />}>
                  <ReportViewPage />
                </Suspense>
              } />
              <Route path="/analytics/:reportId/edit" element={
                <Suspense fallback={<LoadingScreen />}>
                  <ReportBuilderPage />
                </Suspense>
              } />
              <Route path="/mgi-review" element={
                <Suspense fallback={<LoadingScreen />}>
                  <RequireSuperAdmin>
                    <MgiReviewPage />
                  </RequireSuperAdmin>
                </Suspense>
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