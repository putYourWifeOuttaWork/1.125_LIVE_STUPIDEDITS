import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  ExternalLink,
  Building,
  MapPin,
  Cpu,
  Shield,
} from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useAlertNotifications } from '../../hooks/useAlertNotifications';
import { useMgiReviewPendingCount } from '../../hooks/useMgiReview';
import { formatDistanceToNow, format } from 'date-fns';

type TabId = 'alerts' | 'notifications' | 'reviews';

export function NotificationCenter() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('alerts');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    loading: notifLoading,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const {
    alerts,
    alertCount,
    loading: alertsLoading,
    acknowledgeAlert,
  } = useAlertNotifications();

  const { data: reviewPendingCount } = useMgiReviewPendingCount();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && alertCount > 0) {
      setActiveTab('alerts');
    }
  }, [isOpen, alertCount]);

  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'high':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'medium':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'low':
        return <Info className="w-5 h-5 text-blue-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAlertSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-l-4 border-l-red-500';
      case 'error':
        return 'bg-orange-50 border-l-4 border-l-orange-500';
      case 'warning':
        return 'bg-yellow-50 border-l-4 border-l-yellow-500';
      default:
        return 'bg-blue-50 border-l-4 border-l-blue-500';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'absolute': return 'THRESHOLD';
      case 'shift': return 'INTRA-SESSION SHIFT';
      case 'velocity': return 'MGI VELOCITY';
      case 'speed': return 'MGI SPEED';
      case 'combination': return 'DANGER ZONE';
      case 'system': return 'SYSTEM';
      default: return category?.toUpperCase() || 'ALERT';
    }
  };

  const handleAlertClick = (alert: typeof alerts[0]) => {
    if (alert.session_id && alert.program_id && alert.site_id) {
      navigate(`/programs/${alert.program_id}/sites/${alert.site_id}/device-sessions/${alert.session_id}`);
    } else {
      navigate(`/alerts?status=unresolved&company=${alert.company_id || ''}`);
    }
    setIsOpen(false);
  };

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    if (notification.status !== 'read') {
      markAsRead(notification.id);
    }
    const meta = notification.metadata as Record<string, unknown> | undefined;
    if (meta?.link) {
      navigate(meta.link as string);
      setIsOpen(false);
    } else if (meta?.notification_type === 'mgi_review_required') {
      navigate('/mgi-review');
      setIsOpen(false);
    } else if (notification.metadata?.device_id) {
      navigate(`/devices/${notification.metadata.device_id}`);
      setIsOpen(false);
    }
  };

  const totalBadgeCount = alertCount + unreadCount + (reviewPendingCount || 0);
  const hasAlerts = alertCount > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-3 rounded-full shadow-lg transition-all duration-200 hover:shadow-xl ${
          hasAlerts
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-gray-600 hover:bg-gray-700 text-white'
        }`}
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />
        {totalBadgeCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white rounded-full ${
              hasAlerts ? 'bg-red-500 animate-pulse' : 'bg-blue-500'
            }`}
          >
            {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-[420px] bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('alerts')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'alerts'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Alerts
                {alertCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'notifications'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                General
                {unreadCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-blue-500 text-white rounded-full">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {!!reviewPendingCount && reviewPendingCount > 0 && (
                <button
                  onClick={() => setActiveTab('reviews')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'reviews'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Reviews
                  <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                    {reviewPendingCount > 99 ? '99+' : reviewPendingCount}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="overflow-y-auto flex-1">
            {activeTab === 'alerts' ? (
              <AlertsTab
                alerts={alerts}
                loading={alertsLoading}
                getSeverityIcon={getSeverityIcon}
                getAlertSeverityStyles={getAlertSeverityStyles}
                getCategoryLabel={getCategoryLabel}
                onAcknowledge={acknowledgeAlert}
                onClick={handleAlertClick}
              />
            ) : activeTab === 'reviews' ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="p-3 bg-amber-100 rounded-full mb-4">
                  <Shield className="w-8 h-8 text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {reviewPendingCount} MGI Score{reviewPendingCount !== 1 ? 's' : ''} Flagged for Review
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Outlier scores have been auto-corrected and need your verification.
                </p>
                <button
                  onClick={() => {
                    navigate('/mgi-review');
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  Open QA Review Dashboard
                </button>
              </div>
            ) : (
              <NotificationsTab
                notifications={notifications}
                loading={notifLoading}
                unreadCount={unreadCount}
                getSeverityIcon={getSeverityIcon}
                markAllAsRead={markAllAsRead}
                onClick={handleNotificationClick}
              />
            )}
          </div>

          {/* Footer */}
          {activeTab === 'alerts' && alerts.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-2">
              <button
                onClick={() => {
                  navigate('/alerts?status=unresolved');
                  setIsOpen(false);
                }}
                className="w-full text-sm text-red-600 hover:text-red-700 font-medium flex items-center justify-center gap-1"
              >
                View all alerts
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {activeTab === 'notifications' && notifications.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-2">
              <button
                onClick={() => {
                  navigate('/notifications');
                  setIsOpen(false);
                }}
                className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertsTab({
  alerts,
  loading,
  getSeverityIcon,
  getAlertSeverityStyles,
  getCategoryLabel,
  onAcknowledge,
  onClick,
}: {
  alerts: Array<{
    alert_id: string;
    severity: string;
    alert_category: string;
    message: string;
    triggered_at: string;
    site_name: string | null;
    program_name: string | null;
    company_id: string | null;
    session_id: string | null;
    program_id: string | null;
    site_id: string | null;
    metadata: { device_code?: string; [key: string]: unknown };
    actual_value: number | null;
    threshold_value: number | null;
  }>;
  loading: boolean;
  getSeverityIcon: (severity?: string) => JSX.Element;
  getAlertSeverityStyles: (severity: string) => string;
  getCategoryLabel: (category: string) => string;
  onAcknowledge: (alertId: string) => Promise<boolean>;
  onClick: (alert: typeof alerts extends Array<infer U> ? U : never) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <CheckCircle className="w-12 h-12 mb-3 text-green-400" />
        <p className="text-sm font-medium">All clear</p>
        <p className="text-xs text-gray-400 mt-1">No active alerts for this company</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {alerts.map((alert) => (
        <div
          key={alert.alert_id}
          className={`px-4 py-3 hover:bg-gray-50 transition-colors ${getAlertSeverityStyles(alert.severity)}`}
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getSeverityIcon(alert.severity)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">
                  {getCategoryLabel(alert.alert_category)}
                </span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                  alert.severity === 'error' ? 'bg-orange-100 text-orange-700' :
                  alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {alert.severity}
                </span>
              </div>

              <p className="text-sm font-medium text-gray-900 mb-1.5 line-clamp-2">
                {alert.message}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 mb-2">
                {alert.site_name && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {alert.site_name}
                  </span>
                )}
                {alert.metadata?.device_code && (
                  <span className="flex items-center gap-0.5">
                    <Cpu className="w-3 h-3" />
                    {alert.metadata.device_code}
                  </span>
                )}
                <span>
                  {formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}
                </span>
              </div>

              {alert.actual_value !== null && alert.threshold_value !== null && (
                <div className="text-xs text-gray-600 mb-2">
                  Value: <span className="font-semibold">{alert.actual_value}</span>
                  {' / '}
                  Threshold: <span className="font-semibold">{alert.threshold_value}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcknowledge(alert.alert_id);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded transition-colors"
                >
                  <CheckCircle className="w-3 h-3" />
                  Acknowledge
                </button>
                {alert.session_id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClick(alert);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View Session
                  </button>
                )}
                {!alert.session_id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClick(alert);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Details
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationsTab({
  notifications,
  loading,
  unreadCount,
  getSeverityIcon,
  markAllAsRead,
  onClick,
}: {
  notifications: Array<{
    id: string;
    status: string;
    subject: string | null;
    message: string;
    metadata: {
      device_code?: string;
      site_name?: string;
      severity?: string;
      current_value?: number;
      threshold_value?: number;
      device_id?: string;
    };
    created_at: string;
  }>;
  loading: boolean;
  unreadCount: number;
  getSeverityIcon: (severity?: string) => JSX.Element;
  markAllAsRead: () => void;
  onClick: (notification: typeof notifications extends Array<infer U> ? U : never) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Bell className="w-12 h-12 mb-3 text-gray-300" />
        <p className="text-sm">No notifications yet</p>
      </div>
    );
  }

  return (
    <>
      {unreadCount > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all as read
          </button>
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
              notification.status !== 'read' ? 'bg-blue-50/30' : ''
            }`}
            onClick={() => onClick(notification)}
          >
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getSeverityIcon(notification.metadata?.severity)}
              </div>
              <div className="flex-1 min-w-0">
                {notification.subject && (
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    {notification.subject}
                  </p>
                )}
                <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                  {notification.message}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {notification.metadata?.site_name && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                      {notification.metadata.site_name}
                    </span>
                  )}
                  {notification.metadata?.device_code && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                      {notification.metadata.device_code}
                    </span>
                  )}
                  <span>
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
              {notification.status !== 'read' && (
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
