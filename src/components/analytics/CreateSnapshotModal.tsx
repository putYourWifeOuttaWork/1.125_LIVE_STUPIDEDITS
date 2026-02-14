import { useState } from 'react';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../common/Modal';
import Button from '../common/Button';

interface CreateSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, description: string) => Promise<void>;
}

export default function CreateSnapshotModal({
  isOpen,
  onClose,
  onConfirm,
}: CreateSnapshotModalProps) {
  const defaultName = `Snapshot - ${format(new Date(), 'MMM d, yyyy HH:mm')}`;
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onConfirm(name.trim(), description.trim());
      setName(`Snapshot - ${format(new Date(), 'MMM d, yyyy HH:mm')}`);
      setDescription('');
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = () => {
    setName(`Snapshot - ${format(new Date(), 'MMM d, yyyy HH:mm')}`);
    setDescription('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Camera className="w-5 h-5 text-primary-600" />
          Save Snapshot
        </div>
      }
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-sm text-gray-500">
          Capture a point-in-time copy of the current chart data and configuration.
        </p>

        <div>
          <label htmlFor="snapshot-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="snapshot-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            placeholder="e.g., Baseline pre-treatment"
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="snapshot-desc" className="block text-sm font-medium text-gray-700 mb-1">
            Description
            <span className="text-gray-400 font-normal ml-1">(optional)</span>
          </label>
          <textarea
            id="snapshot-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none"
            placeholder="Notes about conditions or purpose of this snapshot..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={saving}
            disabled={!name.trim()}
            icon={<Camera className="w-4 h-4" />}
          >
            Save Snapshot
          </Button>
        </div>
      </form>
    </Modal>
  );
}
