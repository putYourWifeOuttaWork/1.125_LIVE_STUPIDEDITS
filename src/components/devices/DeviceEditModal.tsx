import { useState, useMemo } from 'react';
import { X, Clock, Info } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { Device } from '../../lib/types';
import { DeviceService } from '../../services/deviceService';

interface DeviceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  onSubmit: (updates: DeviceUpdateData) => Promise<void>;
}

export interface DeviceUpdateData {
  device_name?: string;
  wake_schedule_cron?: string;
  notes?: string;
  zone_label?: string;
  x_position: number;  // REQUIRED (primary source after migration)
  y_position: number;  // REQUIRED (primary source after migration)
  placement_json?: {
    x?: number;  // Kept for backward compatibility during migration
    y?: number;  // Kept for backward compatibility during migration
    height?: string;
    notes?: string;
  };
}

const DeviceEditModal = ({ isOpen, onClose, device, onSubmit }: DeviceEditModalProps) => {
  // Handle coordinate initialization: prefer columns, fallback to placement_json
  const initialXPosition = device.x_position ?? device.placement_json?.x ?? 0;
  const initialYPosition = device.y_position ?? device.placement_json?.y ?? 0;

  const [formData, setFormData] = useState<DeviceUpdateData>({
    device_name: device.device_name || '',
    wake_schedule_cron: device.wake_schedule_cron || '',
    notes: device.notes || '',
    zone_label: device.zone_label || '',
    x_position: initialXPosition,
    y_position: initialYPosition,
    placement_json: device.placement_json || { height: '', notes: '' },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCronExpression = (cron: string): boolean => {
    if (!cron) return true; // Allow empty
    // Basic cron validation (5 parts: minute hour day month weekday)
    const parts = cron.trim().split(/\s+/);
    return parts.length === 5;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    // Validate cron expression if provided
    if (formData.wake_schedule_cron && !validateCronExpression(formData.wake_schedule_cron)) {
      newErrors.wake_schedule_cron = 'Invalid cron expression. Expected format: * * * * * (minute hour day month weekday)';
    }

    // Validate REQUIRED x,y coordinates
    if (formData.x_position === null || formData.x_position === undefined || formData.x_position < 0) {
      newErrors.x_position = 'X coordinate is required and must be >= 0';
    }
    if (formData.y_position === null || formData.y_position === undefined || formData.y_position < 0) {
      newErrors.y_position = 'Y coordinate is required and must be >= 0';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      // Sync coordinates to placement_json for backward compatibility
      // After migration, placement_json.x/y will be removed by the database
      const updatedData = {
        ...formData,
        placement_json: {
          ...formData.placement_json,
          x: formData.x_position,
          y: formData.y_position,
        },
      };

      await onSubmit(updatedData);
      onClose();
    } catch (error) {
      console.error('Error updating device:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof DeviceUpdateData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const cronPresets = [
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Every 12 hours', value: '0 */12 * * *' },
    { label: 'Daily at noon', value: '0 12 * * *' },
    { label: 'Daily at midnight', value: '0 0 * * *' },
    { label: 'Twice daily (6am, 6pm)', value: '0 6,18 * * *' },
  ];

  // Calculate next wake time if schedule is valid
  const nextWakeTime = useMemo(() => {
    if (!formData.wake_schedule_cron || !validateCronExpression(formData.wake_schedule_cron)) {
      return null;
    }
    return DeviceService.calculateNextWake(formData.wake_schedule_cron);
  }, [formData.wake_schedule_cron]);

  const isScheduleChanged = formData.wake_schedule_cron !== device.wake_schedule_cron;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Edit Device</h2>
            <p className="text-sm text-gray-500 mt-1">{device.device_mac}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Device Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Device Name
            </label>
            <Input
              type="text"
              value={formData.device_name}
              onChange={(e) => handleChange('device_name', e.target.value)}
              placeholder="Enter device name (optional)"
              className={errors.device_name ? 'border-error-500' : ''}
            />
            {errors.device_name && (
              <p className="text-sm text-error-600 mt-1">{errors.device_name}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Friendly name to identify this device
            </p>
          </div>

          {/* Wake Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wake Schedule (Cron Expression)
            </label>
            <Input
              type="text"
              value={formData.wake_schedule_cron}
              onChange={(e) => handleChange('wake_schedule_cron', e.target.value)}
              placeholder="0 */12 * * *"
              className={`font-mono ${errors.wake_schedule_cron ? 'border-error-500' : ''}`}
            />
            {errors.wake_schedule_cron && (
              <p className="text-sm text-error-600 mt-1">{errors.wake_schedule_cron}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Format: minute hour day month weekday (e.g., "0 */12 * * *" for every 12 hours)
            </p>

            {/* Cron Presets */}
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Quick presets:</p>
              <div className="grid grid-cols-2 gap-2">
                {cronPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleChange('wake_schedule_cron', preset.value)}
                    className="text-left px-3 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50 hover:border-primary-500 transition-colors"
                  >
                    <span className="block font-medium text-gray-900">{preset.label}</span>
                    <span className="block text-gray-500 font-mono mt-1">{preset.value}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Next Wake Time Display */}
            {nextWakeTime && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start">
                  <Clock size={16} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900">Next Wake Time</p>
                    <p className="text-blue-700 mt-1">{nextWakeTime.toLocaleString()}</p>
                    <p className="text-xs text-blue-600 mt-1">
                      {Math.round((nextWakeTime.getTime() - Date.now()) / (1000 * 60))} minutes from now
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Schedule Change Warning */}
            {isScheduleChanged && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <Info size={16} className="text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Schedule Change Detected</p>
                    <p className="mt-1 text-xs">
                      A command will be sent to the device at its next wake to update the schedule.
                      The new schedule will take effect on the wake cycle after that.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add maintenance notes, installation details, or other information..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Internal notes about this device
            </p>
          </div>

          {/* Zone and Placement Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Zone & Placement</h3>

            {/* Zone Label */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zone Label
              </label>
              <Input
                type="text"
                value={formData.zone_label}
                onChange={(e) => handleChange('zone_label', e.target.value)}
                placeholder="e.g., North Corner, Zone A, Room 101"
              />
              <p className="text-xs text-gray-500 mt-1">
                Human-readable zone identifier for spatial tracking
              </p>
            </div>

            {/* X,Y Coordinates - REQUIRED */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  X Coordinate <span className="text-error-600">*</span>
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.x_position}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setFormData(prev => ({ ...prev, x_position: val }));
                    // Clear error
                    if (errors.x_position) {
                      setErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.x_position;
                        return newErrors;
                      });
                    }
                  }}
                  placeholder="10.5"
                  required
                  className={errors.x_position ? 'border-error-500' : ''}
                />
                {errors.x_position && (
                  <p className="text-sm text-error-600 mt-1">{errors.x_position}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Device position on site map (feet)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Y Coordinate <span className="text-error-600">*</span>
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.y_position}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setFormData(prev => ({ ...prev, y_position: val }));
                    // Clear error
                    if (errors.y_position) {
                      setErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.y_position;
                        return newErrors;
                      });
                    }
                  }}
                  placeholder="25.3"
                  required
                  className={errors.y_position ? 'border-error-500' : ''}
                />
                {errors.y_position && (
                  <p className="text-sm text-error-600 mt-1">{errors.y_position}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Device position on site map (feet)
                </p>
              </div>
            </div>

            {/* Placement Height */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Placement Height/Position
              </label>
              <select
                value={formData.placement_json?.height || ''}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    placement_json: { ...prev.placement_json, height: e.target.value }
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select height...</option>
                <option value="floor">Floor mounted</option>
                <option value="wall_low">Wall mounted (low)</option>
                <option value="wall_mid">Wall mounted (mid)</option>
                <option value="wall_high">Wall mounted (high)</option>
                <option value="ceiling">Ceiling mounted</option>
                <option value="shelf">On shelf</option>
                <option value="desk">On desk/table</option>
              </select>
            </div>

            {/* Placement Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Placement Notes
              </label>
              <textarea
                value={formData.placement_json?.notes || ''}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    placement_json: { ...prev.placement_json, notes: e.target.value }
                  }));
                }}
                placeholder="e.g., Near door, above workbench, next to window..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Additional context about device placement
              </p>
            </div>
          </div>

          {/* Current Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <h3 className="font-medium text-gray-900 mb-3">Current Device Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-gray-500">MAC Address</p>
                <p className="font-mono text-xs text-gray-900">{device.device_mac}</p>
              </div>
              <div>
                <p className="text-gray-500">Device Code</p>
                <p className="font-medium text-gray-900">{device.device_code || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-gray-500">Hardware Version</p>
                <p className="text-gray-900">{device.hardware_version}</p>
              </div>
              {device.firmware_version && (
                <div>
                  <p className="text-gray-500">Firmware Version</p>
                  <p className="text-gray-900">{device.firmware_version}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default DeviceEditModal;
