import { Camera, MapPin, MoreVertical, Eye, Edit, Power, PowerOff } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import { DeviceWithStats } from '../../lib/types';
import { useState, useRef, useEffect } from 'react';
import DeviceStatusBadge from './DeviceStatusBadge';
import DeviceBatteryIndicator from './DeviceBatteryIndicator';

interface DeviceCardProps {
  device: DeviceWithStats;
  onView: (device: DeviceWithStats) => void;
  onEdit?: (device: DeviceWithStats) => void;
  onActivate?: (device: DeviceWithStats) => void;
  onDeactivate?: (device: DeviceWithStats) => void;
  canEdit?: boolean;
  testId?: string;
}

const DeviceCard = ({
  device,
  onView,
  onEdit,
  onActivate,
  onDeactivate,
  canEdit = true,
  testId
}: DeviceCardProps) => {
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActionsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const siteName = device.sites?.name || 'Unassigned';
  const programName = device.pilot_programs?.name || 'Unassigned';

  return (
    <div className="relative" ref={dropdownRef}>
      <Card
        hoverable
        onClick={() => onView(device)}
        className="h-full"
        testId={testId || `device-card-${device.device_id}`}
      >
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate" title={device.device_name || device.device_code || device.device_mac}>
                {device.device_name || device.device_code || device.device_mac}
              </h3>
              {device.device_code && (
                <p className="text-xs text-gray-600 font-mono mt-0.5">{device.device_code}</p>
              )}
              {device.device_name && device.device_mac && (
                <p className="text-xs text-gray-500 font-mono mt-0.5">{device.device_mac}</p>
              )}
            </div>
            <DeviceStatusBadge
              lastSeenAt={device.last_seen_at}
              isActive={device.is_active}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center text-sm text-gray-600">
            <MapPin size={14} className="mr-2 text-gray-400 flex-shrink-0" />
            <div className="truncate">
              <span className="font-medium">{siteName}</span>
              <span className="text-gray-400 mx-1">•</span>
              <span>{programName}</span>
            </div>
          </div>

          {device.battery_health_percent !== null && (
            <DeviceBatteryIndicator
              batteryHealthPercent={device.battery_health_percent}
              size="sm"
            />
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Camera size={14} className="text-gray-400" />
              <span>{device.total_images || 0} images</span>
              {device.pending_images && device.pending_images > 0 && (
                <span className="ml-1 text-yellow-600">
                  ({device.pending_images} pending)
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={<MoreVertical size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                setShowActionsDropdown(!showActionsDropdown);
              }}
              testId={`device-actions-${device.device_id}`}
            >
              Actions
            </Button>
          </div>
        </CardContent>
      </Card>

      {showActionsDropdown && (
        <div className="absolute right-0 mt-1 w-40 bg-white rounded-md shadow-lg z-10 border border-gray-200 py-1 animate-fade-in">
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              onView(device);
              setShowActionsDropdown(false);
            }}
          >
            <Eye size={14} className="mr-2" />
            View Details
          </button>

          {canEdit && onEdit && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(device);
                setShowActionsDropdown(false);
              }}
            >
              <Edit size={14} className="mr-2" />
              Edit
            </button>
          )}

          {canEdit && device.is_active && onDeactivate && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                onDeactivate(device);
                setShowActionsDropdown(false);
              }}
            >
              <PowerOff size={14} className="mr-2" />
              Deactivate
            </button>
          )}

          {canEdit && !device.is_active && onActivate && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                onActivate(device);
                setShowActionsDropdown(false);
              }}
            >
              <Power size={14} className="mr-2" />
              Activate
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DeviceCard;
