import { useState } from 'react';
import { X, Plus, AlertCircle, Check } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { DeviceService } from '../../services/deviceService';
import { toast } from 'react-toastify';

interface DeviceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DeviceRegistrationModal = ({ isOpen, onClose, onSuccess }: DeviceRegistrationModalProps) => {
  const [deviceMac, setDeviceMac] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [hardwareVersion, setHardwareVersion] = useState('ESP32-S3');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [macValidation, setMacValidation] = useState<{ valid: boolean; error?: string; formatted?: string }>({ valid: true });

  const handleMacChange = (value: string) => {
    setDeviceMac(value);
    if (value.trim()) {
      const validation = DeviceService.validateMacAddress(value);
      setMacValidation(validation);
    } else {
      setMacValidation({ valid: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!macValidation.valid || !macValidation.formatted) {
      toast.error('Please enter a valid MAC address');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await DeviceService.registerDevice({
        deviceMac: macValidation.formatted,
        deviceName: deviceName.trim() || undefined,
        hardwareVersion: hardwareVersion.trim() || undefined,
        firmwareVersion: firmwareVersion.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Device registered successfully!');
      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error registering device:', error);
      toast.error('Failed to register device');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setDeviceMac('');
    setDeviceName('');
    setHardwareVersion('ESP32-S3');
    setFirmwareVersion('');
    setNotes('');
    setMacValidation({ valid: true });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New Device">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Manual Device Registration</p>
              <p className="text-xs">
                Register a device before it connects to the system. The device will appear as "pending mapping" until assigned to a site.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="deviceMac" className="block text-sm font-medium text-gray-700 mb-1">
            Device MAC Address <span className="text-red-500">*</span>
          </label>
          <Input
            id="deviceMac"
            type="text"
            placeholder="e.g., B8:F8:62:F9:CF:B8 or B8F862F9CFB8"
            value={deviceMac}
            onChange={(e) => handleMacChange(e.target.value)}
            required
          />
          {macValidation.formatted && macValidation.valid && deviceMac && (
            <div className="mt-1 flex items-center text-xs text-green-600">
              <Check size={12} className="mr-1" />
              Will be saved as: {macValidation.formatted}
            </div>
          )}
          {!macValidation.valid && (
            <p className="mt-1 text-xs text-red-600">
              {macValidation.error}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Enter the device MAC address found on the device label or in the device firmware
          </p>
        </div>

        <div>
          <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-1">
            Device Name (Optional)
          </label>
          <Input
            id="deviceName"
            type="text"
            placeholder="e.g., ESP32-CAM-001"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            You can also set this later during device setup
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="hardwareVersion" className="block text-sm font-medium text-gray-700 mb-1">
              Hardware Version
            </label>
            <select
              id="hardwareVersion"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={hardwareVersion}
              onChange={(e) => setHardwareVersion(e.target.value)}
            >
              <option value="ESP32-S3">ESP32-S3</option>
              <option value="ESP32">ESP32</option>
              <option value="ESP32-C3">ESP32-C3</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="firmwareVersion" className="block text-sm font-medium text-gray-700 mb-1">
              Firmware Version (Optional)
            </label>
            <Input
              id="firmwareVersion"
              type="text"
              placeholder="e.g., v1.2.0"
              value={firmwareVersion}
              onChange={(e) => setFirmwareVersion(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Add any notes about this device"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClose();
              resetForm();
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={<Plus size={16} />}
            isLoading={isSubmitting}
            disabled={!macValidation.valid || !deviceMac.trim()}
          >
            Register Device
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DeviceRegistrationModal;
