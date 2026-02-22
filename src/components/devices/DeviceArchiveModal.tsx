import { useState } from 'react';
import { Archive, AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { DeviceWithStats } from '../../lib/types';

const ARCHIVE_REASONS = [
  'Test device',
  'Decommissioned / Out of service',
  'Security concern',
  'Duplicate entry',
  'Other',
] as const;

interface DeviceArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: DeviceWithStats | null;
  onConfirm: (reason: string) => Promise<void>;
  isArchiving: boolean;
}

const DeviceArchiveModal = ({
  isOpen,
  onClose,
  device,
  onConfirm,
  isArchiving,
}: DeviceArchiveModalProps) => {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customNotes, setCustomNotes] = useState('');

  const handleConfirm = async () => {
    const reason = selectedReason === 'Other' && customNotes.trim()
      ? `Other: ${customNotes.trim()}`
      : selectedReason;

    if (!reason) return;

    await onConfirm(reason);
    setSelectedReason('');
    setCustomNotes('');
  };

  const handleClose = () => {
    setSelectedReason('');
    setCustomNotes('');
    onClose();
  };

  if (!device) return null;

  const displayName = device.device_code || device.device_name || device.device_mac;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Archive Device" maxWidth="sm">
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {displayName}
            </p>
            {device.device_code && (
              <p className="text-xs text-amber-600 mt-0.5">MAC: {device.device_mac}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Reason for archiving
          </label>
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="">Select a reason...</option>
            {ARCHIVE_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
        </div>

        {selectedReason === 'Other' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes
            </label>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Describe why this device is being archived..."
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
            />
          </div>
        )}

        <p className="text-xs text-gray-500">
          This device will be hidden from the mapping pool. If it calls out again via MQTT, it will automatically reappear.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isArchiving}>
            Cancel
          </Button>
          <Button
            variant="warning"
            size="sm"
            icon={<Archive size={14} />}
            onClick={handleConfirm}
            isLoading={isArchiving}
            disabled={!selectedReason || (selectedReason === 'Other' && !customNotes.trim())}
          >
            Archive Device
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceArchiveModal;
