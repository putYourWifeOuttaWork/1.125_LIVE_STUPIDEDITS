import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Device } from '../../lib/types';

interface DeviceUnassignModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  onConfirm: (reason?: string) => Promise<void>;
}

const UNASSIGN_REASONS = [
  'Device repair/maintenance required',
  'Site closure or relocation',
  'Device replacement',
  'Testing or calibration',
  'Customer request',
  'Performance issues',
  'Other (specify below)'
];

const DeviceUnassignModal = ({ isOpen, onClose, device, onConfirm }: DeviceUnassignModalProps) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const reason = selectedReason === 'Other (specify below)'
        ? customReason
        : selectedReason;

      await onConfirm(reason || undefined);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error unassigning device:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedReason('');
    setCustomReason('');
  };

  const siteName = device.sites?.name || 'Unknown Site';
  const programName = device.pilot_programs?.name || 'Unknown Program';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unassign Device">
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle size={20} className="text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-2">Warning: This will unassign the device</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Device will be removed from {siteName}</li>
                <li>Device will be deactivated automatically</li>
                <li>Device will return to "pending mapping" status</li>
                <li>You can reassign it to another site later</li>
              </ul>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-700 mb-3">
            <span className="font-medium">Current Assignment:</span>
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1">
            <p className="text-sm">
              <span className="text-gray-600">Device:</span>{' '}
              <span className="font-medium">{device.device_name || device.device_mac}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-600">Site:</span>{' '}
              <span className="font-medium">{siteName}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-600">Program:</span>{' '}
              <span className="font-medium">{programName}</span>
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason for unassignment (optional)
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
          >
            <option value="">Select a reason...</option>
            {UNASSIGN_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        {selectedReason === 'Other (specify below)' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Specify reason
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Describe the reason for unassigning this device"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
            />
          </div>
        )}

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
            type="button"
            variant="danger"
            onClick={handleConfirm}
            isLoading={isSubmitting}
          >
            Unassign Device
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceUnassignModal;
