import { useState, useEffect } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { Device } from '../../lib/types';
import { usePilotPrograms } from '../../hooks/usePilotPrograms';
import { useSites } from '../../hooks/useSites';
import { DeviceService } from '../../services/deviceService';

interface DeviceReassignModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  onSubmit: (mapping: {
    siteId: string;
    programId: string;
    deviceName?: string;
    wakeScheduleCron?: string;
    notes?: string;
    reason?: string;
  }) => Promise<void>;
}

const REASSIGN_REASONS = [
  'Site relocation',
  'Device replacement at original site',
  'Load balancing across sites',
  'Better coverage at new location',
  'Testing or evaluation',
  'Customer request',
  'Other (specify below)'
];

const DeviceReassignModal = ({ isOpen, onClose, device, onSubmit }: DeviceReassignModalProps) => {
  const [deviceName, setDeviceName] = useState(device.device_name || '');
  const [selectedProgramId, setSelectedProgramId] = useState(device.program_id || '');
  const [selectedSiteId, setSelectedSiteId] = useState(device.site_id || '');
  const [selectedSchedule, setSelectedSchedule] = useState(device.wake_schedule_cron || '0 8,16 * * *');
  const [customSchedule, setCustomSchedule] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState(device.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setDeviceName(device.device_name || '');
    setSelectedProgramId(device.program_id || '');
    setSelectedSiteId(device.site_id || '');
    setSelectedSchedule(device.wake_schedule_cron || '0 8,16 * * *');
    setCustomSchedule('');
    setSelectedReason('');
    setCustomReason('');
    setNotes(device.notes || '');
  }, [device.device_id]);

  const { programs, loading: programsLoading } = usePilotPrograms();
  const { sites, loading: sitesLoading } = useSites(selectedProgramId);

  const recommendedSchedules = DeviceService.getRecommendedWakeSchedule();

  const oldSiteName = device.sites?.name || 'Unknown Site';
  const oldProgramName = device.pilot_programs?.name || 'Unknown Program';
  const selectedProgram = programs.find(p => p.program_id === selectedProgramId);
  const selectedSite = sites.find(s => s.site_id === selectedSiteId);

  const isChangingSite = selectedSiteId !== device.site_id;
  const isChangingProgram = selectedProgramId !== device.program_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSiteId || !selectedProgramId) {
      return;
    }

    setIsSubmitting(true);

    try {
      const wakeSchedule = selectedSchedule === 'custom' ? customSchedule : selectedSchedule;
      const reason = selectedReason === 'Other (specify below)' ? customReason : selectedReason;

      await onSubmit({
        siteId: selectedSiteId,
        programId: selectedProgramId,
        deviceName: deviceName || undefined,
        wakeScheduleCron: wakeSchedule || undefined,
        notes: notes || undefined,
        reason: reason || undefined,
      });

      onClose();
    } catch (error) {
      console.error('Error reassigning device:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reassign Device" maxWidth="lg">
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-start">
            <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Device Reassignment</p>
              <p className="text-xs">
                Move this device to a different site or program. The device will continue operating normally -- this change is for tracking and organizational purposes only.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2 sm:mb-3">Current Assignment</p>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1">
            <p className="text-sm">
              <span className="text-gray-600">Device:</span>{' '}
              <span className="font-medium">{device.device_name || device.device_mac}</span>
            </p>
            {device.device_code && (
              <p className="text-sm">
                <span className="text-gray-600">Code:</span>{' '}
                <span className="font-medium font-mono">{device.device_code}</span>
              </p>
            )}
            <p className="text-sm">
              <span className="text-gray-600">Site:</span>{' '}
              <span className="font-medium">{oldSiteName}</span>
            </p>
            <p className="text-sm">
              <span className="text-gray-600">Program:</span>{' '}
              <span className="font-medium">{oldProgramName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center py-2 hidden sm:flex">
          <ArrowRight size={20} className="text-gray-400" />
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
            Reason for reassignment (optional but recommended)
          </label>
          <select
            id="reason"
            className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
          >
            <option value="">Select a reason...</option>
            {REASSIGN_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
          {selectedReason === 'Other (specify below)' && (
            <div className="mt-2">
              <Input
                type="text"
                placeholder="Describe the reason for reassignment"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="text-sm sm:text-base"
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="program" className="block text-sm font-medium text-gray-700 mb-2">
              New Program <span className="text-red-500">*</span>
            </label>
            <select
              id="program"
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              value={selectedProgramId}
              onChange={(e) => {
                setSelectedProgramId(e.target.value);
                if (e.target.value !== device.program_id) {
                  setSelectedSiteId('');
                }
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
            {isChangingProgram && selectedProgram && (
              <p className="mt-1 text-xs text-yellow-600">
                Changing to a different program. Site selection will be updated.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="site" className="block text-sm font-medium text-gray-700 mb-2">
              New Site <span className="text-red-500">*</span>
            </label>
            <select
              id="site"
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              required
              disabled={!selectedProgramId || sitesLoading}
            >
              <option value="">Select a site</option>
              {sites.map((site) => (
                <option key={site.site_id} value={site.site_id}>
                  {site.name} ({site.type}){site.site_code ? ` [${site.site_code}]` : ''}
                </option>
              ))}
            </select>
            {selectedProgramId && sites.length === 0 && !sitesLoading && (
              <p className="mt-1 text-xs text-yellow-600">
                No sites available for this program.
              </p>
            )}
            {isChangingSite && selectedSite && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                <p className="text-xs text-green-700">
                  Device will be reassigned to: <span className="font-medium">{selectedSite.name}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-2">
            Device Name (Optional)
          </label>
          <Input
            id="deviceName"
            type="text"
            placeholder={`e.g., ${selectedSite?.name || 'New Site'} - Camera 1`}
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="text-sm sm:text-base"
          />
        </div>

        <div>
          <label htmlFor="schedule" className="block text-sm font-medium text-gray-700 mb-2">
            Wake Schedule
          </label>
          <select
            id="schedule"
            className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            value={selectedSchedule}
            onChange={(e) => setSelectedSchedule(e.target.value)}
          >
            {recommendedSchedules.map((schedule) => (
              <option key={schedule.cron} value={schedule.cron}>
                {schedule.label}
              </option>
            ))}
            <option value="custom">Custom Schedule</option>
          </select>

          {selectedSchedule === 'custom' && (
            <div className="mt-2">
              <Input
                type="text"
                placeholder="e.g., 0 8,16 * * * (cron expression)"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                className="text-sm sm:text-base font-mono"
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
            Additional Notes (Optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
            placeholder="Add any notes about this reassignment"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            disabled={!selectedSiteId || !selectedProgramId || (!isChangingSite && !isChangingProgram)}
            className="w-full sm:w-auto order-1 sm:order-2"
          >
            Reassign Device
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DeviceReassignModal;
