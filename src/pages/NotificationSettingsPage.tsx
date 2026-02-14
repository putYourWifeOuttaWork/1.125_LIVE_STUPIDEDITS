import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Mail, Monitor, Smartphone, Clock, Volume2, Save, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import useCompanies from '../hooks/useCompanies';
import { toast } from 'react-toastify';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import { useNotifications } from '../hooks/useNotifications';

interface NotificationPreferences {
  email_enabled: boolean;
  email_address: string | null;
  browser_enabled: boolean;
  sms_enabled: boolean;
  phone_number: string | null;
  alert_types: string[];
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string;
  digest_mode: boolean;
  digest_frequency: string;
  min_notification_interval: string;
}

export default function NotificationSettingsPage() {
  const { user } = useAuthStore();
  const { userCompany } = useCompanies();
  const navigate = useNavigate();
  const { requestNotificationPermission } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_enabled: true,
    email_address: null,
    browser_enabled: true,
    sms_enabled: false,
    phone_number: null,
    alert_types: ['critical', 'high', 'medium'],
    quiet_hours_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    quiet_hours_timezone: 'UTC',
    digest_mode: false,
    digest_frequency: 'hourly',
    min_notification_interval: '5 minutes',
  });

  useEffect(() => {
    fetchPreferences();
  }, [user?.id, userCompany?.company_id]);

  const fetchPreferences = async () => {
    if (!user?.id || !userCompany?.company_id) return;

    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', userCompany.company_id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPreferences({
          email_enabled: data.email_enabled ?? true,
          email_address: data.email_address,
          browser_enabled: data.browser_enabled ?? true,
          sms_enabled: data.sms_enabled ?? false,
          phone_number: data.phone_number,
          alert_types: data.alert_types || ['critical', 'high', 'medium'],
          quiet_hours_enabled: data.quiet_hours_enabled ?? false,
          quiet_hours_start: data.quiet_hours_start,
          quiet_hours_end: data.quiet_hours_end,
          quiet_hours_timezone: data.quiet_hours_timezone || 'UTC',
          digest_mode: data.digest_mode ?? false,
          digest_frequency: data.digest_frequency || 'hourly',
          min_notification_interval: data.min_notification_interval || '5 minutes',
        });
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id || !userCompany?.company_id) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          company_id: userCompany.company_id,
          ...preferences,
        });

      if (error) throw error;

      toast.success('Notification preferences saved');
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleAlertTypeToggle = (alertType: string) => {
    setPreferences(prev => ({
      ...prev,
      alert_types: prev.alert_types.includes(alertType)
        ? prev.alert_types.filter(t => t !== alertType)
        : [...prev.alert_types, alertType],
    }));
  };

  const handleBrowserEnableToggle = async () => {
    if (!preferences.browser_enabled) {
      // Request permission when enabling
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error('Browser notifications permission denied');
        return;
      }
    }

    setPreferences(prev => ({
      ...prev,
      browser_enabled: !prev.browser_enabled,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
          <p className="text-gray-600 mt-1">Manage how you receive alert notifications</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Notification Channels */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notification Channels
          </h2>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-1">
              <Mail className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Email Notifications</h3>
                  <p className="text-sm text-gray-600">Receive alerts via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.email_enabled}
                    onChange={(e) =>
                      setPreferences(prev => ({ ...prev, email_enabled: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              {preferences.email_enabled && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address (optional override)
                  </label>
                  <input
                    type="email"
                    value={preferences.email_address || ''}
                    onChange={(e) =>
                      setPreferences(prev => ({ ...prev, email_address: e.target.value }))
                    }
                    placeholder={user?.email}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to use your account email: {user?.email}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Browser */}
          <div className="flex items-start gap-4 pt-4 border-t border-gray-200">
            <div className="flex-shrink-0 mt-1">
              <Monitor className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Browser Notifications</h3>
                  <p className="text-sm text-gray-600">
                    Get real-time alerts in your browser
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.browser_enabled}
                    onChange={handleBrowserEnableToggle}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              {!('Notification' in window) && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-xs text-yellow-800">
                    Browser notifications are not supported in your browser
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SMS */}
          <div className="flex items-start gap-4 pt-4 border-t border-gray-200">
            <div className="flex-shrink-0 mt-1">
              <Smartphone className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">SMS Notifications</h3>
                  <p className="text-sm text-gray-600">Critical alerts via text message</p>
                  <p className="text-xs text-yellow-600 mt-1">Coming soon</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer opacity-50">
                  <input
                    type="checkbox"
                    checked={preferences.sms_enabled}
                    disabled
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Types */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Alert Severity Levels
          </h2>
          <p className="text-sm text-gray-600 mt-1">Choose which alert severities you want to receive</p>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'critical', label: 'Critical', color: 'red' },
              { value: 'high', label: 'High', color: 'orange' },
              { value: 'medium', label: 'Medium', color: 'yellow' },
              { value: 'low', label: 'Low', color: 'blue' },
            ].map(({ value, label, color }) => (
              <label
                key={value}
                className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  preferences.alert_types.includes(value)
                    ? `border-${color}-500 bg-${color}-50`
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={preferences.alert_types.includes(value)}
                  onChange={() => handleAlertTypeToggle(value)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="font-medium text-gray-900">{label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Quiet Hours
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Pause non-critical notifications during specific hours
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.quiet_hours_enabled}
                onChange={(e) =>
                  setPreferences(prev => ({ ...prev, quiet_hours_enabled: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </CardHeader>
        {preferences.quiet_hours_enabled && (
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={preferences.quiet_hours_start || ''}
                  onChange={(e) =>
                    setPreferences(prev => ({ ...prev, quiet_hours_start: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={preferences.quiet_hours_end || ''}
                  onChange={(e) =>
                    setPreferences(prev => ({ ...prev, quiet_hours_end: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Advanced Settings
          </h2>
        </CardHeader>
        <CardContent>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Notification Interval
            </label>
            <select
              value={preferences.min_notification_interval}
              onChange={(e) =>
                setPreferences(prev => ({ ...prev, min_notification_interval: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="1 minute">Every minute</option>
              <option value="5 minutes">Every 5 minutes</option>
              <option value="15 minutes">Every 15 minutes</option>
              <option value="30 minutes">Every 30 minutes</option>
              <option value="1 hour">Every hour</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Prevent notification spam by setting a minimum time between alerts
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
