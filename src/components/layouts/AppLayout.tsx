import { Outlet, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabaseClient';
import { usePilotProgramStore } from '../../stores/pilotProgramStore';
import useCompanies from '../../hooks/useCompanies';
import { useCompanyFilterStore } from '../../stores/companyFilterStore';
import {
  Menu,
  X,
  ChevronDown,
  Shield,
  Building,
  Leaf,
  MoreHorizontal,
} from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import useUserRole from '../../hooks/useUserRole';
import ActiveSessionsDrawer from '../submissions/ActiveSessionsDrawer';
import { useSessionStore } from '../../stores/sessionStore';
import ReloadLink from '../common/ReloadLink';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { useMgiReviewPendingCount } from '../../hooks/useMgiReview';
import { navItems, NavItem } from './navConfig';
import { VoiceInputFAB } from '../voice/VoiceInputFAB';

const AppLayout = () => {
  const { user } = useAuthStore();
  const { selectedProgram, resetAll } = usePilotProgramStore();
  const { userCompany, isAdmin: isCompanyAdmin, isSuperAdmin, companies, fetchAllCompanies } = useCompanies();
  const { selectedCompanyId, setActiveCompanyContext, loadActiveCompanyContext, isLoading: companyContextLoading } = useCompanyFilterStore();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { programId } = useParams<{ programId: string }>();
  const { canViewAuditLog } = useUserRole({ programId });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const {
    isSessionsDrawerOpen,
    setIsSessionsDrawerOpen
  } = useSessionStore();
  const [hasActiveSessions, setHasActiveSessions] = useState(false);
  const [showSessionIndicator, setShowSessionIndicator] = useState(false);
  const { data: mgiPendingCount } = useMgiReviewPendingCount();

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAllCompanies();
    }
    loadActiveCompanyContext();
  }, [isSuperAdmin, fetchAllCompanies, loadActiveCompanyContext]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCompanyFilterDisplay = () => {
    if (!selectedCompanyId) return userCompany?.name || 'No Company';
    const company = companies.find(c => c.company_id === selectedCompanyId);
    return company ? company.name : 'Unknown Company';
  };

  const handleCompanyChange = async (companyId: string) => {
    if (!user) return;

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ company_id: companyId })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating user company:', updateError);
        toast.error('Failed to switch company');
        return;
      }

      await setActiveCompanyContext(companyId);
      setShowCompanyDropdown(false);

      const companyName = companies.find(c => c.company_id === companyId)?.name || 'company';
      toast.success(`Switched to ${companyName}`);

      window.location.reload();
    } catch (error) {
      console.error('Error switching company:', error);
      toast.error('Failed to switch company');
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      resetAll();
      navigate('/login');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const checkActiveDeviceSessions = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const { count, error } = await supabase
          .from('site_device_sessions')
          .select('session_id', { count: 'exact', head: true })
          .in('status', ['in_progress'])
          .gte('session_date', todayStr);

        if (!error) {
          setHasActiveSessions((count ?? 0) > 0);
        }
      } catch (error) {
        console.error('Error checking active sessions:', error);
      }
    };

    checkActiveDeviceSessions();

    const interval = setInterval(checkActiveDeviceSessions, 5 * 60 * 1000);

    const indicatorTimer = setTimeout(() => {
      setShowSessionIndicator(true);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(indicatorTimer);
    };
  }, []);

  const isVisible = (item: NavItem) => {
    if (item.requireSuperAdmin && !isSuperAdmin) return false;
    if (item.requireAdmin && !isCompanyAdmin) return false;
    if (item.requireCompany && !userCompany) return false;
    return true;
  };

  const handleNavAction = (item: NavItem) => {
    if (item.action === 'sessions') {
      setIsSessionsDrawerOpen(!isSessionsDrawerOpen);
    } else if (item.action === 'signout') {
      handleSignOut();
    }
  };

  const getBadge = (item: NavItem) => {
    if (item.badge === 'sessions' && hasActiveSessions) {
      return <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-500 rounded-full" />;
    }
    if (item.badge === 'mgiPending' && mgiPendingCount && mgiPendingCount > 0) {
      return (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-amber-500 text-white rounded-full">
          {mgiPendingCount > 99 ? '99+' : mgiPendingCount}
        </span>
      );
    }
    return null;
  };

  const primaryItems = navItems.filter(i => i.group === 'primary' && isVisible(i));
  const overflowItems = navItems.filter(i => i.group === 'overflow' && isVisible(i));

  const renderDesktopNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const baseClass = "relative flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors";
    const activeClass = item.action === 'sessions' && isSessionsDrawerOpen ? ' bg-primary-600' : '';

    if (item.action) {
      return (
        <button
          key={item.key}
          className={`${baseClass}${activeClass}`}
          onClick={() => handleNavAction(item)}
          data-testid={`${item.key}-button`}
        >
          <Icon size={18} />
          <span className="hidden lg:inline">{item.label}</span>
          {getBadge(item)}
        </button>
      );
    }

    const isReloadLink = item.key === 'devices' || item.key === 'analytics';

    if (isReloadLink) {
      return (
        <ReloadLink
          key={item.key}
          to={item.to!}
          className={baseClass}
          data-testid={`${item.key}-link`}
        >
          <Icon size={18} />
          <span className="hidden lg:inline">{item.label}</span>
          {getBadge(item)}
        </ReloadLink>
      );
    }

    return (
      <Link
        key={item.key}
        to={item.to!}
        className={baseClass}
        data-testid={`${item.key}-link`}
      >
        <Icon size={18} />
        <span className="hidden lg:inline">{item.label}</span>
        {getBadge(item)}
      </Link>
    );
  };

  const renderMobileNavItem = (item: NavItem) => {
    const Icon = item.icon;

    if (item.action === 'signout') {
      return (
        <button
          key={item.key}
          onClick={() => { handleSignOut(); setIsMobileMenuOpen(false); }}
          className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-error-600"
          data-testid={`mobile-${item.key}-button`}
        >
          <div className="flex items-center space-x-2">
            <Icon size={18} />
            <span>{item.label}</span>
          </div>
        </button>
      );
    }

    if (item.action === 'sessions') {
      return (
        <button
          key={item.key}
          onClick={() => { setIsSessionsDrawerOpen(!isSessionsDrawerOpen); setIsMobileMenuOpen(false); }}
          className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
          data-testid={`mobile-${item.key}-button`}
        >
          <div className="flex items-center space-x-2">
            <Icon size={18} />
            <span>{item.label}</span>
            {hasActiveSessions && (
              <span className="ml-auto w-2.5 h-2.5 bg-accent-500 rounded-full" />
            )}
          </div>
        </button>
      );
    }

    return (
      <Link
        key={item.key}
        to={item.to!}
        className="block px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
        onClick={() => setIsMobileMenuOpen(false)}
        data-testid={`mobile-${item.key}-link`}
      >
        <div className="flex items-center space-x-2">
          <Icon size={18} />
          <span>{item.label}</span>
          {item.badge === 'mgiPending' && !!mgiPendingCount && mgiPendingCount > 0 && (
            <span className="ml-auto px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
              {mgiPendingCount > 99 ? '99+' : mgiPendingCount}
            </span>
          )}
        </div>
      </Link>
    );
  };

  const operationsItems = navItems.filter(i => i.mobileSection === 'operations' && isVisible(i));
  const intelligenceItems = navItems.filter(i => i.mobileSection === 'intelligence' && isVisible(i));
  const settingsItems = navItems.filter(i => i.mobileSection === 'settings' && isVisible(i));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-primary-700 text-white shadow-md" data-testid="app-header">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
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

              <div className="hidden md:flex items-center space-x-2 ml-4">
                {isSuperAdmin && (
                  <span className="bg-accent-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center space-x-1" title="Super Administrator">
                    <Shield size={12} />
                    <span>Super Admin</span>
                  </span>
                )}

                {isSuperAdmin ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-primary-600 rounded-md hover:bg-primary-500 transition-colors text-sm"
                      data-testid="company-filter-dropdown"
                    >
                      <Building size={14} />
                      <span>{getCompanyFilterDisplay()}</span>
                      <ChevronDown size={14} />
                    </button>

                    {showCompanyDropdown && (
                      <div className="absolute top-full mt-1 right-0 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[200px] z-50">
                        {companies.map(company => (
                          <button
                            key={company.company_id}
                            onClick={() => handleCompanyChange(company.company_id)}
                            disabled={companyContextLoading}
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800 text-sm ${
                              selectedCompanyId === company.company_id ? 'bg-gray-100 font-semibold' : ''
                            } ${companyContextLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {company.name}
                            {selectedCompanyId === company.company_id && ' \u2713'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-primary-100 text-sm flex items-center space-x-1">
                    <Building size={14} />
                    <span>{userCompany?.name || 'No Company'}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1 flex-shrink-0" data-testid="user-menu-desktop">
              {primaryItems.map(renderDesktopNavItem)}

              {overflowItems.length > 0 && (
                <div className="relative" ref={overflowRef}>
                  <button
                    onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                    className="flex items-center space-x-1 px-2 py-1.5 lg:px-3 lg:py-2 rounded-md hover:bg-primary-600 transition-colors"
                    data-testid="overflow-menu-button"
                  >
                    <MoreHorizontal size={18} />
                    <span className="hidden lg:inline">More</span>
                  </button>

                  {showOverflowMenu && (
                    <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] z-50">
                      {overflowItems.map(item => {
                        const Icon = item.icon;
                        if (item.action === 'signout') {
                          return (
                            <button
                              key={item.key}
                              onClick={() => { handleSignOut(); setShowOverflowMenu(false); }}
                              className="w-full text-left px-4 py-2.5 hover:bg-gray-100 text-error-600 text-sm flex items-center space-x-2"
                            >
                              <Icon size={16} />
                              <span>{item.label}</span>
                            </button>
                          );
                        }
                        return (
                          <Link
                            key={item.key}
                            to={item.to!}
                            onClick={() => setShowOverflowMenu(false)}
                            className="block px-4 py-2.5 hover:bg-gray-100 text-gray-700 text-sm"
                          >
                            <div className="flex items-center space-x-2">
                              <Icon size={16} />
                              <span>{item.label}</span>
                              {item.badge === 'mgiPending' && !!mgiPendingCount && mgiPendingCount > 0 && (
                                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                                  {mgiPendingCount > 99 ? '99+' : mgiPendingCount}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-gray-200 shadow-sm animate-fade-in" data-testid="mobile-menu">
          <div className="container mx-auto px-4 py-2 space-y-1">
            {operationsItems.length > 0 && (
              <div>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Operations</div>
                {operationsItems.map(renderMobileNavItem)}
              </div>
            )}
            {intelligenceItems.length > 0 && (
              <div>
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Intelligence</div>
                {intelligenceItems.map(renderMobileNavItem)}
              </div>
            )}
            {settingsItems.length > 0 && (
              <div>
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Settings</div>
                {settingsItems.map(renderMobileNavItem)}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6" data-testid="app-main-content">
        <Outlet />
      </main>

      <footer className="bg-gray-100 border-t border-gray-200 py-3 sm:py-4 mt-auto" data-testid="app-footer">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs sm:text-sm text-gray-600">
          <p>&copy; {new Date().getFullYear()} GRM TEK - GasX InVivo Pilot Program Platform - Version 1.120. All rights reserved.</p>
        </div>
      </footer>

      <ActiveSessionsDrawer
        isOpen={isSessionsDrawerOpen}
        onClose={() => {
          setIsSessionsDrawerOpen(false);
        }}
      />

      {showSessionIndicator && hasActiveSessions && (
        <div
          className="fixed bottom-14 right-12 z-50 flex items-center bg-primary-600 rounded-full shadow-lg cursor-pointer animate-pulse"
          onClick={() => setIsSessionsDrawerOpen(true)}
          data-testid="mobile-sessions-button"
        >
          <div className="flex items-center px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
            <span className="text-white font-medium ml-2">Sessions</span>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-500 rounded-full"></span>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-50">
        <NotificationCenter />
      </div>

      <VoiceInputFAB />
    </div>
  );
};

export default AppLayout;
