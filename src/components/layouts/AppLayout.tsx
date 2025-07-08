import { Outlet, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabaseClient';
import { usePilotProgramStore } from '../../stores/pilotProgramStore';
import useCompanies from '../../hooks/useCompanies';
import { 
  Home, 
  User, 
  LogOut,
  ChevronLeft,
  Menu,
  X,
  History,
  Building,
  Leaf,
  ClipboardList
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import useUserRole from '../../hooks/useUserRole';
import ActiveSessionsDrawer from '../submissions/ActiveSessionsDrawer';
import { useSessionStore } from '../../stores/sessionStore';
import sessionManager from '../../lib/sessionManager';
import Button from '../common/Button';

const AppLayout = () => {
  const { user } = useAuthStore();
  const { selectedProgram, selectedSite, resetAll } = usePilotProgramStore();
  const { userCompany, isAdmin: isCompanyAdmin } = useCompanies();
  const location = useLocation();
  const navigate = useNavigate();
  const { programId } = useParams<{ programId: string }>();
  const { canViewAuditLog } = useUserRole({ programId });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { 
    activeSessions, 
    setActiveSessions, 
    setIsLoading,
    isSessionsDrawerOpen,
    setIsSessionsDrawerOpen
  } = useSessionStore();
  const [hasActiveSessions, setHasActiveSessions] = useState(false);
  const [showSessionIndicator, setShowSessionIndicator] = useState(false);
  
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      resetAll();
      navigate('/login');
    } catch (error) {
      toast.error('Error signing out');
    }
  };
  
  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);
  
  // Load active sessions periodically
  useEffect(() => {
    const loadActiveSessions = async () => {
      try {
        setIsLoading(true);
        const sessions = await sessionManager.getActiveSessions();
        // Filter out cancelled and expired sessions
        const filteredSessions = sessions.filter(
          session => session.session_status !== 'Cancelled' && session.session_status !== 'Expired'
        );
        setActiveSessions(filteredSessions);
        setHasActiveSessions(filteredSessions.length > 0);
      } catch (error) {
        console.error('Error loading active sessions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Load initially
    loadActiveSessions();
    
    // Set up interval (every 5 minutes)
    const interval = setInterval(loadActiveSessions, 5 * 60 * 1000);
    
    // Show session indicator after a delay
    const indicatorTimer = setTimeout(() => {
      setShowSessionIndicator(true);
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(indicatorTimer);
    };
  }, [setActiveSessions, setIsLoading]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-primary-700 text-white shadow-md" data-testid="app-header">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Mobile menu button */}
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                className="md:hidden p-1 sm:p-2 rounded-md hover:bg-primary-600 transition-colors"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                data-testid="mobile-menu-button"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              
              <Link to="/home" className="flex items-center" data-testid="app-logo-link">
                <Leaf className="h-5 w-5 sm:h-6 sm:w-6 mr-1 sm:mr-2" />
                <h1 className="text-lg sm:text-xl font-bold whitespace-nowrap overflow-hidden text-ellipsis">GasX InVivo</h1>
              </Link>
            </div>

            {/* Breadcrumbs (hide on mobile) */}
            <div className="hidden md:flex items-center space-x-2 text-sm" data-testid="breadcrumbs">
              <Link to="/home" className="hover:underline" data-testid="home-breadcrumb">
                Home
              </Link>
              {location.pathname.includes('/programs') && location.pathname !== '/programs' && (
                <>
                  <span>/</span>
                  <Link to="/programs" className="hover:underline" data-testid="programs-breadcrumb">Programs</Link>
                </>
              )}
              {selectedProgram && (
                <>
                  <span>/</span>
                  <Link to={`/programs/${selectedProgram.program_id}/sites`} className="hover:underline truncate max-w-[120px] md:max-w-[150px]" data-testid={`program-breadcrumb-${selectedProgram.program_id}`}>
                    {selectedProgram.name}
                  </Link>
                </>
              )}
              {selectedSite && (
                <>
                  <span>/</span>
                  <span className="truncate max-w-[120px] md:max-w-[150px]" data-testid={`site-breadcrumb-${selectedSite.site_id}`}>{selectedSite.name}</span>
                </>
              )}
            </div>

            {/* User menu (desktop) */}
            <div className="hidden md:flex items-center space-x-1 lg:space-x-2" data-testid="user-menu-desktop">
              <Link 
                to="/home" 
                className="flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors"
                data-testid="home-link"
              >
                <Home size={18} />
                <span className="hidden lg:inline">Home</span>
              </Link>
              
              <button
                className={`relative flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors ${
                  isSessionsDrawerOpen ? 'bg-primary-600' : ''
                }`}
                onClick={() => setIsSessionsDrawerOpen(!isSessionsDrawerOpen)}
                data-testid="sessions-button"
              >
                <ClipboardList size={18} />
                <span className="hidden lg:inline">Sessions</span>
                {hasActiveSessions && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-500 rounded-full"></span>
                )}
              </button>
              
              {userCompany && (
                <Link 
                  to="/company" 
                  className="flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors"
                  data-testid="company-link"
                >
                  <Building size={18} />
                  <span className="hidden lg:inline">Company</span>
                </Link>
              )}
              <Link 
                to="/profile" 
                className="flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors"
                data-testid="profile-link"
              >
                <User size={18} />
                <span className="hidden lg:inline">Profile</span>
              </Link>
              <button 
                onClick={handleSignOut}
                className="flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors"
                data-testid="signout-button"
              >
                <LogOut size={18} />
                <span className="hidden lg:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-gray-200 shadow-sm animate-fade-in" data-testid="mobile-menu">
          <div className="container mx-auto px-4 py-2 space-y-2">
            <Link 
              to="/home" 
              className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
              data-testid="mobile-home-link"
            >
              <div className="flex items-center space-x-2">
                <Home size={18} />
                <span>Home</span>
              </div>
            </Link>
            
            <Link 
              to="/programs" 
              className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
              data-testid="mobile-programs-link"
            >
              <div className="flex items-center space-x-2">
                <Home size={18} />
                <span>Programs</span>
              </div>
            </Link>
            {selectedProgram && (
              <>
                <Link 
                  to={`/programs/${selectedProgram.program_id}/sites`} 
                  className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                  data-testid={`mobile-program-link-${selectedProgram.program_id}`}
                >
                  <div className="flex items-center space-x-2">
                    <ChevronLeft size={18} />
                    <span className="truncate">{selectedProgram.name}</span>
                  </div>
                </Link>
                {canViewAuditLog && (
                  <Link 
                    to={`/programs/${selectedProgram.program_id}/audit-log`} 
                    className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                    data-testid={`mobile-audit-log-link-${selectedProgram.program_id}`}
                  >
                    <div className="flex items-center space-x-2">
                      <History size={18} />
                      <span>Audit Log</span>
                    </div>
                  </Link>
                )}
              </>
            )}
            {userCompany && (
              <Link 
                to="/company" 
                className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
                data-testid="mobile-company-link"
              >
                <div className="flex items-center space-x-2">
                  <Building size={18} />
                  <span>Company</span>
                </div>
              </Link>
            )}
            <Link 
              to="/profile" 
              className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
              data-testid="mobile-profile-link"
            >
              <div className="flex items-center space-x-2">
                <User size={18} />
                <span>Profile</span>
              </div>
            </Link>
            <button 
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-error-600"
              data-testid="mobile-signout-button"
            >
              <div className="flex items-center space-x-2">
                <LogOut size={18} />
                <span>Sign Out</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-grow container mx-auto px-3 sm:px-4 py-4 md:py-6 md:px-6" data-testid="app-main-content">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 py-3 sm:py-4 mt-auto" data-testid="app-footer">
        <div className="container mx-auto px-4 text-center text-xs sm:text-sm text-gray-600">
          <p>© {new Date().getFullYear()} GRM TEK - GasX InVivo Pilot Program Platform - Version 1.120. All rights reserved.</p>
        </div>
      </footer>
      
      {/* Active Sessions Drawer */}
      <ActiveSessionsDrawer
        isOpen={isSessionsDrawerOpen}
        onClose={() => {
          setIsSessionsDrawerOpen(false);
        }}
      />
      
      {/* Enhanced Mobile Sessions Button */}
      {showSessionIndicator && hasActiveSessions && (
        <div 
          className="fixed bottom-14 right-12 z-50 flex items-center bg-primary-600 rounded-full shadow-lg cursor-pointer animate-pulse"
          onClick={() => setIsSessionsDrawerOpen(true)}
          data-testid="mobile-sessions-button"
        >
          <div className="flex items-center px-4 py-3">
            <ClipboardList className="text-white" size={22} />
            <span className="text-white font-medium ml-2">Sessions</span>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-500 rounded-full"></span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLayout;