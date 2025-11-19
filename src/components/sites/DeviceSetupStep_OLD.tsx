import { useState, useEffect } from 'react';
import { Camera, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import DevicePoolSelector, { AvailableDevice } from './DevicePoolSelector';
import SiteMapEditor from './SiteMapEditor';
import Button from '../common/Button';

interface DeviceAssignment {
  device_id: string;
  device_code: string;
  device_name: string;
  x: number;
  y: number;
  battery_level: number | null;
  status: string;
}

interface DeviceSetupStepProps {
  siteId: string;
  siteLength: number;
  siteWidth: number;
  onDevicesAssigned?: (assignments: DeviceAssignment[]) => void;
  onSkip?: () => void;
}

export default function DeviceSetupStep({
  siteId,
  siteLength,
  siteWidth,
  onDevicesAssigned,
  onSkip,
}: DeviceSetupStepProps) {
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [assignments, setAssignments] = useState<DeviceAssignment[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<AvailableDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAvailableDevices();
  }, [siteId]);

  const loadAvailableDevices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('fn_get_available_devices_for_site', {
        p_site_id: siteId,
      });

      if (error) throw error;

      setAvailableDevices(data || []);

      const alreadyAssigned = (data || [])
        .filter((d: AvailableDevice) => d.is_currently_assigned && d.x_position !== null && d.y_position !== null)
        .map((d: AvailableDevice) => ({
          device_id: d.device_id,
          device_code: d.device_code,
          device_name: d.device_name,
          x: d.x_position!,
          y: d.y_position!,
          battery_level: d.battery_level,
          status: d.status,
        }));

      setAssignments(alreadyAssigned);
    } catch (error: any) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load available devices');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceSelect = (device: AvailableDevice) => {
    if (device.is_currently_assigned && device.x_position !== null && device.y_position !== null) {
      const existing = assignments.find(a => a.device_id === device.device_id);
      if (existing) {
        setSelectedDevice(null);
        return;
      }
    }
    setSelectedDevice(device);
  };

  const handleMapClick = async (x: number, y: number) => {
    if (!selectedDevice) return;

    try {
      const { data, error } = await supabase.rpc('fn_assign_device_to_site', {
        p_device_id: selectedDevice.device_id,
        p_site_id: siteId,
        p_x_position: x,
        p_y_position: y,
      });

      if (error) throw error;

      if (data?.success) {
        const newAssignment: DeviceAssignment = {
          device_id: selectedDevice.device_id,
          device_code: selectedDevice.device_code,
          device_name: selectedDevice.device_name,
          x,
          y,
          battery_level: selectedDevice.battery_level,
          status: selectedDevice.status,
        };

        setAssignments(prev => {
          const filtered = prev.filter(a => a.device_id !== selectedDevice.device_id);
          return [...filtered, newAssignment];
        });

        setAvailableDevices(prev =>
          prev.map(d =>
            d.device_id === selectedDevice.device_id
              ? { ...d, is_currently_assigned: true, x_position: x, y_position: y }
              : d
          )
        );

        setSelectedDevice(null);
        toast.success(`${selectedDevice.device_code} assigned to position (${x}, ${y})`);
      }
    } catch (error: any) {
      console.error('Error assigning device:', error);
      toast.error('Failed to assign device to site');
    }
  };

  const handleDevicePositionUpdate = async (deviceId: string, x: number, y: number) => {
    setAssignments(prev =>
      prev.map(a => (a.device_id === deviceId ? { ...a, x, y } : a))
    );

    try {
      const { data, error } = await supabase.rpc('fn_update_device_position', {
        p_device_id: deviceId,
        p_x_position: x,
        p_y_position: y,
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Error updating device position:', error);
    }
  };

  const handleDeviceRemove = async (deviceId: string) => {
    try {
      const { data, error } = await supabase.rpc('fn_remove_device_from_site', {
        p_device_id: deviceId,
      });

      if (error) throw error;

      if (data?.success) {
        setAssignments(prev => prev.filter(a => a.device_id !== deviceId));
        setAvailableDevices(prev =>
          prev.map(d =>
            d.device_id === deviceId
              ? { ...d, is_currently_assigned: false, x_position: null, y_position: null }
              : d
          )
        );
        toast.success('Device removed from site');
      }
    } catch (error: any) {
      console.error('Error removing device:', error);
      toast.error('Failed to remove device');
    }
  };

  const handleSave = () => {
    if (onDevicesAssigned) {
      onDevicesAssigned(assignments);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Assign IoT Devices to Site</h4>
            <p className="text-sm text-blue-800">
              Select devices from the pool and click on the map to position them. This creates the spatial foundation for session tracking and analytics.
            </p>
            {siteLength > 0 && siteWidth > 0 && (
              <p className="text-sm text-blue-700 mt-2">
                Site dimensions: {siteLength}ft × {siteWidth}ft
              </p>
            )}
          </div>
        </div>
      </div>

      {siteLength <= 0 || siteWidth <= 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
            <div>
              <h4 className="font-medium text-yellow-900 mb-1">Site Dimensions Required</h4>
              <p className="text-sm text-yellow-800">
                Please set site length and width in the dimensions step before assigning devices.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
          <div className="lg:col-span-1">
            <DevicePoolSelector
              devices={availableDevices}
              onDeviceSelect={handleDeviceSelect}
              selectedDeviceIds={selectedDevice ? [selectedDevice.device_id] : []}
              loading={loading}
            />
          </div>

          <div className="lg:col-span-2">
            <SiteMapEditor
              siteLength={siteLength}
              siteWidth={siteWidth}
              devices={assignments}
              onDevicePositionUpdate={handleDevicePositionUpdate}
              onDeviceRemove={handleDeviceRemove}
              selectedDevice={selectedDevice}
              onMapClick={handleMapClick}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Camera size={16} />
          <span>
            {assignments.length} {assignments.length === 1 ? 'device' : 'devices'} positioned
          </span>
        </div>

        <div className="flex items-center gap-3">
          {onSkip && (
            <Button variant="outline" onClick={onSkip}>
              Skip for Now
            </Button>
          )}
          {assignments.length > 0 && (
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              icon={<CheckCircle size={16} />}
            >
              {saving ? 'Saving...' : 'Continue'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
