import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Wifi,
  Battery,
  Thermometer,
  Droplets,
  AlertCircle,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  Settings,
  Clock,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import { format } from 'date-fns';
import DeviceStatusBadge from './DeviceStatusBadge';

interface WakePayload {
  payload_id: string;
  wake_window_index: number;
  captured_at: string;
  payload_status: string;
  temperature?: number;
  humidity?: number;
  battery_voltage?: number;
  wifi_rssi?: number;
  image_id?: string;
  overage_flag?: boolean;
  resent_received_at?: string;
}

interface DeviceImage {
  image_id: string;
  captured_at: string;
  storage_path?: string;
  image_url?: string;
  image_status?: string;
  wake_window_index?: number;
}

interface DeviceSessionData {
  device_id: string;
  device_code: string;
  device_name?: string;
  hardware_version?: string;
  firmware_version?: string;
  wake_schedule_cron?: string;
  battery_voltage?: number;
  battery_health_percent?: number;
  wifi_ssid?: string;
  assigned_at: string;
  is_primary?: boolean;
  expected_wakes_in_session: number;
  actual_wakes: number;
  completed_wakes: number;
  failed_wakes: number;
  extra_wakes: number;
  wake_payloads: WakePayload[];
  images: DeviceImage[];
  added_mid_session?: boolean;
}

interface DeviceSessionCardProps {
  device: DeviceSessionData;
  canEdit?: boolean;
  onEdit?: (deviceId: string) => void;
}

const DeviceSessionCard = ({ device, canEdit = false, onEdit }: DeviceSessionCardProps) => {
  const [showWakes, setShowWakes] = useState(true);
  const [showImages, setShowImages] = useState(false);

  const successRate = device.expected_wakes_in_session > 0
    ? Math.min(Math.round((device.completed_wakes / device.expected_wakes_in_session) * 100), 100)
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
      case 'pending':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'text-green-700';
      case 'failed':
        return 'text-red-700';
      case 'pending':
        return 'text-yellow-700';
      default:
        return 'text-gray-700';
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {device.device_name || device.device_code}
              </h3>
              {device.is_primary && (
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                  Primary
                </span>
              )}
              {device.added_mid_session && (
                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  Added Mid-Session
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
              <span>{device.device_code}</span>
              {device.hardware_version && (
                <span className="flex items-center">
                  {device.hardware_version}
                </span>
              )}
              {device.firmware_version && (
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  v{device.firmware_version}
                </span>
              )}
            </div>
          </div>

          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit?.(device.device_id)}
              icon={<Settings size={16} />}
            >
              Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{device.expected_wakes_in_session}</div>
            <div className="text-xs text-gray-600">Expected</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{device.actual_wakes}</div>
            <div className="text-xs text-gray-600">Actual</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{device.completed_wakes}</div>
            <div className="text-xs text-gray-600">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{device.failed_wakes}</div>
            <div className="text-xs text-gray-600">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{device.extra_wakes}</div>
            <div className="text-xs text-gray-600">Extra</div>
          </div>
        </div>

        {/* Success Rate */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Success Rate</span>
            <span className="text-sm font-bold text-gray-900">{successRate}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                successRate >= 90 ? 'bg-green-600' : successRate >= 70 ? 'bg-yellow-600' : 'bg-red-600'
              }`}
              style={{ width: `${successRate}%` }}
            />
          </div>
        </div>

        {/* Device Status Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
          {device.battery_voltage && (
            <div className="flex items-center space-x-2">
              <Battery className={`h-4 w-4 ${
                device.battery_health_percent && device.battery_health_percent > 70 ? 'text-green-500' :
                device.battery_health_percent && device.battery_health_percent > 30 ? 'text-yellow-500' :
                'text-red-500'
              }`} />
              <span className="text-gray-700">
                {device.battery_voltage}V ({device.battery_health_percent || 0}%)
              </span>
            </div>
          )}
          {device.wifi_ssid && (
            <div className="flex items-center space-x-2">
              <Wifi className="h-4 w-4 text-blue-500" />
              <span className="text-gray-700">{device.wifi_ssid}</span>
            </div>
          )}
          {device.wake_schedule_cron && (
            <div className="flex items-center space-x-2 col-span-2">
              <Clock className="h-4 w-4 text-purple-500" />
              <span className="text-gray-700 font-mono text-xs">{device.wake_schedule_cron}</span>
            </div>
          )}
        </div>

        {device.added_mid_session && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-yellow-800 font-medium">Device Added Mid-Session</p>
                <p className="text-yellow-700 mt-1">
                  This device was added at {format(new Date(device.assigned_at), 'h:mm a')}.
                  Expected wake count reflects only wakes after this time.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Wake Payloads Section */}
        <div className="border-t pt-4">
          <button
            onClick={() => setShowWakes(!showWakes)}
            className="flex items-center justify-between w-full mb-3 hover:bg-gray-50 p-2 rounded transition-colors"
          >
            <h4 className="text-sm font-semibold text-gray-900">
              Wake Payloads ({device.wake_payloads.length})
            </h4>
            {showWakes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {showWakes && (
            <div className="space-y-3">
              {device.wake_payloads.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No wake payloads recorded</p>
              ) : (
                device.wake_payloads.map((wake) => (
                  <div
                    key={wake.payload_id}
                    className={`border rounded-lg p-3 ${getStatusColor(wake.payload_status)}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h5 className={`font-semibold text-sm ${getStatusTextColor(wake.payload_status)}`}>
                          Wake #{wake.wake_window_index}
                        </h5>
                        <p className="text-xs text-gray-600 mt-1">
                          {format(new Date(wake.captured_at), 'MMM dd, yyyy HH:mm:ss')}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {wake.payload_status === 'complete' && <CheckCircle className="h-4 w-4 text-green-600" />}
                        {wake.payload_status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
                        {wake.image_id && <ImageIcon className="h-4 w-4 text-purple-600" />}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {wake.temperature !== null && wake.temperature !== undefined && (
                        <div className="flex items-center space-x-1">
                          <Thermometer className="h-3 w-3 text-red-500" />
                          <span>{wake.temperature.toFixed(2)}°C</span>
                        </div>
                      )}
                      {wake.humidity !== null && wake.humidity !== undefined && (
                        <div className="flex items-center space-x-1">
                          <Droplets className="h-3 w-3 text-blue-500" />
                          <span>{wake.humidity.toFixed(2)}%</span>
                        </div>
                      )}
                      {wake.battery_voltage !== null && wake.battery_voltage !== undefined && (
                        <div className="flex items-center space-x-1">
                          <Battery className="h-3 w-3 text-green-500" />
                          <span>{wake.battery_voltage.toFixed(2)}V</span>
                        </div>
                      )}
                      {wake.wifi_rssi !== null && wake.wifi_rssi !== undefined && (
                        <div className="flex items-center space-x-1">
                          <Wifi className="h-3 w-3 text-blue-500" />
                          <span>{wake.wifi_rssi} dBm</span>
                        </div>
                      )}
                    </div>

                    {wake.overage_flag && (
                      <div className="mt-2 pt-2 border-t border-yellow-300">
                        <div className="flex items-center text-xs text-yellow-700">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          This wake was outside the expected schedule
                        </div>
                      </div>
                    )}

                    {wake.resent_received_at && (
                      <div className="mt-2 pt-2 border-t border-blue-300">
                        <div className="text-xs text-blue-700">
                          Retried at {format(new Date(wake.resent_received_at), 'MMM dd, HH:mm:ss')}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Images Section */}
        {device.images.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <button
              onClick={() => setShowImages(!showImages)}
              className="flex items-center justify-between w-full mb-3 hover:bg-gray-50 p-2 rounded transition-colors"
            >
              <h4 className="text-sm font-semibold text-gray-900">
                Images ({device.images.length})
              </h4>
              {showImages ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {showImages && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {device.images.map((image) => (
                  <div key={image.image_id} className="relative group">
                    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                      {image.image_url ? (
                        <img
                          src={image.image_url}
                          alt={`Wake ${image.wake_window_index}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 text-center">
                      Wake #{image.wake_window_index}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DeviceSessionCard;
