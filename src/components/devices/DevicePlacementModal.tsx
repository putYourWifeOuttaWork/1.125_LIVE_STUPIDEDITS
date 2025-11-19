import { useState } from 'react';
import { X, Clock, MapPin, FileText } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';

interface DevicePlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: {
    device_id: string;
    device_code: string;
    device_mac: string;
    device_name?: string;
    wake_schedule_cron?: string;
    notes?: string;
    zone_label?: string;
  };
  position: {
    x: number;
    y: number;
  };
  onSave: (settings: DevicePlacementSettings) => Promise<void>;
}

export interface DevicePlacementSettings {
  device_name?: string;
  wake_schedule_cron?: string;
  notes?: string;
  zone_label?: string;
  placement_height?: string;
  placement_notes?: string;
}

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 */1 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at noon', value: '0 12 * * *' },
  { label: 'Twice daily (6am, 6pm)', value: '0 6,18 * * *' },
];

const PLACEMENT_HEIGHTS = [
  'Floor mounted',
  'Low mounted (1-3ft)',
  'Medium mounted (3-6ft)',
  'High mounted (6-10ft)',
  'Ceiling mounted',
  'Wall mounted',
];

export default function DevicePlacementModal({
  isOpen,
  onClose,
  device,
  position,
  onSave,
}: DevicePlacementModalProps) {
  const [formData, setFormData] = useState<DevicePlacementSettings>({
    device_name: device.device_name || '',
    wake_schedule_cron: device.wake_schedule_cron || '',
    notes: device.notes || '',
    zone_label: device.zone_label || '',
    placement_height: 'Floor mounted',
    placement_notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCronExpression = (cron: string): boolean => {
    if (!cron) return true; // Allow empty
    const parts = cron.trim().split(/\s+/);
    return parts.length === 5;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    // Validate cron expression if provided
    if (formData.wake_schedule_cron && !validateCronExpression(formData.wake_schedule_cron)) {
      newErrors.wake_schedule_cron = 'Invalid cron expression format';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving device placement:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePresetClick = (preset: string) => {
    setFormData({ ...formData, wake_schedule_cron: preset });
    setErrors({ ...errors, wake_schedule_cron: '' });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Configure Device Placement</h2>
          <p className="text-sm text-gray-600 mt-1">
            {device.device_code} at position ({position.x}, {position.y})
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Device Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Device Name <span className="text-gray-400">(optional)</span>
          </label>
          <Input
            type="text"
            placeholder="e.g., North Corner, Zone A, Room 101"
            value={formData.device_name}
            onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Friendly name to identify this device
          </p>
        </div>

        {/* Wake Schedule */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Clock size={14} className="inline mr-1" />
            Wake Schedule (Cron Expression)
          </label>
          <Input
            type="text"
            placeholder="e.g., 0 */12 * * * (every 12 hours)"
            value={formData.wake_schedule_cron}
            onChange={(e) => {
              setFormData({ ...formData, wake_schedule_cron: e.target.value });
              setErrors({ ...errors, wake_schedule_cron: '' });
            }}
            error={errors.wake_schedule_cron}
          />
          <p className="text-xs text-gray-500 mt-1">
            Format: minute hour day month weekday (e.g., "0 */12 * * *" for every 12 hours)
          </p>

          {/* Quick Presets */}
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-600 mb-1">Quick presets:</p>
            <div className="flex flex-wrap gap-2">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePresetClick(preset.value)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Zone Label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <MapPin size={14} className="inline mr-1" />
            Zone Label
          </label>
          <Input
            type="text"
            placeholder="e.g., North Corner, Zone A, Room 101"
            value={formData.zone_label}
            onChange={(e) => setFormData({ ...formData, zone_label: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Human-readable zone identifier for spatial tracking
          </p>
        </div>

        {/* Placement Height */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Placement Height/Position
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            value={formData.placement_height}
            onChange={(e) => setFormData({ ...formData, placement_height: e.target.value })}
          >
            {PLACEMENT_HEIGHTS.map((height) => (
              <option key={height} value={height}>
                {height}
              </option>
            ))}
          </select>
        </div>

        {/* Placement Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <FileText size={14} className="inline mr-1" />
            Placement Notes
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            rows={3}
            placeholder="e.g., Near door, above workbench, next to window..."
            value={formData.placement_notes}
            onChange={(e) => setFormData({ ...formData, placement_notes: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Additional context about device placement
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            rows={2}
            placeholder="Add maintenance notes, installation details, or other information..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Internal notes about this device
          </p>
        </div>

        {/* Current Info */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="font-medium text-gray-900 mb-2">Current Device Information</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">MAC Address</span>
              <p className="font-mono text-gray-900">{device.device_mac}</p>
            </div>
            <div>
              <span className="text-gray-600">Device Code</span>
              <p className="font-mono text-gray-900">{device.device_code}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
