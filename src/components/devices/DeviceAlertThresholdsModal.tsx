import { useState, useEffect } from 'react';
import { X, AlertTriangle, Copy, RotateCcw, Save, Info } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';

interface AlertThresholds {
  threshold_config_id?: string;
  company_id: string;
  device_id?: string | null;

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

  temp_shift_min_per_session: number;
  temp_shift_max_per_session: number;
  rh_shift_min_per_session: number;
  rh_shift_max_per_session: number;

  mgi_velocity_warning: number;
  mgi_velocity_critical: number;

  mgi_speed_per_day_warning: number;
  mgi_speed_per_day_critical: number;
  mgi_speed_per_week_warning: number;
  mgi_speed_per_week_critical: number;

  combo_zone_warning: { temp_threshold: number; rh_threshold: number };
  combo_zone_critical: { temp_threshold: number; rh_threshold: number };
}

interface DeviceAlertThresholdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  deviceCode: string;
  companyId: string;
}

const DeviceAlertThresholdsModal = ({
  isOpen,
  onClose,
  deviceId,
  deviceCode,
  companyId,
}: DeviceAlertThresholdsModalProps) => {
  const [deviceThresholds, setDeviceThresholds] = useState<AlertThresholds | null>(null);
  const [companyThresholds, setCompanyThresholds] = useState<AlertThresholds | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'override' | 'comparison'>('override');

  useEffect(() => {
    if (!isOpen) return;

    const loadThresholds = async () => {
      try {
        // Load company defaults
        const { data: companyData, error: companyError } = await supabase
          .from('device_alert_thresholds')
          .select('*')
          .eq('company_id', companyId)
          .is('device_id', null)
          .single();

        if (companyError) throw companyError;
        setCompanyThresholds(companyData as AlertThresholds);

        // Load device-specific override (if exists)
        const { data: deviceData, error: deviceError } = await supabase
          .from('device_alert_thresholds')
          .select('*')
          .eq('device_id', deviceId)
          .maybeSingle();

        if (deviceData) {
          setDeviceThresholds(deviceData as AlertThresholds);
          setHasOverride(true);
        } else {
          // Use company defaults as starting point (remove IDs to avoid conflicts)
          const { threshold_config_id, created_at, created_by_user_id, updated_by_user_id, ...cleanCompanyData } = companyData;
          setDeviceThresholds({ ...cleanCompanyData, device_id: deviceId } as AlertThresholds);
          setHasOverride(false);
        }
      } catch (error) {
        console.error('Error loading thresholds:', error);
        toast.error('Failed to load alert thresholds');
      } finally {
        setLoading(false);
      }
    };

    loadThresholds();
  }, [isOpen, deviceId, companyId]);

  const handleSave = async () => {
    if (!deviceThresholds) return;

    setSaving(true);
    try {
      // Remove fields that shouldn't be in upsert
      const { threshold_config_id, created_at, created_by_user_id, updated_by_user_id, ...thresholdData } = deviceThresholds;

      if (threshold_config_id) {
        // Update existing override
        const { error } = await supabase
          .from('device_alert_thresholds')
          .update({
            ...thresholdData,
            updated_at: new Date().toISOString(),
          })
          .eq('threshold_config_id', threshold_config_id);

        if (error) throw error;
      } else {
        // Insert new override
        const { error } = await supabase
          .from('device_alert_thresholds')
          .insert({
            ...thresholdData,
            company_id: companyId,
            device_id: deviceId,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      toast.success(`Custom thresholds saved for ${deviceCode}`);
      setHasOverride(true);
      onClose();
    } catch (error) {
      console.error('Error saving thresholds:', error);
      toast.error('Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToCompany = async () => {
    if (!companyThresholds) return;

    if (!confirm(`Reset ${deviceCode} to company defaults? This will delete the custom override.`)) {
      return;
    }

    try {
      // Delete device-specific override
      const { error } = await supabase
        .from('device_alert_thresholds')
        .delete()
        .eq('device_id', deviceId);

      if (error) throw error;

      toast.success(`${deviceCode} reset to company defaults`);
      setDeviceThresholds({ ...companyThresholds, device_id: deviceId } as AlertThresholds);
      setHasOverride(false);
    } catch (error) {
      console.error('Error resetting thresholds:', error);
      toast.error('Failed to reset thresholds');
    }
  };

  const handleCopyFromCompany = () => {
    if (!companyThresholds) return;
    // Remove IDs to avoid conflicts when saving
    const { threshold_config_id, created_at, created_by_user_id, updated_by_user_id, ...cleanCompanyData } = companyThresholds;
    setDeviceThresholds({ ...cleanCompanyData, device_id: deviceId } as AlertThresholds);
    toast.info('Copied company defaults - click Save to apply');
  };

  if (loading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Alert Thresholds - ${deviceCode}`}>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading thresholds...</p>
        </div>
      </Modal>
    );
  }

  if (!deviceThresholds || !companyThresholds) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Alert Thresholds - ${deviceCode}`}>
        <div className="text-center py-8">
          <p className="text-gray-600">No thresholds configured</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Alert Thresholds - ${deviceCode}`} size="xl">
      <div className="space-y-3">
        {/* Header Actions */}
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-4 h-4 ${hasOverride ? 'text-orange-600' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-medium">
                {hasOverride ? 'Custom Override Active' : 'Using Company Defaults'}
              </p>
              <p className="text-xs text-gray-600">
                {hasOverride
                  ? 'This device has custom thresholds that override company defaults'
                  : 'This device inherits thresholds from company template'}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewMode(viewMode === 'override' ? 'comparison' : 'override')}
          >
            {viewMode === 'override' ? 'Compare' : 'Edit'}
          </Button>
        </div>

        {/* View Mode Toggle */}
        {viewMode === 'comparison' ? (
          <ComparisonView
            deviceThresholds={deviceThresholds}
            companyThresholds={companyThresholds}
            deviceCode={deviceCode}
          />
        ) : (
          <OverrideEditForm
            thresholds={deviceThresholds}
            onChange={setDeviceThresholds}
            companyThresholds={companyThresholds}
          />
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex gap-2">
            {hasOverride && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToCompany}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Reset to Company
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyFromCompany}
              leftIcon={<Copy className="w-4 h-4" />}
            >
              Copy Company Defaults
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Override
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// Comparison View Component
const ComparisonView = ({
  deviceThresholds,
  companyThresholds,
  deviceCode,
}: {
  deviceThresholds: AlertThresholds;
  companyThresholds: AlertThresholds;
  deviceCode: string;
}) => {
  const thresholdFields = [
    { key: 'temp_min_warning', label: 'Temp Min Warning (°F)' },
    { key: 'temp_min_critical', label: 'Temp Min Critical (°F)' },
    { key: 'temp_max_warning', label: 'Temp Max Warning (°F)' },
    { key: 'temp_max_critical', label: 'Temp Max Critical (°F)' },
    { key: 'rh_min_warning', label: 'RH Min Warning (%)' },
    { key: 'rh_min_critical', label: 'RH Min Critical (%)' },
    { key: 'rh_max_warning', label: 'RH Max Warning (%)' },
    { key: 'rh_max_critical', label: 'RH Max Critical (%)' },
    { key: 'mgi_max_warning', label: 'MGI Max Warning (%)' },
    { key: 'mgi_max_critical', label: 'MGI Max Critical (%)' },
  ];

  const comboFields = [
    { label: 'Danger Zone Warning Temp (°F)', zone: 'combo_zone_warning' as const, field: 'temp_threshold' as const },
    { label: 'Danger Zone Warning RH (%)', zone: 'combo_zone_warning' as const, field: 'rh_threshold' as const },
    { label: 'Danger Zone Critical Temp (°F)', zone: 'combo_zone_critical' as const, field: 'temp_threshold' as const },
    { label: 'Danger Zone Critical RH (%)', zone: 'combo_zone_critical' as const, field: 'rh_threshold' as const },
  ];

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-gray-900">Threshold Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Threshold</th>
              <th className="text-center px-4 py-2 font-medium">Company Default</th>
              <th className="text-center px-4 py-2 font-medium">{deviceCode}</th>
              <th className="text-center px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {thresholdFields.map((field) => {
              const deviceVal = deviceThresholds[field.key as keyof AlertThresholds];
              const companyVal = companyThresholds[field.key as keyof AlertThresholds];
              const isDifferent = deviceVal !== companyVal;

              return (
                <tr key={field.key} className={isDifferent ? 'bg-orange-50' : ''}>
                  <td className="px-4 py-2 border-b">{field.label}</td>
                  <td className="px-4 py-2 border-b text-center">{String(companyVal)}</td>
                  <td className="px-4 py-2 border-b text-center font-medium">{String(deviceVal)}</td>
                  <td className="px-4 py-2 border-b text-center">
                    {isDifferent ? (
                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        Override
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Default</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {comboFields.map((cf) => {
              const deviceVal = deviceThresholds[cf.zone]?.[cf.field];
              const companyVal = companyThresholds[cf.zone]?.[cf.field];
              const isDifferent = deviceVal !== companyVal;

              return (
                <tr key={`${cf.zone}_${cf.field}`} className={isDifferent ? 'bg-orange-50' : ''}>
                  <td className="px-4 py-2 border-b">{cf.label}</td>
                  <td className="px-4 py-2 border-b text-center">{companyVal ?? '-'}</td>
                  <td className="px-4 py-2 border-b text-center font-medium">{deviceVal ?? '-'}</td>
                  <td className="px-4 py-2 border-b text-center">
                    {isDifferent ? (
                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        Override
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Default</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Override Edit Form (simplified version - just key fields)
const OverrideEditForm = ({
  thresholds,
  onChange,
  companyThresholds,
}: {
  thresholds: AlertThresholds;
  onChange: (t: AlertThresholds) => void;
  companyThresholds: AlertThresholds;
}) => {
  const isDifferent = (key: keyof AlertThresholds) => {
    return thresholds[key] !== companyThresholds[key];
  };

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        {/* Temperature */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Temperature (°F)</h3>
          <div className="space-y-1.5">
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Min Warning {isDifferent('temp_min_warning') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.temp_min_warning}
                onChange={(e) => onChange({ ...thresholds, temp_min_warning: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Min Critical {isDifferent('temp_min_critical') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.temp_min_critical}
                onChange={(e) => onChange({ ...thresholds, temp_min_critical: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Max Warning {isDifferent('temp_max_warning') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.temp_max_warning}
                onChange={(e) => onChange({ ...thresholds, temp_max_warning: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Max Critical {isDifferent('temp_max_critical') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.temp_max_critical}
                onChange={(e) => onChange({ ...thresholds, temp_max_critical: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Humidity */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Relative Humidity (%)</h3>
          <div className="space-y-1.5">
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Min Warning {isDifferent('rh_min_warning') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.rh_min_warning}
                onChange={(e) => onChange({ ...thresholds, rh_min_warning: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Min Critical {isDifferent('rh_min_critical') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.rh_min_critical}
                onChange={(e) => onChange({ ...thresholds, rh_min_critical: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Max Warning {isDifferent('rh_max_warning') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.rh_max_warning}
                onChange={(e) => onChange({ ...thresholds, rh_max_warning: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Max Critical {isDifferent('rh_max_critical') && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.rh_max_critical}
                onChange={(e) => onChange({ ...thresholds, rh_max_critical: parseFloat(e.target.value) })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50 mt-2">
        <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Danger Zone (Temp + Humidity Combined)</h3>
        <div className="flex items-start gap-2 p-2 mb-2 bg-white border border-amber-100 rounded-md">
          <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">
            Alerts when <strong>both</strong> temp AND humidity exceed their thresholds simultaneously,
            detecting conditions where warmth + moisture combine to elevate mold risk.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-800">Warning</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Temp (°F) {thresholds.combo_zone_warning?.temp_threshold !== companyThresholds.combo_zone_warning?.temp_threshold && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.combo_zone_warning?.temp_threshold ?? 60}
                onChange={(e) => onChange({
                  ...thresholds,
                  combo_zone_warning: { ...thresholds.combo_zone_warning, temp_threshold: parseFloat(e.target.value) },
                })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                RH (%) {thresholds.combo_zone_warning?.rh_threshold !== companyThresholds.combo_zone_warning?.rh_threshold && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.combo_zone_warning?.rh_threshold ?? 75}
                onChange={(e) => onChange({
                  ...thresholds,
                  combo_zone_warning: { ...thresholds.combo_zone_warning, rh_threshold: parseFloat(e.target.value) },
                })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <p className="text-xs font-medium text-red-800 pt-1">Critical</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                Temp (°F) {thresholds.combo_zone_critical?.temp_threshold !== companyThresholds.combo_zone_critical?.temp_threshold && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.combo_zone_critical?.temp_threshold ?? 70}
                onChange={(e) => onChange({
                  ...thresholds,
                  combo_zone_critical: { ...thresholds.combo_zone_critical, temp_threshold: parseFloat(e.target.value) },
                })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-0.5">
                RH (%) {thresholds.combo_zone_critical?.rh_threshold !== companyThresholds.combo_zone_critical?.rh_threshold && '🔸'}
              </label>
              <input
                type="number"
                step="0.1"
                value={thresholds.combo_zone_critical?.rh_threshold ?? 75}
                onChange={(e) => onChange({
                  ...thresholds,
                  combo_zone_critical: { ...thresholds.combo_zone_critical, rh_threshold: parseFloat(e.target.value) },
                })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 italic">
        🔸 = Value differs from company default
      </p>
    </div>
  );
};

export default DeviceAlertThresholdsModal;
