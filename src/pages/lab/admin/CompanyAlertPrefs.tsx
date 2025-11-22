import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { useUserRole } from '../../../hooks/useUserRole';
import { Save, AlertTriangle } from 'lucide-react';

export default function CompanyAlertPrefs() {
  const { userRole } = useUserRole();
  const isSuperAdmin = userRole === 'super_admin';

  const [activeTab, setActiveTab] = useState<'thresholds' | 'channels'>('thresholds');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [thresholdsJson, setThresholdsJson] = useState('');
  const [channelsJson, setChannelsJson] = useState('');
  const [quietHoursJson, setQuietHoursJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      toast.error('Access denied: super admin only');
      return;
    }
    fetchCompanyAndPrefs();
  }, []);

  const fetchCompanyAndPrefs = async () => {
    try {
      setLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', userData.user.id)
        .single();

      if (profileError) throw profileError;

      if (!userProfile?.company_id) {
        toast.error('No company associated with your account');
        setLoading(false);
        return;
      }

      setCompanyId(userProfile.company_id);

      const { data: prefs, error: prefsError } = await supabase.rpc(
        'fn_get_company_alert_prefs',
        { p_company_id: userProfile.company_id }
      );

      if (prefsError) throw prefsError;

      setThresholdsJson(JSON.stringify(prefs.thresholds, null, 2));
      setChannelsJson(JSON.stringify(prefs.channels, null, 2));
      setQuietHoursJson(prefs.quiet_hours ? JSON.stringify(prefs.quiet_hours, null, 2) : '');

    } catch (error: any) {
      console.error('Error fetching alert prefs:', error);
      toast.error(`Failed to load preferences: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const validateJson = (json: string): boolean => {
    if (!json.trim()) return true;
    try {
      JSON.parse(json);
      setJsonError(null);
      return true;
    } catch (e: any) {
      setJsonError(e.message);
      return false;
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error('No company ID available');
      return;
    }

    if (!validateJson(thresholdsJson)) {
      toast.error('Invalid thresholds JSON');
      return;
    }

    if (!validateJson(channelsJson)) {
      toast.error('Invalid channels JSON');
      return;
    }

    if (quietHoursJson && !validateJson(quietHoursJson)) {
      toast.error('Invalid quiet hours JSON');
      return;
    }

    try {
      setSaving(true);

      const thresholds = JSON.parse(thresholdsJson);
      const channels = JSON.parse(channelsJson);
      const quietHours = quietHoursJson ? JSON.parse(quietHoursJson) : null;

      const { data, error } = await supabase.rpc('fn_set_company_alert_prefs', {
        p_company_id: companyId,
        p_thresholds: thresholds,
        p_channels: channels,
        p_quiet_hours: quietHours,
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Alert preferences saved successfully');
      } else {
        throw new Error(data?.message || 'Failed to save preferences');
      }
    } catch (error: any) {
      console.error('Error saving alert prefs:', error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-red-900 mb-2">Access Denied</h2>
          <p className="text-red-700">This page is only accessible to super administrators.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          Loading alert preferences...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Company Alert Preferences</h1>
        <p className="mt-2 text-sm text-gray-600">
          Configure alert thresholds and notification channels for your company
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'thresholds'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            Thresholds
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'channels'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            Channels & Quiet Hours
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {activeTab === 'thresholds' ? (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert Thresholds Configuration</h2>
            <p className="text-sm text-gray-600 mb-4">
              Define warning, danger, and critical thresholds for telemetry (temperature, humidity) and MGI metrics.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thresholds JSON
                </label>
                <textarea
                  value={thresholdsJson}
                  onChange={(e) => {
                    setThresholdsJson(e.target.value);
                    validateJson(e.target.value);
                  }}
                  className="w-full h-96 px-4 py-3 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder='{"telemetry": {...}, "mgi": {...}}'
                />
                {jsonError && (
                  <p className="mt-2 text-sm text-red-600">Invalid JSON: {jsonError}</p>
                )}
              </div>

              {/* Threshold Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">Threshold Structure Guide</h3>
                <div className="text-xs text-blue-800 font-mono space-y-1">
                  <div>• <strong>telemetry</strong>: temp_max, temp_min, rh_max, rh_min, pressure_max, pressure_min</div>
                  <div>• <strong>mgi</strong>: absolute_high, absolute_critical, velocity_high, velocity_critical, speed_high_per_day, speed_critical_per_day</div>
                  <div>• <strong>alert_levels</strong>: warning, danger, critical (with temp, rh, mgi values)</div>
                  <div>• <strong>window_days</strong>: Number of days for velocity/speed calculations</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Channels</h2>
              <p className="text-sm text-gray-600 mb-4">
                Configure which channels receive alerts and for which severity levels.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Channels JSON
                </label>
                <textarea
                  value={channelsJson}
                  onChange={(e) => {
                    setChannelsJson(e.target.value);
                    validateJson(e.target.value);
                  }}
                  className="w-full h-64 px-4 py-3 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder='{"email": {...}, "sms": {...}}'
                />
              </div>

              {/* Channel Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">Channel Structure Guide</h3>
                <div className="text-xs text-blue-800 font-mono space-y-1">
                  <div>• <strong>email</strong>: enabled (bool), addresses (array), alert_levels (array)</div>
                  <div>• <strong>sms</strong>: enabled (bool), numbers (array), alert_levels (array)</div>
                  <div>• <strong>webhook</strong>: enabled (bool), url (string), alert_levels (array)</div>
                  <div>• <strong>in_app</strong>: enabled (bool), alert_levels (array)</div>
                  <div>• Alert levels: "warning", "danger", "critical"</div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quiet Hours (Optional)</h2>
              <p className="text-sm text-gray-600 mb-4">
                Suppress alerts during specific hours (e.g., overnight).
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quiet Hours JSON (leave empty to disable)
                </label>
                <textarea
                  value={quietHoursJson}
                  onChange={(e) => {
                    setQuietHoursJson(e.target.value);
                    validateJson(e.target.value);
                  }}
                  className="w-full h-32 px-4 py-3 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder='{"enabled": true, "timezone": "America/New_York", "start": "22:00", "end": "07:00"}'
                />
              </div>

              {/* Quiet Hours Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">Quiet Hours Structure</h3>
                <div className="text-xs text-blue-800 font-mono space-y-1">
                  <div>• <strong>enabled</strong>: true/false</div>
                  <div>• <strong>timezone</strong>: "America/New_York" (IANA timezone)</div>
                  <div>• <strong>start</strong>: "22:00" (24-hour format)</div>
                  <div>• <strong>end</strong>: "07:00" (24-hour format)</div>
                  <div>• <strong>days</strong>: ["mon", "tue", "wed", "thu", "fri"] (optional, defaults to all days)</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !!jsonError}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-5 w-5" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
