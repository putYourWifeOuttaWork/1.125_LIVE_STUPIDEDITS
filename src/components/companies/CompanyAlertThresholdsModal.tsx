import { useState, useEffect } from 'react';
import { AlertTriangle, Save, Info } from 'lucide-react';
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

interface CompanyAlertThresholdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}

const CompanyAlertThresholdsModal = ({
  isOpen,
  onClose,
  companyId,
  companyName,
}: CompanyAlertThresholdsModalProps) => {
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const loadThresholds = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('device_alert_thresholds')
          .select('*')
          .eq('company_id', companyId)
          .is('device_id', null)
          .single();

        if (error) throw error;
        setThresholds(data as AlertThresholds);
      } catch (error) {
        console.error('Error loading company thresholds:', error);
        toast.error('Failed to load company alert thresholds');
      } finally {
        setLoading(false);
      }
    };

    loadThresholds();
  }, [isOpen, companyId]);

  const handleSave = async () => {
    if (!thresholds) return;

    setSaving(true);
    try {
      const { threshold_config_id, created_at, created_by_user_id, updated_by_user_id, ...thresholdData } = thresholds;

      const { error } = await supabase
        .from('device_alert_thresholds')
        .update({
          ...thresholdData,
          updated_at: new Date().toISOString(),
        })
        .eq('threshold_config_id', threshold_config_id);

      if (error) throw error;

      toast.success('Company default thresholds updated successfully');
      onClose();
    } catch (error) {
      console.error('Error saving thresholds:', error);
      toast.error('Failed to save company thresholds');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Alert Thresholds - ${companyName}`}>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading company thresholds...</p>
        </div>
      </Modal>
    );
  }

  if (!thresholds) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`Alert Thresholds - ${companyName}`}>
        <div className="text-center py-8">
          <p className="text-gray-600">No thresholds configured for this company</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Company Default Alert Thresholds`} size="xl">
      <div className="space-y-4">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-blue-900">Company Default Thresholds</p>
            <p className="text-blue-700 mt-1">
              These thresholds apply to all devices unless a device has custom override thresholds configured.
              Changes here will affect all devices using default thresholds.
            </p>
          </div>
        </div>

        {/* Threshold Form */}
        <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2">

          {/* Temperature Section */}
          <ThresholdSection title="Temperature Thresholds (°F)">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Min Warning"
                value={thresholds.temp_min_warning}
                onChange={(val) => setThresholds({ ...thresholds, temp_min_warning: val })}
                helpText="Alert when temp drops below this value"
              />
              <ThresholdInput
                label="Min Critical"
                value={thresholds.temp_min_critical}
                onChange={(val) => setThresholds({ ...thresholds, temp_min_critical: val })}
                helpText="Critical alert for dangerously low temp"
              />
              <ThresholdInput
                label="Max Warning"
                value={thresholds.temp_max_warning}
                onChange={(val) => setThresholds({ ...thresholds, temp_max_warning: val })}
                helpText="Alert when temp rises above this value"
              />
              <ThresholdInput
                label="Max Critical"
                value={thresholds.temp_max_critical}
                onChange={(val) => setThresholds({ ...thresholds, temp_max_critical: val })}
                helpText="Critical alert for dangerously high temp"
              />
            </div>
          </ThresholdSection>

          {/* Humidity Section */}
          <ThresholdSection title="Relative Humidity Thresholds (%)">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Min Warning"
                value={thresholds.rh_min_warning}
                onChange={(val) => setThresholds({ ...thresholds, rh_min_warning: val })}
                helpText="Alert when humidity drops below this"
              />
              <ThresholdInput
                label="Min Critical"
                value={thresholds.rh_min_critical}
                onChange={(val) => setThresholds({ ...thresholds, rh_min_critical: val })}
                helpText="Critical alert for very dry conditions"
              />
              <ThresholdInput
                label="Max Warning"
                value={thresholds.rh_max_warning}
                onChange={(val) => setThresholds({ ...thresholds, rh_max_warning: val })}
                helpText="Alert when humidity rises above this"
              />
              <ThresholdInput
                label="Max Critical"
                value={thresholds.rh_max_critical}
                onChange={(val) => setThresholds({ ...thresholds, rh_max_critical: val })}
                helpText="Critical alert for very humid conditions"
              />
            </div>
          </ThresholdSection>

          {/* MGI Section */}
          <ThresholdSection title="Mold Growth Index (MGI) Thresholds">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Max Warning"
                value={thresholds.mgi_max_warning}
                onChange={(val) => setThresholds({ ...thresholds, mgi_max_warning: val })}
                helpText="Alert when MGI exceeds this value"
              />
              <ThresholdInput
                label="Max Critical"
                value={thresholds.mgi_max_critical}
                onChange={(val) => setThresholds({ ...thresholds, mgi_max_critical: val })}
                helpText="Critical MGI level requiring action"
              />
            </div>
          </ThresholdSection>

          {/* Session Shift Detection */}
          <ThresholdSection title="Session Shift Detection">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Temp Shift Min (°F)"
                value={thresholds.temp_shift_min_per_session}
                onChange={(val) => setThresholds({ ...thresholds, temp_shift_min_per_session: val })}
                helpText="Alert if temp drops by this amount"
              />
              <ThresholdInput
                label="Temp Shift Max (°F)"
                value={thresholds.temp_shift_max_per_session}
                onChange={(val) => setThresholds({ ...thresholds, temp_shift_max_per_session: val })}
                helpText="Alert if temp rises by this amount"
              />
              <ThresholdInput
                label="RH Shift Min (%)"
                value={thresholds.rh_shift_min_per_session}
                onChange={(val) => setThresholds({ ...thresholds, rh_shift_min_per_session: val })}
                helpText="Alert if RH drops by this amount"
              />
              <ThresholdInput
                label="RH Shift Max (%)"
                value={thresholds.rh_shift_max_per_session}
                onChange={(val) => setThresholds({ ...thresholds, rh_shift_max_per_session: val })}
                helpText="Alert if RH rises by this amount"
              />
            </div>
          </ThresholdSection>

          {/* MGI Velocity */}
          <ThresholdSection title="MGI Velocity (Day-to-Day Change)">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Velocity Warning"
                value={thresholds.mgi_velocity_warning}
                onChange={(val) => setThresholds({ ...thresholds, mgi_velocity_warning: val })}
                helpText="Alert if MGI increases by this per day"
              />
              <ThresholdInput
                label="Velocity Critical"
                value={thresholds.mgi_velocity_critical}
                onChange={(val) => setThresholds({ ...thresholds, mgi_velocity_critical: val })}
                helpText="Critical daily MGI increase rate"
              />
            </div>
          </ThresholdSection>

          {/* MGI Speed Per Day */}
          <ThresholdSection title="MGI Speed Per Day">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Daily Warning"
                value={thresholds.mgi_speed_per_day_warning}
                onChange={(val) => setThresholds({ ...thresholds, mgi_speed_per_day_warning: val })}
                helpText="Warning threshold for daily MGI growth"
              />
              <ThresholdInput
                label="Daily Critical"
                value={thresholds.mgi_speed_per_day_critical}
                onChange={(val) => setThresholds({ ...thresholds, mgi_speed_per_day_critical: val })}
                helpText="Critical daily MGI growth rate"
              />
            </div>
          </ThresholdSection>

          {/* MGI Speed Per Week */}
          <ThresholdSection title="MGI Speed Per Week">
            <div className="grid grid-cols-2 gap-3">
              <ThresholdInput
                label="Weekly Warning"
                value={thresholds.mgi_speed_per_week_warning}
                onChange={(val) => setThresholds({ ...thresholds, mgi_speed_per_week_warning: val })}
                helpText="Warning threshold for weekly MGI growth"
              />
              <ThresholdInput
                label="Weekly Critical"
                value={thresholds.mgi_speed_per_week_critical}
                onChange={(val) => setThresholds({ ...thresholds, mgi_speed_per_week_critical: val })}
                helpText="Critical weekly MGI growth rate"
              />
            </div>
          </ThresholdSection>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <AlertTriangle className="w-4 h-4" />
            <span>Changes affect all devices using default thresholds</span>
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
              Save Default Thresholds
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

const ThresholdSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
    <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
    {children}
  </div>
);

const ThresholdInput = ({
  label,
  value,
  onChange,
  helpText,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  helpText?: string;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="number"
      step="0.1"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
    {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
  </div>
);

export default CompanyAlertThresholdsModal;
