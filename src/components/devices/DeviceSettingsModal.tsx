import { useState, useEffect } from 'react';
import { X, Save, Clock, Info } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { Device } from '../../lib/types';
import { DeviceService } from '../../services/deviceService';
import { toast } from 'react-toastify';

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  onSuccess: () => void;
}

const DeviceSettingsModal = ({ isOpen, onClose, device, onSuccess }: DeviceSettingsModalProps) => {
  const [deviceName, setDeviceName] = useState(device.device_name || '');
  const [selectedSchedule, setSelectedSchedule] = useState(device.wake_schedule_cron || '0 8,16 * * *');
  const [customSchedule, setCustomSchedule] = useState('');
  const [notes, setNotes] = useState(device.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recommendedSchedules = DeviceService.getRecommendedWakeSchedule();

  useEffect(() => {
    if (isOpen) {
      setDeviceName(device.device_name || '');
      setSelectedSchedule(device.wake_schedule_cron || '0 8,16 * * *');
      setCustomSchedule('');
      setNotes(device.notes || '');
    }
  }, [isOpen, device]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const wakeSchedule = selectedSchedule === 'custom' ? customSchedule : selectedSchedule;

      if (!wakeSchedule && selectedSchedule === 'custom') {
        toast.error('Please enter a custom schedule');
        setIsSubmitting(false);
        return;
      }

      const result = await DeviceService.updateDeviceSettings({
        deviceId: device.device_id,
        deviceName: deviceName || undefined,
        wakeScheduleCron: wakeSchedule !== device.wake_schedule_cron ? wakeSchedule : undefined,
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success('Device settings updated! Changes will apply at next wake.');
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || 'Failed to update device settings');
      }
    } catch (error) {
      console.error('Error updating device settings:', error);
      toast.error('Failed to update device settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Device Settings" maxWidth="lg">
      <div className="p-6 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Device Configuration</p>
              <p className="text-xs">
                Update device settings below. Schedule changes will be sent as a command to the device at its next wake cycle.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-2">
              Device Name
            </label>
            <Input
              id="deviceName"
              type="text"
              placeholder="e.g., Greenhouse #1 - Camera 1"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Friendly name to identify this device
            </p>
          </div>

          <div>
            <label htmlFor="deviceInfo" className="block text-sm font-medium text-gray-700 mb-2">
              Device Information
            </label>
            <div className="p-3 bg-gray-50 rounded-md space-y-2">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Code:</span> {device.device_code || device.device_id}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">MAC:</span> <span className="font-mono">{device.device_mac}</span>
              </p>
              {device.hardware_version && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Hardware:</span> {device.hardware_version}
                </p>
              )}
              {device.firmware_version && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Firmware:</span> {device.firmware_version}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock size={16} className="inline mr-1" />
              Wake Schedule
            </label>
            <div className="space-y-2">
              {recommendedSchedules.map((schedule) => (
                <label
                  key={schedule.cron}
                  className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedSchedule === schedule.cron
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="schedule"
                    value={schedule.cron}
                    checked={selectedSchedule === schedule.cron}
                    onChange={(e) => setSelectedSchedule(e.target.value)}
                    className="mt-1"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-medium text-sm text-gray-900">{schedule.label}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{schedule.description}</div>
                    <div className="text-xs font-mono text-gray-500 mt-1">{schedule.cron}</div>
                  </div>
                </label>
              ))}
              <label
                className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedSchedule === 'custom'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="schedule"
                  value="custom"
                  checked={selectedSchedule === 'custom'}
                  onChange={(e) => setSelectedSchedule(e.target.value)}
                  className="mt-1"
                />
                <div className="ml-3 flex-1">
                  <div className="font-medium text-sm text-gray-900">Custom Schedule</div>
                  <div className="text-xs text-gray-600 mt-0.5">Define your own cron expression</div>
                </div>
              </label>
            </div>

            {selectedSchedule === 'custom' && (
              <div className="mt-3">
                <Input
                  type="text"
                  placeholder="e.g., 0 8,16 * * * (cron expression)"
                  value={customSchedule}
                  onChange={(e) => setCustomSchedule(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter a valid cron expression (minute hour day month weekday)
                </p>
              </div>
            )}

            {selectedSchedule !== device.wake_schedule_cron && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                Schedule change will be sent as a command to the device at next wake
              </div>
            )}
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Add notes about device location, configuration, or special instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            icon={<Save size={16} />}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceSettingsModal;
