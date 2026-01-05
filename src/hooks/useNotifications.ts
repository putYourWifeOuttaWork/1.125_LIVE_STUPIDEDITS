import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';

export interface Notification {
  id: string;
  alert_id: string | null;
  user_id: string;
  company_id: string;
  channel: 'email' | 'browser' | 'sms' | 'in_app';
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'delivered' | 'read';
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
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notification_delivery_log')
        .select('*')
        .eq('user_id', user.id)
        .in('channel', ['in_app', 'browser'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data || []);

      // Count unread
      const unread = (data || []).filter(n => n.status !== 'read').length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase.rpc('update_notification_status', {
        p_log_id: notificationId,
        p_status: 'read',
      });

      if (error) throw error;

      // Update local state
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, status: 'read' as const } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;

    try {
      const unreadIds = notifications
        .filter(n => n.status !== 'read')
        .map(n => n.id);

      for (const id of unreadIds) {
        await supabase.rpc('update_notification_status', {
          p_log_id: id,
          p_status: 'read',
        });
      }

      setNotifications(prev =>
        prev.map(n => ({ ...n, status: 'read' as const }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, [notifications, user?.id]);

  // Show browser notification
  const showBrowserNotification = useCallback((notification: Notification) => {
    // Check if browser notifications are supported and permitted
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const browserNotif = new Notification(notification.subject || 'New Alert', {
        body: notification.message,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: notification.id,
        requireInteraction: notification.metadata?.severity === 'critical',
        data: {
          notificationId: notification.id,
          deviceId: notification.metadata?.device_id,
          alertId: notification.alert_id,
        },
      });

      browserNotif.onclick = () => {
        window.focus();
        markAsRead(notification.id);

        // Navigate to device if metadata has device_id
        if (notification.metadata?.device_id) {
          window.location.href = `/devices/${notification.metadata.device_id}`;
        }

        browserNotif.close();
      };
    }
  }, [markAsRead]);

  // Request browser notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      toast.error('Browser notifications are not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast.success('Browser notifications enabled');
        return true;
      }
    }

    toast.error('Please enable notifications in your browser settings');
    return false;
  }, []);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_delivery_log',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;

          // Only show browser/in_app notifications
          if (newNotification.channel === 'browser' || newNotification.channel === 'in_app') {
            setNotifications(prev => [newNotification, ...prev]);
            setUnreadCount(prev => prev + 1);

            // Show browser notification if it's a browser channel
            if (newNotification.channel === 'browser') {
              showBrowserNotification(newNotification);
            }

            // Show toast for in-app
            if (newNotification.channel === 'in_app') {
              const severity = newNotification.metadata?.severity || 'info';
              const toastMethod = {
                critical: toast.error,
                high: toast.warning,
                medium: toast.warning,
                low: toast.info,
              }[severity] || toast.info;

              toastMethod(newNotification.message, {
                onClick: () => markAsRead(newNotification.id),
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications, showBrowserNotification, markAsRead]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    requestNotificationPermission,
    refetch: fetchNotifications,
  };
}
