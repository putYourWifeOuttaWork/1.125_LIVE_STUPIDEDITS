import { useState } from 'react';
import { X, MapPin, Info } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { Device } from '../../lib/types';
import { usePilotPrograms } from '../../hooks/usePilotPrograms';
import { useSites } from '../../hooks/useSites';

interface DeviceMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  onSubmit: (mapping: {
    siteId: string;
    programId: string;
    deviceName?: string;
    wakeScheduleCron?: string;
    notes?: string;
  }) => Promise<void>;
}

const PRESET_SCHEDULES = [
  { label: 'Twice daily (8am, 4pm)', value: '0 8,16 * * *' },
  { label: 'Once daily (8am)', value: '0 8 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Custom', value: 'custom' },
];

const DeviceMappingModal = ({ isOpen, onClose, device, onSubmit }: DeviceMappingModalProps) => {
  const [deviceName, setDeviceName] = useState(device.device_name || '');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [schedulePreset, setSchedulePreset] = useState('0 8,16 * * *');
  const [customSchedule, setCustomSchedule] = useState('');
  const [notes, setNotes] = useState(device.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { programs, loading: programsLoading } = usePilotPrograms();
  const { sites, loading: sitesLoading } = useSites(selectedProgramId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSiteId || !selectedProgramId) {
      return;
    }

    setIsSubmitting(true);

    try {
      const wakeSchedule = schedulePreset === 'custom' ? customSchedule : schedulePreset;

      await onSubmit({
        siteId: selectedSiteId,
        programId: selectedProgramId,
        deviceName: deviceName || undefined,
        wakeScheduleCron: wakeSchedule || undefined,
        notes: notes || undefined,
      });

      onClose();
    } catch (error) {
      console.error('Error mapping device:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Map Device to Site">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Device-Reported Information</p>
              <div className="space-y-1 text-xs">
                <p><span className="font-medium">MAC Address:</span> {device.device_mac}</p>
                {device.device_reported_site_id && (
                  <p><span className="font-medium">Reported Site ID:</span> {device.device_reported_site_id}</p>
                )}
                {device.device_reported_location && (
                  <p><span className="font-medium">Reported Location:</span> {device.device_reported_location}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info size={18} className="text-green-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-medium mb-1">Automated Provisioning</p>
              <p className="text-xs">
                When you map this device, the system will automatically:
              </p>
              <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
                <li>Populate company and program information</li>
                <li>Calculate the next wake time based on the site schedule</li>
                <li>Send a welcome command with wake schedule to the device</li>
                <li>Activate the device for data collection</li>
              </ul>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-1">
            Device Name (Optional)
          </label>
          <Input
            id="deviceName"
            type="text"
            placeholder="e.g., Barn 1 - Camera A"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            Provide a friendly name to easily identify this device
          </p>
        </div>

        <div>
          <label htmlFor="program" className="block text-sm font-medium text-gray-700 mb-1">
            Assign to Program <span className="text-red-500">*</span>
          </label>
          <select
            id="program"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={selectedProgramId}
            onChange={(e) => {
              setSelectedProgramId(e.target.value);
              setSelectedSiteId('');
            }}
            required
            disabled={programsLoading}
          >
            <option value="">Select a program</option>
            {programs.map((program) => (
              <option key={program.program_id} value={program.program_id}>
                {program.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="site" className="block text-sm font-medium text-gray-700 mb-1">
            Assign to Site <span className="text-red-500">*</span>
          </label>
          <select
            id="site"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            required
            disabled={!selectedProgramId || sitesLoading}
          >
            <option value="">Select a site</option>
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {site.name}
              </option>
            ))}
          </select>
          {selectedProgramId && sites.length === 0 && !sitesLoading && (
            <p className="mt-1 text-xs text-yellow-600">
              No sites available for this program. Please create a site first.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="schedule" className="block text-sm font-medium text-gray-700 mb-1">
            Wake Schedule
          </label>
          <select
            id="schedule"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={schedulePreset}
            onChange={(e) => setSchedulePreset(e.target.value)}
          >
            {PRESET_SCHEDULES.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>

          {schedulePreset === 'custom' && (
            <div className="mt-2">
              <Input
                type="text"
                placeholder="e.g., 0 8,16 * * * (cron expression)"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter a valid cron expression (e.g., "0 8,16 * * *" for 8am and 4pm daily)
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Add any notes about device location, configuration, or mapping details"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
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
            icon={<MapPin size={16} />}
            isLoading={isSubmitting}
            disabled={!selectedSiteId || !selectedProgramId}
          >
            Map Device
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DeviceMappingModal;
