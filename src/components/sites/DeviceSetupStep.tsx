import { useState, useEffect } from 'react';
import { Camera, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import useCompanies from '../../hooks/useCompanies';
import DevicePoolSelector, { AvailableDevice } from './DevicePoolSelector';
import SiteMapEditor from './SiteMapEditor';
import Button from '../common/Button';
import DevicePlacementModal, { DevicePlacementSettings } from '../devices/DevicePlacementModal';
import DeviceMapContextMenu from '../devices/DeviceMapContextMenu';
import DeviceEditModal from '../devices/DeviceEditModal';
import DeviceSettingsModal from '../devices/DeviceSettingsModal';
import DeviceAlertThresholdsModal from '../devices/DeviceAlertThresholdsModal';
import DeviceReassignModal from '../devices/DeviceReassignModal';
import DeviceUnassignModal from '../devices/DeviceUnassignModal';
import DeleteConfirmModal from '../common/DeleteConfirmModal';

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
  const [placementModalOpen, setPlacementModalOpen] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<{ device: AvailableDevice; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ deviceId: string; x: number; y: number } | null>(null);
  const [editingDevice, setEditingDevice] = useState<AvailableDevice | null>(null);
  const [settingsDevice, setSettingsDevice] = useState<AvailableDevice | null>(null);
  const [thresholdsDevice, setThresholdsDevice] = useState<AvailableDevice | null>(null);
  const [reassignDevice, setReassignDevice] = useState<AvailableDevice | null>(null);
  const [unassignDevice, setUnassignDevice] = useState<AvailableDevice | null>(null);
  const [deleteDevice, setDeleteDevice] = useState<AvailableDevice | null>(null);
  const navigate = useNavigate();
  const { userCompany } = useCompanies();

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

      // Load currently assigned devices
      const assigned = (data || [])
        .filter((d: AvailableDevice) => d.is_currently_assigned)
        .map((d: AvailableDevice) => ({
          device_id: d.device_id,
          device_code: d.device_code,
          device_name: d.device_name,
          x: d.x_position || 0,
          y: d.y_position || 0,
          battery_level: d.battery_level,
          status: d.status,
        }));

      setAssignments(assigned);
    } catch (error: any) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load available devices');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceSelect = (device: AvailableDevice) => {
    setSelectedDevice(device);
  };

  const handleMapClick = (x: number, y: number) => {
    if (!selectedDevice) return;

    // Open modal for device configuration before placing
    setPendingPlacement({ device: selectedDevice, x, y });
    setPlacementModalOpen(true);
  };

  const handlePlacementSave = async (settings: DevicePlacementSettings) => {
    if (!pendingPlacement) return;

    const { device, x, y } = pendingPlacement;

    try {
      // First assign device to site with coordinates
      // This RPC function handles both site_id AND program_id assignment
      const { data: assignData, error: assignError } = await supabase.rpc('fn_assign_device_to_site', {
        p_device_id: device.device_id,
        p_site_id: siteId,
        p_x_position: x,
        p_y_position: y,
      });

      if (assignError) throw assignError;

      if (!assignData?.success) {
        throw new Error(assignData?.message || 'Failed to assign device');
      }

      // Now update device settings (name, schedule, notes, zone label)
      const updatePayload: any = {
        x_position: x,
        y_position: y,
      };

      if (settings.device_name) updatePayload.device_name = settings.device_name;
      if (settings.wake_schedule_cron) updatePayload.wake_schedule_cron = settings.wake_schedule_cron;
      if (settings.notes) updatePayload.notes = settings.notes;
      if (settings.zone_label) updatePayload.zone_label = settings.zone_label;

      // Build placement_json with all details
      updatePayload.placement_json = {
        x,
        y,
        height: settings.placement_height || 'Floor mounted',
        notes: settings.placement_notes || '',
      };

      const { error: updateError } = await supabase
        .from('devices')
        .update(updatePayload)
        .eq('device_id', device.device_id);

      if (updateError) throw updateError;

      // Update local state
      const newAssignment: DeviceAssignment = {
        device_id: device.device_id,
        device_code: device.device_code,
        device_name: settings.device_name || device.device_name,
        x,
        y,
        battery_level: device.battery_level,
        status: device.status,
      };

      setAssignments(prev => {
        const filtered = prev.filter(a => a.device_id !== device.device_id);
        return [...filtered, newAssignment];
      });

      setAvailableDevices(prev =>
        prev.map(d =>
          d.device_id === device.device_id
            ? { ...d, is_currently_assigned: true, x_position: x, y_position: y }
            : d
        )
      );

      setSelectedDevice(null);
      setPendingPlacement(null);
      toast.success(`${device.device_code} configured and placed at (${x}, ${y})`);
    } catch (error: any) {
      console.error('Error placing device:', error);
      toast.error(error.message || 'Failed to place device');
      throw error;
    }
  };

  const handleDeviceDoubleClick = (deviceId: string) => {
    const device = availableDevices.find(d => d.device_id === deviceId);
    const assignment = assignments.find(a => a.device_id === deviceId);

    if (device && assignment) {
      setPendingPlacement({ device, x: assignment.x, y: assignment.y });
      setPlacementModalOpen(true);
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

  const handleDeviceRightClick = (deviceId: string, x: number, y: number) => {
    setContextMenu({ deviceId, x, y });
  };

  const getContextMenuDevice = () => {
    if (!contextMenu) return null;
    return availableDevices.find(d => d.device_id === contextMenu.deviceId) || null;
  };

  const handleDeleteDevice = async () => {
    if (!deleteDevice) return;

    try {
      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('device_id', deleteDevice.device_id);

      if (error) throw error;

      toast.success('Device deleted successfully');
      loadAvailableDevices();
      setDeleteDevice(null);
    } catch (error: any) {
      console.error('Error deleting device:', error);
      toast.error('Failed to delete device');
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
              onDeviceDoubleClick={handleDeviceDoubleClick}
              onDeviceRightClick={handleDeviceRightClick}
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

      {/* Device Placement Modal */}
      {pendingPlacement && (
        <DevicePlacementModal
          isOpen={placementModalOpen}
          onClose={() => {
            setPlacementModalOpen(false);
            setPendingPlacement(null);
          }}
          device={pendingPlacement.device}
          position={{ x: pendingPlacement.x, y: pendingPlacement.y }}
          onSave={handlePlacementSave}
        />
      )}

      {/* Context Menu */}
      {contextMenu && getContextMenuDevice() && (
        <DeviceMapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          deviceId={contextMenu.deviceId}
          deviceName={getContextMenuDevice()!.device_name}
          onEdit={() => setEditingDevice(getContextMenuDevice())}
          onSettings={() => setSettingsDevice(getContextMenuDevice())}
          onAlertThresholds={() => setThresholdsDevice(getContextMenuDevice())}
          onPlacement={() => {
            const device = getContextMenuDevice();
            const assignment = assignments.find(a => a.device_id === device?.device_id);
            if (device && assignment) {
              setPendingPlacement({ device, x: assignment.x, y: assignment.y });
              setPlacementModalOpen(true);
            }
          }}
          onReassign={() => setReassignDevice(getContextMenuDevice())}
          onUnassign={() => setUnassignDevice(getContextMenuDevice())}
          onDeactivate={() => setUnassignDevice(getContextMenuDevice())}
          onDelete={() => setDeleteDevice(getContextMenuDevice())}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Device Edit Modal */}
      {editingDevice && (
        <DeviceEditModal
          isOpen={true}
          onClose={() => {
            setEditingDevice(null);
            loadAvailableDevices();
          }}
          device={editingDevice}
          onSave={() => {
            setEditingDevice(null);
            loadAvailableDevices();
          }}
        />
      )}

      {/* Device Settings Modal */}
      {settingsDevice && (
        <DeviceSettingsModal
          isOpen={true}
          onClose={() => setSettingsDevice(null)}
          device={{
            device_id: settingsDevice.device_id,
            device_code: settingsDevice.device_code,
            device_name: settingsDevice.device_name,
            device_mac: settingsDevice.device_mac,
            device_type: settingsDevice.device_type,
            provisioning_status: settingsDevice.provisioning_status,
            status: settingsDevice.status,
            battery_level: settingsDevice.battery_level,
            last_seen: settingsDevice.last_seen,
            firmware_version: settingsDevice.firmware_version,
            wake_schedule_cron: null,
            notes: null,
            x_position: settingsDevice.x_position,
            y_position: settingsDevice.y_position,
          } as any}
          onSuccess={() => {
            setSettingsDevice(null);
            loadAvailableDevices();
          }}
        />
      )}

      {/* Alert Thresholds Modal */}
      {thresholdsDevice && userCompany && (
        <DeviceAlertThresholdsModal
          isOpen={true}
          onClose={() => setThresholdsDevice(null)}
          deviceId={thresholdsDevice.device_id}
          deviceCode={thresholdsDevice.device_code}
          companyId={userCompany.company_id}
        />
      )}

      {/* Reassign Device Modal */}
      {reassignDevice && (
        <DeviceReassignModal
          isOpen={true}
          onClose={() => setReassignDevice(null)}
          device={reassignDevice}
          onReassign={() => {
            setReassignDevice(null);
            loadAvailableDevices();
          }}
        />
      )}

      {/* Unassign Device Modal */}
      {unassignDevice && (
        <DeviceUnassignModal
          isOpen={true}
          onClose={() => setUnassignDevice(null)}
          device={unassignDevice}
          onUnassign={async () => {
            await handleDeviceRemove(unassignDevice.device_id);
            setUnassignDevice(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteDevice && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setDeleteDevice(null)}
          onConfirm={handleDeleteDevice}
          title="Delete Device"
          message={`Are you sure you want to permanently delete ${deleteDevice.device_name}? This action cannot be undone.`}
          confirmText="Delete"
        />
      )}
    </div>
  );
}
