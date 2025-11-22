import { useState, useEffect } from 'react';
import { Save, AlertTriangle, TrendingUp, Activity, Zap, Info, ExternalLink } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import LoadingScreen from '../../../components/common/LoadingScreen';
import useCompanies from '../../../hooks/useCompanies';

interface AlertThresholds {
  threshold_config_id?: string;
  company_id: string;
  device_id?: string | null;

  // Absolute thresholds
  temp_min_warning: number;
  temp_min_critical: number;
  temp_max_warning: number;
  temp_max_critical: number;

  rh_min_warning: number;
  rh_min_critical: number;
  rh_max_warning: number;
  rh_max_critical: number;

  mgi_max_warning: number;
  mgi_max_critical: number;

  // Intra-session shifts
  temp_shift_min_per_session: number;
  temp_shift_max_per_session: number;
  rh_shift_min_per_session: number;
  rh_shift_max_per_session: number;

  // MGI velocity
  mgi_velocity_warning: number;
  mgi_velocity_critical: number;

  // MGI program speed
  mgi_speed_per_day_warning: number;
  mgi_speed_per_day_critical: number;
  mgi_speed_per_week_warning: number;
  mgi_speed_per_week_critical: number;

  // Combination zones
  combo_zone_warning: { temp_threshold: number; rh_threshold: number };
  combo_zone_critical: { temp_threshold: number; rh_threshold: number };
}

const CompanyAlertThresholds = () => {
  const navigate = useNavigate();
  const { userCompany, loading: companyLoading } = useCompanies();
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [devicesWithOverrides, setDevicesWithOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load company default thresholds
  useEffect(() => {
    const loadThresholds = async () => {
      if (!userCompany) return;

      try {
        const { data, error } = await supabase
          .from('device_alert_thresholds')
          .select('*')
          .eq('company_id', userCompany.company_id)
          .is('device_id', null) // Company defaults
          .single();

        if (error) throw error;

        if (data) {
          setThresholds(data as AlertThresholds);
        }

        // Load devices with custom overrides
        const { data: overrideDevices, error: overrideError } = await supabase
          .from('device_alert_thresholds')
          .select(`
            device_id,
            devices!inner(device_id, device_code, device_name)
          `)
          .eq('company_id', userCompany.company_id)
          .not('device_id', 'is', null);

        if (!overrideError && overrideDevices) {
          setDevicesWithOverrides(overrideDevices);
        }
      } catch (error) {
        console.error('Error loading thresholds:', error);
        toast.error('Failed to load alert thresholds');
      } finally {
        setLoading(false);
      }
    };

    loadThresholds();
  }, [userCompany]);

  const handleSave = async () => {
    if (!userCompany || !thresholds) return;

    setSaving(true);
    try {
      // Remove threshold_config_id, created_at, and other fields that shouldn't be in upsert
      const { threshold_config_id, created_at, created_by_user_id, updated_by_user_id, ...thresholdData } = thresholds;

      if (threshold_config_id) {
        // Update existing record
        const { error } = await supabase
          .from('device_alert_thresholds')
          .update({
            ...thresholdData,
            updated_at: new Date().toISOString(),
          })
          .eq('threshold_config_id', threshold_config_id);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('device_alert_thresholds')
          .insert({
            ...thresholdData,
            company_id: userCompany.company_id,
            device_id: null, // Company default
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      toast.success('Alert thresholds saved successfully');

      // Reload to get the updated data with IDs
      const { data } = await supabase
        .from('device_alert_thresholds')
        .select('*')
        .eq('company_id', userCompany.company_id)
        .is('device_id', null)
        .single();

      if (data) {
        setThresholds(data as AlertThresholds);
      }
    } catch (error) {
      console.error('Error saving thresholds:', error);
      toast.error('Failed to save alert thresholds');
    } finally {
      setSaving(false);
    }
  };

  if (companyLoading || loading) {
    return <LoadingScreen />;
  }

  if (!thresholds) {
    return (
      <div className="p-6">
        <Card>
          <CardContent>
            <p className="text-gray-500">No alert thresholds configured for this company.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BI Alerts Configuration</h1>
          <p className="text-gray-600 mt-1">
            Configure alert thresholds for {userCompany?.name}
          </p>
        </div>
        <Button
          onClick={handleSave}
          loading={saving}
          leftIcon={<Save className="w-4 h-4" />}
        >
          Save Changes
        </Button>
      </div>

      {/* Info Card - Devices with Overrides */}
      {devicesWithOverrides.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">Device-Specific Overrides</h2>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">
              The following devices have custom alert thresholds that override these company defaults:
            </p>
            <div className="flex flex-wrap gap-2">
              {devicesWithOverrides.map((item: any) => (
                <button
                  key={item.device_id}
                  onClick={() => navigate(`/devices/${item.device_id}`)}
                  className="flex items-center gap-1 px-3 py-1 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors"
                >
                  <span className="text-sm font-medium text-orange-900">
                    {item.devices.device_code}
                  </span>
                  <ExternalLink className="w-3 h-3 text-orange-600" />
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3 italic">
              Click a device to view or edit its custom thresholds
            </p>
          </CardContent>
        </Card>
      )}

      {/* Absolute Thresholds */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h2 className="text-xl font-semibold">Absolute Thresholds</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Alert when readings exceed these absolute values
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Temperature */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Temperature (°F)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Warning
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.temp_min_warning}
                    onChange={(e) => setThresholds({ ...thresholds, temp_min_warning: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Critical
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.temp_min_critical}
                    onChange={(e) => setThresholds({ ...thresholds, temp_min_critical: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Warning
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.temp_max_warning}
                    onChange={(e) => setThresholds({ ...thresholds, temp_max_warning: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Critical
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.temp_max_critical}
                    onChange={(e) => setThresholds({ ...thresholds, temp_max_critical: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            {/* Humidity */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Relative Humidity (%)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Warning
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.rh_min_warning}
                    onChange={(e) => setThresholds({ ...thresholds, rh_min_warning: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Critical
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.rh_min_critical}
                    onChange={(e) => setThresholds({ ...thresholds, rh_min_critical: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Warning
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.rh_max_warning}
                    onChange={(e) => setThresholds({ ...thresholds, rh_max_warning: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Critical
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.rh_max_critical}
                    onChange={(e) => setThresholds({ ...thresholds, rh_max_critical: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            {/* MGI */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Mold Growth Index (%)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Warning
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.mgi_max_warning}
                    onChange={(e) => setThresholds({ ...thresholds, mgi_max_warning: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Critical
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.mgi_max_critical}
                    onChange={(e) => setThresholds({ ...thresholds, mgi_max_critical: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intra-Session Shifts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Intra-Session Shifts</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Alert when readings change too quickly within a single day
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Temperature Shifts */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Temperature Shift (°F/session)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Drop
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.temp_shift_min_per_session}
                    onChange={(e) => setThresholds({ ...thresholds, temp_shift_min_per_session: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="-25"
                  />
                  <p className="text-xs text-gray-500 mt-1">Negative value (e.g., -25°F)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Rise
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.temp_shift_max_per_session}
                    onChange={(e) => setThresholds({ ...thresholds, temp_shift_max_per_session: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="+25"
                  />
                  <p className="text-xs text-gray-500 mt-1">Positive value (e.g., +25°F)</p>
                </div>
              </div>
            </div>

            {/* Humidity Shifts */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Humidity Shift (%/session)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Drop
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.rh_shift_min_per_session}
                    onChange={(e) => setThresholds({ ...thresholds, rh_shift_min_per_session: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Negative value (e.g., -50%)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Rise
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.rh_shift_max_per_session}
                    onChange={(e) => setThresholds({ ...thresholds, rh_shift_max_per_session: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="+50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Positive value (e.g., +50%)</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MGI Velocity & Speed */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold">MGI Velocity & Program Speed</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Alert on MGI growth rates (day-to-day and program average)
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Velocity (Day-to-Day) */}
            <div>
              <h3 className="font-medium text-gray-900 mb-4">Day-to-Day Velocity (% growth)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Warning
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.mgi_velocity_warning}
                    onChange={(e) => setThresholds({ ...thresholds, mgi_velocity_warning: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="30"
                  />
                  <p className="text-xs text-gray-500 mt-1">e.g., +30% growth from yesterday</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Critical
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.mgi_velocity_critical}
                    onChange={(e) => setThresholds({ ...thresholds, mgi_velocity_critical: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="40"
                  />
                  <p className="text-xs text-gray-500 mt-1">e.g., +40% growth from yesterday</p>
                </div>
              </div>
            </div>

            {/* Program Speed */}
            <div>
              <h3 className="font-medium text-gray-900 mb-4">Program Speed (Average Growth)</h3>
              <div className="grid grid-cols-2 gap-6">
                {/* Per Day */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">MGI Points / Day</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Warning</label>
                      <input
                        type="number"
                        step="0.1"
                        value={thresholds.mgi_speed_per_day_warning}
                        onChange={(e) => setThresholds({ ...thresholds, mgi_speed_per_day_warning: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Critical</label>
                      <input
                        type="number"
                        step="0.1"
                        value={thresholds.mgi_speed_per_day_critical}
                        onChange={(e) => setThresholds({ ...thresholds, mgi_speed_per_day_critical: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="7"
                      />
                    </div>
                  </div>
                </div>

                {/* Per Week */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">MGI Points / Week</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Warning</label>
                      <input
                        type="number"
                        step="0.1"
                        value={thresholds.mgi_speed_per_week_warning}
                        onChange={(e) => setThresholds({ ...thresholds, mgi_speed_per_week_warning: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Critical</label>
                      <input
                        type="number"
                        step="0.1"
                        value={thresholds.mgi_speed_per_week_critical}
                        onChange={(e) => setThresholds({ ...thresholds, mgi_speed_per_week_critical: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="15"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Combination Zones */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-600" />
            <h2 className="text-xl font-semibold">Combination Danger Zones</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Alert when temperature AND humidity both exceed thresholds simultaneously
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Warning Zone */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Warning Zone</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature Threshold (°F)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.combo_zone_warning.temp_threshold}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      combo_zone_warning: {
                        ...thresholds.combo_zone_warning,
                        temp_threshold: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Humidity Threshold (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.combo_zone_warning.rh_threshold}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      combo_zone_warning: {
                        ...thresholds.combo_zone_warning,
                        rh_threshold: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="75"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Alert when BOTH thresholds exceeded (e.g., &gt;60°F AND &gt;75%RH)
                </p>
              </div>
            </div>

            {/* Critical Zone */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Critical Zone</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature Threshold (°F)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.combo_zone_critical.temp_threshold}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      combo_zone_critical: {
                        ...thresholds.combo_zone_critical,
                        temp_threshold: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="70"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Humidity Threshold (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.combo_zone_critical.rh_threshold}
                    onChange={(e) => setThresholds({
                      ...thresholds,
                      combo_zone_critical: {
                        ...thresholds.combo_zone_critical,
                        rh_threshold: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="75"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Alert when BOTH thresholds exceeded (e.g., &gt;70°F AND &gt;75%RH)
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button (bottom) */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          loading={saving}
          leftIcon={<Save className="w-4 h-4" />}
        >
          Save All Changes
        </Button>
      </div>
    </div>
  );
};

export default CompanyAlertThresholds;
