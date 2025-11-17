import { DeviceEventCategory } from '../../lib/types';
import { Activity, Camera, Battery, MapPin, Power, Wifi, Settings, AlertCircle, Upload, HardDrive } from 'lucide-react';

interface EventCategoryBadgeProps {
  category: DeviceEventCategory;
  size?: 'sm' | 'md';
}

const categoryConfig: Record<DeviceEventCategory, { label: string; color: string; icon: typeof Activity }> = {
  WakeSession: { label: 'Wake Session', color: 'bg-blue-100 text-blue-800', icon: Activity },
  ImageCapture: { label: 'Image Capture', color: 'bg-purple-100 text-purple-800', icon: Camera },
  EnvironmentalReading: { label: 'Environmental', color: 'bg-green-100 text-green-800', icon: Activity },
  BatteryStatus: { label: 'Battery', color: 'bg-yellow-100 text-yellow-800', icon: Battery },
  Assignment: { label: 'Assignment', color: 'bg-primary-100 text-primary-800', icon: MapPin },
  Unassignment: { label: 'Unassignment', color: 'bg-gray-100 text-gray-800', icon: MapPin },
  Activation: { label: 'Activation', color: 'bg-success-100 text-success-800', icon: Power },
  Deactivation: { label: 'Deactivation', color: 'bg-error-100 text-error-800', icon: Power },
  ChunkTransmission: { label: 'Transmission', color: 'bg-indigo-100 text-indigo-800', icon: Upload },
  OfflineCapture: { label: 'Offline Capture', color: 'bg-orange-100 text-orange-800', icon: HardDrive },
  WiFiConnectivity: { label: 'WiFi', color: 'bg-cyan-100 text-cyan-800', icon: Wifi },
  MQTTStatus: { label: 'MQTT', color: 'bg-teal-100 text-teal-800', icon: Wifi },
  ProvisioningStep: { label: 'Provisioning', color: 'bg-violet-100 text-violet-800', icon: Settings },
  FirmwareUpdate: { label: 'Firmware', color: 'bg-pink-100 text-pink-800', icon: Settings },
  ConfigurationChange: { label: 'Configuration', color: 'bg-slate-100 text-slate-800', icon: Settings },
  MaintenanceActivity: { label: 'Maintenance', color: 'bg-amber-100 text-amber-800', icon: Settings },
  ErrorEvent: { label: 'Error', color: 'bg-error-100 text-error-800', icon: AlertCircle },
  Alert: { label: 'Alert', color: 'bg-red-100 text-red-800', icon: AlertCircle },
  Command: { label: 'Command', color: 'bg-blue-100 text-blue-800', icon: Settings }
};

const EventCategoryBadge = ({ category, size = 'md' }: EventCategoryBadgeProps) => {
  const config = categoryConfig[category];

  if (!config) {
    console.warn('Unknown event category:', category);
    return (
      <span className="inline-flex items-center rounded-full font-medium bg-gray-100 text-gray-800 text-sm px-2.5 py-1">
        {category || 'Unknown'}
      </span>
    );
  }

  const Icon = config.icon;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-2.5 py-1';

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.color} ${sizeClasses}`}>
      <Icon size={iconSize} className="mr-1" />
      {config.label}
    </span>
  );
};

export default EventCategoryBadge;
