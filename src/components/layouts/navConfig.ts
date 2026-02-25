import {
  Home,
  AlertTriangle,
  ClipboardList,
  Building,
  Cpu,
  BarChart3,
  TrendingUp,
  User,
  LogOut,
  Shield,
  LucideIcon,
} from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  action?: 'sessions' | 'signout';
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  requireCompany?: boolean;
  group: 'primary' | 'overflow';
  mobileSection: 'operations' | 'intelligence' | 'settings';
  badge?: 'sessions' | 'mgiPending';
}

export const navItems: NavItem[] = [
  {
    key: 'home',
    label: 'Home',
    icon: Home,
    to: '/home',
    group: 'primary',
    mobileSection: 'operations',
  },
  {
    key: 'alerts',
    label: 'Alerts',
    icon: AlertTriangle,
    to: '/alerts',
    requireAdmin: true,
    group: 'primary',
    mobileSection: 'operations',
  },
  {
    key: 'sessions',
    label: 'Sessions',
    icon: ClipboardList,
    action: 'sessions',
    group: 'primary',
    mobileSection: 'operations',
    badge: 'sessions',
  },
  {
    key: 'devices',
    label: 'Devices',
    icon: Cpu,
    to: '/devices',
    requireAdmin: true,
    group: 'primary',
    mobileSection: 'operations',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    to: '/analytics',
    requireAdmin: true,
    group: 'primary',
    mobileSection: 'intelligence',
  },
  {
    key: 'value',
    label: 'Value',
    icon: TrendingUp,
    to: '/value',
    requireAdmin: true,
    group: 'primary',
    mobileSection: 'intelligence',
  },
  {
    key: 'company',
    label: 'Company',
    icon: Building,
    to: '/company',
    requireCompany: true,
    group: 'overflow',
    mobileSection: 'settings',
  },
  {
    key: 'mgi-review',
    label: 'QA Review',
    icon: Shield,
    to: '/mgi-review',
    requireSuperAdmin: true,
    group: 'overflow',
    mobileSection: 'intelligence',
    badge: 'mgiPending',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: User,
    to: '/profile',
    group: 'overflow',
    mobileSection: 'settings',
  },
  {
    key: 'signout',
    label: 'Sign Out',
    icon: LogOut,
    action: 'signout',
    group: 'overflow',
    mobileSection: 'settings',
  },
];
