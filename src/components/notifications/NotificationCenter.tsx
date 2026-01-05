import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, X, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

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

  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'high':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'medium':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'low':
        return <Info className="w-5 h-5 text-blue-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getSeverityBg = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'high':
        return 'bg-orange-50 border-orange-200';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200';
      case 'low':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Bell className="w-12 h-12 mb-3 text-gray-300" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                      notification.status !== 'read' ? 'bg-blue-50/30' : ''
                    }`}
                    onClick={() => {
                      if (notification.status !== 'read') {
                        markAsRead(notification.id);
                      }
                      // Navigate to device if available
                      if (notification.metadata?.device_id) {
                        window.location.href = `/devices/${notification.metadata.device_id}`;
                        setIsOpen(false);
                      }
                    }}
                  >
                    <div className="flex gap-3">
                      {/* Severity Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getSeverityIcon(notification.metadata?.severity)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        {notification.subject && (
                          <p className="text-sm font-semibold text-gray-900 mb-1">
                            {notification.subject}
                          </p>
                        )}

                        {/* Message */}
                        <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                          {notification.message}
                        </p>

                        {/* Metadata */}
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

                        {/* Values if available */}
                        {(notification.metadata?.current_value !== undefined ||
                          notification.metadata?.threshold_value !== undefined) && (
                          <div className="mt-2 text-xs text-gray-600">
                            {notification.metadata.current_value !== undefined && (
                              <span>Current: {notification.metadata.current_value}</span>
                            )}
                            {notification.metadata.threshold_value !== undefined && (
                              <span className="ml-2">
                                Threshold: {notification.metadata.threshold_value}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Unread indicator */}
                      {notification.status !== 'read' && (
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-2">
              <button
                onClick={() => {
                  window.location.href = '/notifications';
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
