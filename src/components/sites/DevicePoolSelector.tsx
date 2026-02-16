import { useState, useMemo } from 'react';
import { Search, Camera, Battery, Clock, ChevronRight, Filter, X } from 'lucide-react';
import Input from '../common/Input';
import Button from '../common/Button';
import Card, { CardHeader, CardContent } from '../common/Card';
import DeviceStatusBadge from '../devices/DeviceStatusBadge';
import DeviceBatteryIndicator from '../devices/DeviceBatteryIndicator';
import { formatDistanceToNow } from 'date-fns';

export interface AvailableDevice {
  device_id: string;
  device_code: string;
  device_name: string;
  device_mac: string;
  device_type: 'physical' | 'virtual';
  provisioning_status: string;
  status: string;
  battery_level: number | null;
  last_seen: string | null;
  last_wake_at: string | null;
  wake_schedule_cron: string | null;
  firmware_version: string | null;
  is_currently_assigned: boolean;
  current_site_id: string | null;
  current_site_name: string | null;
  x_position: number | null;
  y_position: number | null;
}

interface DevicePoolSelectorProps {
  devices: AvailableDevice[];
  onDeviceSelect: (device: AvailableDevice) => void;
  selectedDeviceIds: string[];
  loading?: boolean;
  className?: string;
}

export default function DevicePoolSelector({
  devices,
  onDeviceSelect,
  selectedDeviceIds,
  loading = false,
  className = '',
}: DevicePoolSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<'all' | 'physical' | 'virtual'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = !searchQuery || 
        device.device_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.device_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = deviceTypeFilter === 'all' || device.device_type === deviceTypeFilter;
      
      return matchesSearch && matchesType;
    });
  }, [devices, searchQuery, deviceTypeFilter]);

  const unassignedCount = devices.filter(d => !d.is_currently_assigned).length;
  const assignedCount = devices.filter(d => d.is_currently_assigned).length;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Device Pool</h3>
          <Button
            variant="ghost"
            size="sm"
            icon={showFilters ? <X size={16} /> : <Filter size={16} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide' : 'Filter'}
          </Button>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>{unassignedCount} Available</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>{assignedCount} Assigned Here</span>
          </div>
        </div>

        {/* Search */}
        <Input
          type="text"
          placeholder="Search devices..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={<Search size={16} />}
          className="mb-2"
        />

        {/* Filters */}
        {showFilters && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setDeviceTypeFilter('all')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                deviceTypeFilter === 'all'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setDeviceTypeFilter('physical')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                deviceTypeFilter === 'physical'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Physical
            </button>
            <button
              onClick={() => setDeviceTypeFilter('virtual')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                deviceTypeFilter === 'virtual'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Virtual
            </button>
          </div>
        )}
      </div>

      {/* Device List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Camera size={48} className="mx-auto mb-2 text-gray-300" />
            <p>No devices available</p>
            {searchQuery && (
              <p className="text-sm mt-1">Try adjusting your search</p>
            )}
          </div>
        ) : (
          filteredDevices.map((device) => {
            const isSelected = selectedDeviceIds.includes(device.device_id);
            const isAssigned = device.is_currently_assigned;

            return (
              <Card
                key={device.device_id}
                onClick={() => onDeviceSelect(device)}
                hoverable
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? 'ring-2 ring-primary-500 bg-primary-50'
                    : isAssigned
                    ? 'bg-blue-50 hover:bg-blue-100'
                    : 'hover:bg-gray-50'
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Camera size={16} className={`flex-shrink-0 ${
                          isAssigned ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                        <span className="font-medium text-gray-900 truncate">
                          {device.device_code}
                        </span>
                        {isAssigned && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            Positioned
                          </span>
                        )}
                      </div>
                      
                      {device.device_name && (
                        <p className="text-sm text-gray-600 truncate mb-1">
                          {device.device_name}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {device.battery_level !== null && (
                          <div className="flex items-center gap-1">
                            <Battery size={12} />
                            <span>{device.battery_level}%</span>
                          </div>
                        )}
                        
                        {device.last_seen && (
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{formatDistanceToNow(new Date(device.last_seen), { addSuffix: true })}</span>
                          </div>
                        )}
                      </div>

                      {isAssigned && device.x_position !== null && device.y_position !== null && (
                        <div className="text-xs text-blue-600 mt-1">
                          Position: ({device.x_position}, {device.y_position})
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <DeviceStatusBadge
                        lastWakeAt={device.last_wake_at}
                        wakeScheduleCron={device.wake_schedule_cron}
                      />
                      {isSelected && (
                        <ChevronRight size={16} className="text-primary-600" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Footer Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          <p className="font-medium">{filteredDevices.length} device{filteredDevices.length !== 1 ? 's' : ''} shown</p>
          {selectedDeviceIds.length > 0 && (
            <p className="text-primary-600 mt-1">
              {selectedDeviceIds.length} selected for assignment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
