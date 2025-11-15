import { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader, MapPin, Clock, Info } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { Device } from '../../lib/types';
import { usePilotPrograms } from '../../hooks/usePilotPrograms';
import { useSites } from '../../hooks/useSites';
import { DeviceService } from '../../services/deviceService';
import { toast } from 'react-toastify';

interface DeviceSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  onComplete: (mapping: {
    siteId: string;
    programId: string;
    deviceName?: string;
    wakeScheduleCron?: string;
    notes?: string;
  }) => Promise<void>;
}

type WizardStep = 'program' | 'site' | 'naming' | 'schedule' | 'review';

const DeviceSetupWizard = ({ isOpen, onClose, device, onComplete }: DeviceSetupWizardProps) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('program');
  const [deviceName, setDeviceName] = useState(device.device_name || '');
  const [selectedProgramId, setSelectedProgramId] = useState(device.program_id || '');
  const [selectedSiteId, setSelectedSiteId] = useState(device.site_id || '');
  const [selectedSchedule, setSelectedSchedule] = useState(device.wake_schedule_cron || '0 8,16 * * *');
  const [customSchedule, setCustomSchedule] = useState('');
  const [notes, setNotes] = useState(device.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Test connection removed - devices only wake on schedule, so immediate ping isn't useful

  const { programs, loading: programsLoading } = usePilotPrograms();
  const { sites, loading: sitesLoading } = useSites(selectedProgramId);

  const recommendedSchedules = DeviceService.getRecommendedWakeSchedule();

  const steps: Array<{ id: WizardStep; label: string; description: string }> = [
    { id: 'program', label: 'Program', description: 'Select pilot program' },
    { id: 'site', label: 'Site', description: 'Choose deployment location' },
    { id: 'naming', label: 'Identity', description: 'Name and configure' },
    { id: 'schedule', label: 'Schedule', description: 'Set wake times' },
    { id: 'review', label: 'Review', description: 'Confirm setup' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  const selectedProgram = programs.find(p => p.program_id === selectedProgramId);
  const selectedSite = sites.find(s => s.site_id === selectedSiteId);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'program':
        return !!selectedProgramId;
      case 'site':
        return !!selectedSiteId;
      case 'naming':
        return true;
      case 'schedule':
        return !!selectedSchedule || !!customSchedule;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!canProceed()) return;

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  // Test connection removed - not applicable for scheduled-wake IoT devices

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const wakeSchedule = selectedSchedule === 'custom' ? customSchedule : selectedSchedule;

      await onComplete({
        siteId: selectedSiteId,
        programId: selectedProgramId,
        deviceName: deviceName || undefined,
        wakeScheduleCron: wakeSchedule || undefined,
        notes: notes || undefined,
      });

      toast.success('Device setup completed successfully!');
      onClose();
    } catch (error) {
      console.error('Error completing setup:', error);
      toast.error('Failed to complete device setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-6 sm:mb-8 px-2 sm:px-4">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base font-semibold transition-colors ${
                index < currentStepIndex
                  ? 'bg-green-500 text-white'
                  : index === currentStepIndex
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {index < currentStepIndex ? (
                <Check size={16} className="sm:w-5 sm:h-5" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <div className="mt-1 sm:mt-2 text-center">
              <div className={`text-xs font-medium ${
                index <= currentStepIndex ? 'text-gray-900' : 'text-gray-500'
              }`}>
                {step.label}
              </div>
              <div className="text-xs text-gray-500 hidden md:block">{step.description}</div>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1 sm:mx-2 mt-[-2rem] sm:mt-[-2.5rem] ${
              index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderProgramStep = () => (
    <div className="space-y-3 sm:space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
        <div className="flex items-start">
          <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Select Pilot Program</p>
            <p className="text-xs">Choose the pilot program this device will be assigned to. This determines data access and reporting scope.</p>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="program" className="block text-sm font-medium text-gray-700 mb-2">
          Pilot Program <span className="text-red-500">*</span>
        </label>
        <select
          id="program"
          className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
          value={selectedProgramId}
          onChange={(e) => {
            setSelectedProgramId(e.target.value);
            setSelectedSiteId('');
          }}
          disabled={programsLoading}
        >
          <option value="">Select a program</option>
          {programs.map((program) => (
            <option key={program.program_id} value={program.program_id}>
              {program.name}
            </option>
          ))}
        </select>
        {selectedProgram && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Status:</span> {selectedProgram.status}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {selectedProgram.start_date && selectedProgram.end_date && (
                <>Duration: {new Date(selectedProgram.start_date).toLocaleDateString()} - {new Date(selectedProgram.end_date).toLocaleDateString()}</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSiteStep = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <MapPin size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Select Deployment Site</p>
            <p className="text-xs">Choose where this device will be physically located. The device will capture observations for this site.</p>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="site" className="block text-sm font-medium text-gray-700 mb-2">
          Deployment Site <span className="text-red-500">*</span>
        </label>
        <select
          id="site"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          disabled={!selectedProgramId || sitesLoading}
        >
          <option value="">Select a site</option>
          {sites.map((site) => (
            <option key={site.site_id} value={site.site_id}>
              {site.name} ({site.type})
            </option>
          ))}
        </select>
        {selectedProgramId && sites.length === 0 && !sitesLoading && (
          <p className="mt-2 text-sm text-yellow-600">
            No sites available for this program. Please create a site first.
          </p>
        )}
        {selectedSite && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Type:</span> {selectedSite.type}
            </p>
            {selectedSite.device_count !== undefined && (
              <p className="text-sm text-gray-600 mt-1">
                Existing devices: {selectedSite.device_count}
              </p>
            )}
          </div>
        )}
      </div>

      {device.device_reported_site_id && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            <span className="font-medium">Device Reported Site ID:</span> {device.device_reported_site_id}
          </p>
          {device.device_reported_location && (
            <p className="text-xs text-yellow-800 mt-1">
              <span className="font-medium">Device Reported Location:</span> {device.device_reported_location}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderNamingStep = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Device Identity</p>
            <p className="text-xs">Give your device a memorable name and add any relevant notes for future reference.</p>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-2">
          Device Name (Optional but Recommended)
        </label>
        <Input
          id="deviceName"
          type="text"
          placeholder={`e.g., ${selectedSite?.name || 'Site'} - Camera 1`}
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          Provide a friendly name to easily identify this device
        </p>
      </div>

      <div>
        <label htmlFor="deviceInfo" className="block text-sm font-medium text-gray-700 mb-2">
          Device Information
        </label>
        <div className="p-3 bg-gray-50 rounded-md space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">MAC Address:</span> <span className="font-mono">{device.device_mac}</span>
          </p>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Hardware:</span> {device.hardware_version}
          </p>
          {device.firmware_version && (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Firmware:</span> {device.firmware_version}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Add any notes about device location, configuration, or special instructions"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </div>
  );

  const renderScheduleStep = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Clock size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Wake Schedule</p>
            <p className="text-xs">Configure when the device should wake up to capture images. Select a preset schedule or create a custom cron expression.</p>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="schedule" className="block text-sm font-medium text-gray-700 mb-2">
          Select Schedule
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
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const setupProgress = DeviceService.calculateSetupProgress({
      ...device,
      device_name: deviceName || device.device_name,
      program_id: selectedProgramId || device.program_id,
      site_id: selectedSiteId || device.site_id,
      wake_schedule_cron: (selectedSchedule === 'custom' ? customSchedule : selectedSchedule) || device.wake_schedule_cron,
    } as Device);

    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <Check size={18} className="text-green-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-medium mb-1">Setup Complete</p>
              <p className="text-xs">Review your configuration below and click "Complete Setup" to activate the device.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs font-medium text-gray-500 uppercase">Device Information</p>
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-900">
                <span className="font-medium">Name:</span> {deviceName || device.device_mac}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">MAC:</span> <span className="font-mono">{device.device_mac}</span>
              </p>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs font-medium text-gray-500 uppercase">Assignment</p>
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-900">
                <span className="font-medium">Program:</span> {selectedProgram?.name}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Site:</span> {selectedSite?.name}
              </p>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs font-medium text-gray-500 uppercase">Schedule</p>
            <div className="mt-2">
              <p className="text-sm text-gray-900 font-mono">
                {selectedSchedule === 'custom' ? customSchedule : selectedSchedule}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {recommendedSchedules.find(s => s.cron === selectedSchedule)?.label || 'Custom schedule'}
              </p>
            </div>
          </div>

          {notes && (
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-xs font-medium text-gray-500 uppercase">Notes</p>
              <p className="text-sm text-gray-700 mt-2">{notes}</p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Setup Complete</p>
              <p className="text-blue-700">
                Review your configuration below and click "Complete Setup" to activate the device.
                {device.wake_schedule_cron !== selectedSchedule && (
                  <span className="block mt-1 font-medium">
                    ⚠️ Schedule changes will be sent to the device at its next wake.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'program':
        return renderProgramStep();
      case 'site':
        return renderSiteStep();
      case 'naming':
        return renderNamingStep();
      case 'schedule':
        return renderScheduleStep();
      case 'review':
        return renderReviewStep();
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Device Setup Wizard" maxWidth="lg">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {renderStepIndicator()}

        <div className="min-h-[300px] sm:min-h-[400px]">
          {renderCurrentStep()}
        </div>

        <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={currentStepIndex === 0 ? onClose : handleBack}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            {currentStepIndex === 0 ? 'Cancel' : 'Back'}
          </Button>

          {currentStep === 'review' ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              icon={<Check size={16} />}
              disabled={!canProceed()}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
              Complete Setup
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleNext}
              disabled={!canProceed()}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DeviceSetupWizard;
