import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Clock, AlertTriangle, CheckCircle, Loader, MapPin, Building, ExternalLink } from 'lucide-react';
import Card, { CardContent } from '../common/Card';
import { useCompanyFilterStore } from '../../stores/companyFilterStore';
import useUserRole from '../../hooks/useUserRole';
import { format } from 'date-fns';
import { parseDateOnly } from '../../utils/timeFormatters';

export interface ActiveSession {
  session_id: string;
  site_name: string;
  site_id: string;
  program_name: string;
  program_id: string;
  company_name: string;
  company_id: string;
  session_date: string;
  expected_wake_count: number;
  completed_wake_count: number;
  status: 'pending' | 'in_progress' | 'locked';
  alert_count: number;
  critical_alert_count: number;
  warning_alert_count: number;
  latest_alert_severity: 'info' | 'warning' | 'error' | 'critical' | null;
}

interface ActiveSessionsGridProps {
  limit?: number;
  showViewAll?: boolean;
  companyFilter?: string | null;
  onSessionSelect?: (session: ActiveSession) => void;
  selectedSessionId?: string | null;
}

export default function ActiveSessionsGrid({
  limit = 10,
  showViewAll = true,
  companyFilter,
  onSessionSelect,
  selectedSessionId
}: ActiveSessionsGridProps) {
  const navigate = useNavigate();
  const { selectedCompanyId: activeCompanyId } = useCompanyFilterStore();
  const { isSuperAdmin } = useUserRole();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadActiveSessions();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('active_sessions_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_device_sessions',
        },
        () => {
          loadActiveSessions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_alerts',
        },
        () => {
          loadActiveSessions();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [activeCompanyId, companyFilter]);

  const loadActiveSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Determine which company to filter by
      const effectiveCompanyFilter = companyFilter || activeCompanyId;

      // Build query for active sessions
      let query = supabase
        .from('site_device_sessions')
        .select(`
          session_id,
          session_date,
          expected_wake_count,
          completed_wake_count,
          status,
          site_id,
          program_id,
          company_id,
          sites!inner(name, company_id),
          pilot_programs!inner(name, company_id),
          companies!inner(name)
        `)
        .in('status', ['pending', 'in_progress'])
        .eq('session_date', new Date().toISOString().split('T')[0])
        .order('completed_wake_count', { ascending: false })
        .limit(limit);

      // Apply company filter if super admin has selected a specific company
      if (effectiveCompanyFilter && isSuperAdmin) {
        query = query.eq('company_id', effectiveCompanyFilter);
      }

      const { data: sessionsData, error: sessionsError } = await query;

      if (sessionsError) throw sessionsError;

      // Get alert counts for each session
      const sessionIds = (sessionsData || []).map(s => s.session_id);
      const { data: alertData } = await supabase
        .from('device_alerts')
        .select('session_id, severity')
        .in('session_id', sessionIds)
        .is('resolved_at', null);

      // Count alerts by session
      const alertCounts = new Map<string, { total: number; critical: number; warning: number; latest: string }>();
      (alertData || []).forEach(alert => {
        if (!alertCounts.has(alert.session_id)) {
          alertCounts.set(alert.session_id, { total: 0, critical: 0, warning: 0, latest: alert.severity });
        }
        const counts = alertCounts.get(alert.session_id)!;
        counts.total++;
        if (alert.severity === 'critical') counts.critical++;
        if (alert.severity === 'warning') counts.warning++;
        // Track most severe alert
        if (alert.severity === 'critical' || (alert.severity === 'error' && counts.latest !== 'critical')) {
          counts.latest = alert.severity;
        }
      });

      // Map to typed sessions
      const formattedSessions: ActiveSession[] = (sessionsData || []).map((session: any) => {
        const alerts = alertCounts.get(session.session_id) || { total: 0, critical: 0, warning: 0, latest: null };
        return {
          session_id: session.session_id,
          site_name: session.sites.name,
          site_id: session.site_id,
          program_name: session.pilot_programs.name,
          program_id: session.program_id,
          company_name: session.companies.name,
          company_id: session.company_id,
          session_date: session.session_date,
          expected_wake_count: session.expected_wake_count,
          completed_wake_count: session.completed_wake_count,
          status: session.status,
          alert_count: alerts.total,
          critical_alert_count: alerts.critical,
          warning_alert_count: alerts.warning,
          latest_alert_severity: alerts.latest,
        };
      });

      setSessions(formattedSessions);
    } catch (err: any) {
      console.error('Error loading active sessions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getCardColorClass = (session: ActiveSession) => {
    const isSelected = selectedSessionId === session.session_id;

    if (isSelected) {
      if (session.critical_alert_count > 0) {
        return 'border-red-500 bg-red-100 shadow-lg scale-[1.02]';
      }
      if (session.warning_alert_count > 0 || session.completed_wake_count < session.expected_wake_count) {
        return 'border-yellow-500 bg-yellow-100 shadow-lg scale-[1.02]';
      }
      return 'border-green-500 bg-green-100 shadow-lg scale-[1.02]';
    }

    if (session.critical_alert_count > 0) {
      return 'border-red-300 bg-red-50';
    }
    if (session.warning_alert_count > 0 || session.completed_wake_count < session.expected_wake_count) {
      return 'border-yellow-300 bg-yellow-50';
    }
    return 'border-green-300 bg-green-50';
  };

  const getStatusBadge = (session: ActiveSession) => {
    const progress = session.expected_wake_count > 0
      ? (session.completed_wake_count / session.expected_wake_count) * 100
      : 0;

    if (session.status === 'pending') {
      return <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full">Pending</span>;
    }

    if (progress >= 100) {
      return <span className="text-xs px-2 py-0.5 bg-green-200 text-green-800 rounded-full">Complete</span>;
    }

    if (progress >= 50) {
      return <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full">In Progress</span>;
    }

    return <span className="text-xs px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded-full">Behind Schedule</span>;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        <p className="font-medium">Error loading active sessions</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-3" />
        <p className="text-gray-700 font-medium text-lg">No Active Sessions Today</p>
        <p className="text-sm text-gray-500 mt-1">
          All device sessions for today have been completed or are scheduled for later
        </p>
      </div>
    );
  }

  const handleCardClick = (session: ActiveSession) => {
    if (onSessionSelect) {
      onSessionSelect(session);
    } else {
      // Fallback to navigation if no selection handler
      navigate(`/programs/${session.program_id}/sites/${session.site_id}/device-sessions/${session.session_id}`);
    }
  };

  const handleVisitClick = (e: React.MouseEvent, session: ActiveSession) => {
    e.stopPropagation();
    navigate(`/programs/${session.program_id}/sites/${session.site_id}/device-sessions/${session.session_id}`);
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sessions.map((session) => (
          <Card
            key={session.session_id}
            className={`cursor-pointer hover:shadow-lg transition-all border-2 relative ${getCardColorClass(session)}`}
            onClick={() => handleCardClick(session)}
          >
            <CardContent className="p-4">
              {/* Visit Button */}
              <button
                onClick={(e) => handleVisitClick(e, session)}
                className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md transition-all z-10"
                title="Visit session details page"
              >
                <ExternalLink className="w-4 h-4 text-gray-700" />
              </button>

              {/* Header */}
              <div className="flex items-start justify-between mb-3 pr-8">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{session.site_name}</h3>
                  {isSuperAdmin && (
                    <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                      <Building className="w-3 h-3" />
                      {session.company_name}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">{session.program_name}</p>
                </div>
                {getStatusBadge(session)}
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700">Progress</span>
                  <span className="font-medium text-gray-900">
                    {session.completed_wake_count} / {session.expected_wake_count} wakes
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      session.critical_alert_count > 0
                        ? 'bg-red-500'
                        : session.warning_alert_count > 0
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (session.completed_wake_count / session.expected_wake_count) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Alerts */}
              {session.alert_count > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      session.critical_alert_count > 0 ? 'text-red-600' : 'text-yellow-600'
                    }`}
                  />
                  <span className="font-medium text-gray-900">
                    {session.alert_count} {session.alert_count === 1 ? 'Alert' : 'Alerts'}
                  </span>
                  {session.critical_alert_count > 0 && (
                    <span className="text-xs text-red-600">({session.critical_alert_count} critical)</span>
                  )}
                </div>
              )}

              {/* Date */}
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                <Clock className="w-3 h-3" />
                {format(parseDateOnly(session.session_date), 'MMM d, yyyy')}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showViewAll && sessions.length >= limit && (
        <div className="text-center mt-4">
          <button
            onClick={() => navigate('/sessions')}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View All Active Sessions →
          </button>
        </div>
      )}
    </div>
  );
}
