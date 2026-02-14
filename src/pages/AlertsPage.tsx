import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Building,
  MapPin,
  Cpu,
  Calendar,
  Copy,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import Button from '../components/common/Button';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { useActiveCompany } from '../hooks/useActiveCompany';
import useCompanies from '../hooks/useCompanies';
import { createLogger } from '../utils/logger';

const log = createLogger('AlertsPage');

interface DeviceAlert {
  alert_id: string;
  device_id: string;
  alert_type: string;
  alert_category: 'absolute' | 'shift' | 'velocity' | 'speed' | 'combination' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  actual_value: number | null;
  threshold_value: number | null;
  threshold_context: any;
  measurement_timestamp: string;
  triggered_at: string;
  resolved_at: string | null;
  device_coords: string | null;
  zone_label: string | null;
  site_id: string | null;
  site_name: string | null;
  program_id: string | null;
  program_name: string | null;
  company_id: string | null;
  company_name: string | null;
  metadata: any;
  session_id: string | null;
  snapshot_id: string | null;
  wake_number: number | null;
}

interface AlertStats {
  total: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
  byCompany: Record<string, number>;
}

const AlertsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompanyId, isSuperAdmin } = useActiveCompany();
  const { companies } = useCompanies();

  // State
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AlertStats>({
    total: 0,
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    byCompany: {},
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Filter state from URL
  const [showFilters, setShowFilters] = useState(false);
  const severityFilterStr = searchParams.get('severity') || '';
  const severityFilter = severityFilterStr ? severityFilterStr.split(',') : [];
  const statusFilter = searchParams.get('status') || 'unresolved';
  const companyFilter = searchParams.get('company') || activeCompanyId || '';
  const siteFilter = searchParams.get('site') || '';
  const deviceFilter = searchParams.get('device') || '';
  const categoryFilterStr = searchParams.get('category') || '';
  const categoryFilter = categoryFilterStr ? categoryFilterStr.split(',') : [];
  const dateRangeFilter = searchParams.get('dateRange') || 'all';
  const searchQuery = searchParams.get('search') || '';

  // Update URL when filters change
  const updateFilter = (key: string, value: string | string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && (Array.isArray(value) ? value.length > 0 : value !== '')) {
      newParams.set(key, Array.isArray(value) ? value.join(',') : value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
    setCurrentPage(1);
  };

  // Toggle severity filter
  const toggleSeverityFilter = (severity: string) => {
    const current = severityFilter;
    const newFilter = current.includes(severity)
      ? current.filter((s) => s !== severity)
      : [...current, severity];
    updateFilter('severity', newFilter);
  };

  // Toggle category filter
  const toggleCategoryFilter = (category: string) => {
    const current = categoryFilter;
    const newFilter = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    updateFilter('category', newFilter);
  };

  // Ref to track if initial load is done
  const initialLoadRef = useRef(false);
  const loadingRef = useRef(false);

  // Memoized load alerts function
  const loadAlerts = useCallback(async () => {
    // Prevent concurrent requests
    if (loadingRef.current) return;

    loadingRef.current = true;
    try {
      setLoading(true);

      // Parse filter arrays inside the callback
      const severities = severityFilterStr ? severityFilterStr.split(',') : [];
      const categories = categoryFilterStr ? categoryFilterStr.split(',') : [];

      let query = supabase
        .from('device_alerts')
        .select('*', { count: 'exact' })
        .order('triggered_at', { ascending: false });

      // Apply company filter
      if (companyFilter) {
        query = query.eq('company_id', companyFilter);
      }

      // Apply status filter
      if (statusFilter === 'unresolved') {
        query = query.is('resolved_at', null);
      } else if (statusFilter === 'resolved') {
        query = query.not('resolved_at', 'is', null);
      }

      // Apply severity filter
      if (severities.length > 0) {
        query = query.in('severity', severities);
      }

      // Apply category filter
      if (categories.length > 0) {
        query = query.in('alert_category', categories);
      }

      // Apply site filter
      if (siteFilter) {
        query = query.eq('site_id', siteFilter);
      }

      // Apply device filter (search in metadata.device_code)
      if (deviceFilter) {
        query = query.ilike('metadata->>device_code', `%${deviceFilter}%`);
      }

      // Apply date range filter
      const now = new Date();
      if (dateRangeFilter === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('triggered_at', startOfDay.toISOString());
      } else if (dateRangeFilter === 'last_7_days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('triggered_at', sevenDaysAgo.toISOString());
      } else if (dateRangeFilter === 'last_30_days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query = query.gte('triggered_at', thirtyDaysAgo.toISOString());
      }

      // Apply search query (searches in message, site_name, device_code, session_id)
      if (searchQuery) {
        query = query.or(
          `message.ilike.%${searchQuery}%,site_name.ilike.%${searchQuery}%,metadata->>device_code.ilike.%${searchQuery}%,session_id.ilike.%${searchQuery}%`
        );
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setAlerts(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      log.error('Error loading alerts:', error);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [
    currentPage,
    pageSize,
    severityFilterStr,
    statusFilter,
    companyFilter,
    siteFilter,
    deviceFilter,
    categoryFilterStr,
    dateRangeFilter,
    searchQuery,
  ]);

  // Memoized load stats function
  const loadStats = useCallback(async () => {
    try {
      let query = supabase
        .from('device_alerts')
        .select('severity, company_id, resolved_at');

      // Apply company filter to stats as well
      if (companyFilter) {
        query = query.eq('company_id', companyFilter);
      }

      // Only count unresolved alerts in stats
      query = query.is('resolved_at', null);

      const { data, error } = await query;

      if (error) throw error;

      const newStats: AlertStats = {
        total: data?.length || 0,
        critical: data?.filter((a) => a.severity === 'critical').length || 0,
        error: data?.filter((a) => a.severity === 'error').length || 0,
        warning: data?.filter((a) => a.severity === 'warning').length || 0,
        info: data?.filter((a) => a.severity === 'info').length || 0,
        byCompany: {},
      };

      // Calculate by company
      if (isSuperAdmin && !companyFilter) {
        data?.forEach((alert) => {
          if (alert.company_id) {
            newStats.byCompany[alert.company_id] =
              (newStats.byCompany[alert.company_id] || 0) + 1;
          }
        });
      }

      setStats(newStats);
    } catch (error) {
      log.error('Error loading stats:', error);
    }
  }, [companyFilter, isSuperAdmin]);

  // Load alerts when filters change
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
    }
    loadAlerts();
    loadStats();
  }, [loadAlerts, loadStats]);

  // Real-time subscription - only reload, don't call directly
  useEffect(() => {
    const channel = supabase
      .channel('device_alerts_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_alerts',
          filter: companyFilter ? `company_id=eq.${companyFilter}` : undefined,
        },
        () => {
          // Only reload if not currently loading
          if (!loadingRef.current && initialLoadRef.current) {
            loadAlerts();
            loadStats();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [companyFilter, loadAlerts, loadStats]);

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('device_alerts')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Acknowledged by user',
        })
        .eq('alert_id', alertId);

      if (error) throw error;

      toast.success('Alert acknowledged');
      loadAlerts();
      loadStats();
    } catch (error: any) {
      log.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-900 border-red-500';
      case 'error':
        return 'bg-orange-100 text-orange-900 border-orange-500';
      case 'warning':
        return 'bg-yellow-100 text-yellow-900 border-yellow-500';
      default:
        return 'bg-blue-100 text-blue-900 border-blue-500';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'absolute':
        return 'Absolute Threshold';
      case 'shift':
        return 'Intra-Session Shift';
      case 'velocity':
        return 'MGI Velocity';
      case 'speed':
        return 'MGI Program Speed';
      case 'combination':
        return 'Danger Zone';
      case 'system':
        return 'System Alert';
      default:
        return category;
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleViewSession = async (alert: DeviceAlert) => {
    // If we have a direct session_id, use it
    if (alert.session_id && alert.program_id && alert.site_id) {
      navigate(`/programs/${alert.program_id}/sites/${alert.site_id}/device-sessions/${alert.session_id}`);
      return;
    }

    // Otherwise, find the session by site and date
    if (!alert.site_id || !alert.program_id) {
      toast.error('Unable to find session - missing site information');
      return;
    }

    try {
      const alertDate = new Date(alert.triggered_at);
      // Format the date as YYYY-MM-DD for matching session_date
      const sessionDate = alertDate.toISOString().split('T')[0];

      // Find the session for this site on this day
      const { data: sessions, error } = await supabase
        .from('site_device_sessions')
        .select('session_id')
        .eq('site_id', alert.site_id)
        .eq('session_date', sessionDate)
        .order('session_start_time', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (sessions && sessions.length > 0) {
        navigate(`/programs/${alert.program_id}/sites/${alert.site_id}/device-sessions/${sessions[0].session_id}`);
      } else {
        toast.error('No session found for this site on this date');
      }
    } catch (error) {
      log.error('Error finding session:', error);
      toast.error('Failed to find session');
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor and manage system alerts</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          leftIcon={<Filter className="w-4 h-4" />}
        >
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </div>

      {/* Statistics Panel */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
              <div className="text-sm text-gray-600">Critical</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.error}</div>
              <div className="text-sm text-gray-600">Error</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
              <div className="text-sm text-gray-600">Warning</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.info}</div>
              <div className="text-sm text-gray-600">Info</div>
            </div>
          </div>

          {/* By Company breakdown for super admin */}
          {isSuperAdmin && Object.keys(stats.byCompany).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-2">By Company:</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byCompany).map(([companyId, count]) => {
                  const company = companies.find((c) => c.company_id === companyId);
                  return (
                    <div
                      key={companyId}
                      className="px-3 py-1 bg-gray-100 rounded-full text-sm"
                    >
                      {company?.name || 'Unknown'}: <span className="font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Filters</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by device code, site name, session ID, or message..."
                    value={searchQuery}
                    onChange={(e) => updateFilter('search', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <div className="space-y-2">
                    {['unresolved', 'resolved', 'all'].map((status) => (
                      <label key={status} className="flex items-center">
                        <input
                          type="radio"
                          name="status"
                          checked={statusFilter === status}
                          onChange={() => updateFilter('status', status)}
                          className="mr-2"
                        />
                        <span className="text-sm capitalize">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Severity Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Severity
                  </label>
                  <div className="space-y-2">
                    {['critical', 'error', 'warning', 'info'].map((severity) => (
                      <label key={severity} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={severityFilter.includes(severity)}
                          onChange={() => toggleSeverityFilter(severity)}
                          className="mr-2"
                        />
                        <span className="text-sm capitalize">{severity}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <div className="space-y-2">
                    {['absolute', 'shift', 'velocity', 'speed', 'combination', 'system'].map(
                      (category) => (
                        <label key={category} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={categoryFilter.includes(category)}
                            onChange={() => toggleCategoryFilter(category)}
                            className="mr-2"
                          />
                          <span className="text-sm">{getCategoryLabel(category)}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                {/* Date Range Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Range
                  </label>
                  <select
                    value={dateRangeFilter}
                    onChange={(e) => updateFilter('dateRange', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="today">Today</option>
                    <option value="last_7_days">Last 7 Days</option>
                    <option value="last_30_days">Last 30 Days</option>
                    <option value="all">All Time</option>
                  </select>
                </div>

                {/* Company Filter (Super Admin Only) */}
                {isSuperAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company
                    </label>
                    <select
                      value={companyFilter}
                      onChange={(e) => updateFilter('company', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Companies</option>
                      {companies.map((company) => (
                        <option key={company.company_id} value={company.company_id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Clear Filters */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchParams(new URLSearchParams());
                    setCurrentPage(1);
                  }}
                  leftIcon={<X className="w-4 h-4" />}
                >
                  Clear All Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Alerts {totalCount > 0 && `(${totalCount})`}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)}-
                {Math.min(currentPage * pageSize, totalCount)} of {totalCount} alerts
              </p>
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Show:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading alerts...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">No alerts found</p>
              <p className="text-sm text-gray-600 mt-1">
                {searchQuery || severityFilter.length > 0 || categoryFilter.length > 0
                  ? 'Try adjusting your filters'
                  : 'All systems operating normally'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.alert_id}
                  className={`border-2 rounded-lg ${getSeverityColor(alert.severity)} ${
                    alert.resolved_at ? 'opacity-60' : ''
                  } ${alert.severity === 'critical' && !alert.resolved_at ? 'animate-pulse' : ''}`}
                >
                  {/* Alert Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Alert Icon and Content */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-1 flex-shrink-0">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Severity and Category Badge */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold uppercase px-2 py-1 bg-white bg-opacity-50 rounded">
                              {alert.severity}
                            </span>
                            <span className="text-xs font-semibold px-2 py-1 bg-white bg-opacity-30 rounded">
                              {getCategoryLabel(alert.alert_category)}
                            </span>
                          </div>

                          {/* Alert Message */}
                          <p className="text-base font-semibold leading-snug mb-2">
                            {alert.message}
                          </p>

                          {/* Context Breadcrumb */}
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {alert.company_name && (
                              <div className="flex items-center gap-1">
                                <Building className="w-3 h-3" />
                                <span>{alert.company_name}</span>
                              </div>
                            )}
                            {alert.site_name && (
                              <>
                                <span className="text-gray-400">›</span>
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{alert.site_name}</span>
                                </div>
                              </>
                            )}
                            {alert.metadata?.device_code && (
                              <>
                                <span className="text-gray-400">›</span>
                                <div className="flex items-center gap-1">
                                  <Cpu className="w-3 h-3" />
                                  <span>{alert.metadata.device_code}</span>
                                </div>
                              </>
                            )}
                            <span className="text-gray-400">›</span>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{format(new Date(alert.triggered_at), 'MMM d, h:mm a')}</span>
                            </div>
                          </div>

                          {/* Session ID if available */}
                          {alert.session_id && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-gray-700">Session ID:</span>
                              <code className="text-xs bg-white bg-opacity-50 px-2 py-0.5 rounded font-mono">
                                {alert.session_id.substring(0, 8)}...
                              </code>
                              <button
                                onClick={() => copyToClipboard(alert.session_id!, 'Session ID')}
                                className="p-1 hover:bg-white hover:bg-opacity-30 rounded transition-colors"
                                title="Copy Session ID"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {!alert.resolved_at && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeAlert(alert.alert_id)}
                            leftIcon={<CheckCircle className="w-4 h-4" />}
                            className="whitespace-nowrap border-2"
                          >
                            Acknowledge
                          </Button>
                        )}
                        {(alert.site_id || alert.session_id) && alert.program_id && (
                          <Button
                            variant="contained"
                            size="sm"
                            onClick={() => handleViewSession(alert)}
                            leftIcon={<ExternalLink className="w-4 h-4" />}
                            className="whitespace-nowrap"
                          >
                            View Session
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Details */}
                  <details className="border-t border-current border-opacity-20">
                    <summary className="px-4 py-2 text-sm font-medium cursor-pointer hover:bg-white hover:bg-opacity-20 transition-colors">
                      View Additional Details
                    </summary>
                    <div className="px-4 py-3 bg-white bg-opacity-30 text-sm space-y-2">
                      {alert.zone_label && (
                        <div>
                          <span className="font-semibold">Zone:</span> {alert.zone_label}
                        </div>
                      )}
                      {alert.device_coords && (
                        <div>
                          <span className="font-semibold">Coordinates:</span> {alert.device_coords}
                        </div>
                      )}
                      {alert.program_name && (
                        <div>
                          <span className="font-semibold">Program:</span> {alert.program_name}
                        </div>
                      )}
                      {alert.actual_value !== null && alert.threshold_value !== null && (
                        <div>
                          <span className="font-semibold">Value:</span> {alert.actual_value} (threshold: {alert.threshold_value})
                        </div>
                      )}
                      {alert.wake_number !== null && (
                        <div>
                          <span className="font-semibold">Wake Number:</span> {alert.wake_number}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">Triggered:</span>{' '}
                        {format(new Date(alert.triggered_at), 'MMM d, yyyy h:mm:ss a')}
                      </div>
                      {alert.resolved_at && (
                        <div>
                          <span className="font-semibold">Resolved:</span>{' '}
                          {format(new Date(alert.resolved_at), 'MMM d, yyyy h:mm:ss a')}
                        </div>
                      )}

                      {/* Threshold Context */}
                      {alert.threshold_context && Object.keys(alert.threshold_context).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                          <div className="font-semibold mb-2">Threshold Context:</div>
                          <div className="space-y-1 pl-3">
                            {Object.entries(alert.threshold_context).map(([key, value]) => (
                              <div key={key}>
                                <span className="font-medium">{key}:</span> {JSON.stringify(value)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            leftIcon={<ChevronLeft className="w-4 h-4" />}
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            {totalPages <= 10 ? (
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === page
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = Number(e.target.value);
                  if (page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                  }
                }}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center"
              />
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            rightIcon={<ChevronRight className="w-4 h-4" />}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
