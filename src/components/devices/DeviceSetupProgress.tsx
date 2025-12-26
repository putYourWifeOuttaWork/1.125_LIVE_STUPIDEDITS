import { Check, Circle, AlertCircle } from 'lucide-react';
import { Device } from '../../lib/types';
import { DeviceService } from '../../services/deviceService';

interface DeviceSetupProgressProps {
  device: Device;
  showDetails?: boolean;
}

const DeviceSetupProgress = ({ device, showDetails = true }: DeviceSetupProgressProps) => {
  const { percentage, steps } = DeviceService.calculateSetupProgress(device);

  const getStatusIcon = (completed: boolean, required: boolean) => {
    if (completed) {
      return <Check size={16} className="text-green-500" />;
    }
    if (required) {
      return <AlertCircle size={16} className="text-yellow-500" />;
    }
    return <Circle size={16} className="text-gray-300" />;
  };

  const getProgressColor = () => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Setup Progress</span>
          <span className="text-sm font-semibold text-gray-900">{percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getProgressColor()}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {showDetails && (
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-2 rounded-md ${
                step.completed ? 'bg-green-50' : step.required ? 'bg-yellow-50' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center">
                {getStatusIcon(step.completed, step.required)}
                <span
                  className={`ml-2 text-sm ${
                    step.completed
                      ? 'text-gray-900 font-medium'
                      : step.required
                      ? 'text-gray-700'
                      : 'text-gray-500'
                  }`}
                >
                  {step.label}
                  {step.required && !step.completed && (
                    <span className="text-xs text-yellow-600 ml-1">(required)</span>
                  )}
                </span>
              </div>
              {step.completed && (
                <span className="text-xs text-green-600">✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {percentage < 100 && (
        <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-md p-2">
          Complete all required steps to activate this device.
        </div>
      )}

      {percentage === 100 && !device.is_active && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-md p-2">
          Setup complete! Device is ready to be activated.
        </div>
      )}

      {percentage === 100 && device.is_active && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-md p-2 flex items-center">
          <Check size={12} className="mr-1" />
          Device is fully configured and active.
        </div>
      )}
    </div>
  );
};

export default DeviceSetupProgress;
