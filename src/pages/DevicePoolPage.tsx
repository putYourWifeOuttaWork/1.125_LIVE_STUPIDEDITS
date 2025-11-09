import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, RefreshCw, Building2, Check, AlertCircle } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import useCompanies from '../hooks/useCompanies';
import DeviceStatusBadge from '../components/devices/DeviceStatusBadge';
import { format } from 'date-fns';

interface UnassignedDevice {
  device_id: string;
  device_code: string;
  device_type: string;
  status: string;
  last_seen: string | null;
  created_at: string;
  firmware_version: string | null;
  battery_level: number | null;
}

interface DevicePoolStats {
  total_unassigned: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
}

const DevicePoolPage = () => {
  const navigate = useNavigate();
  const { companies } = useCompanies();
  const [devices, setDevices] = useState<UnassignedDevice[]>([]);
  const [stats, setStats] = useState<DevicePoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigningDevice, setAssigningDevice] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('');

  const loadDevicePool = async () => {
    setLoading(true);
    try {
      // Load unassigned devices
      const { data: devicesData, error: devicesError } = await supabase
        .rpc('get_unassigned_devices');

      if (devicesError) throw devicesError;

      setDevices(devicesData || []);

      // Load pool statistics
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_device_pool_stats');

      if (statsError) throw statsError;

      setStats(statsData || null);
    } catch (error) {
      console.error('Error loading device pool:', error);
      toast.error('Failed to load device pool');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevicePool();
  }, []);

  const handleAssignDevice = async (deviceId: string) => {
    if (!selectedCompany) {
      toast.error('Please select a company first');
      return;
    }

    setAssigningDevice(deviceId);

    try {
      const { data, error } = await supabase.rpc('assign_device_to_company', {
        p_device_id: deviceId,
        p_company_id: selectedCompany
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Device assigned successfully');
        setSelectedCompany('');
        await loadDevicePool();
      } else {
        toast.error(data.message || 'Failed to assign device');
      }
    } catch (error) {
      console.error('Error assigning device:', error);
      toast.error('Failed to assign device to company');
    } finally {
      setAssigningDevice(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Package className="h-8 w-8 text-primary-600 mr-3" />
              Device Pool
            </h1>
            <p className="text-gray-600 mt-1">
              Unassigned devices awaiting company assignment
            </p>
          </div>
          <Button
            variant="outline"
            icon={<RefreshCw size={16} />}
            onClick={loadDevicePool}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Unassigned</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {stats.total_unassigned}
                  </p>
                </div>
                <div className="rounded-full bg-amber-100 p-3">
                  <Package className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <p className="text-sm font-medium text-gray-600 mb-3">By Device Type</p>
              <div className="space-y-2">
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">{type}</span>
                    <span className="text-sm font-semibold text-gray-900">{count}</span>
                  </div>
                ))}
                {Object.keys(stats.by_type).length === 0 && (
                  <p className="text-sm text-gray-500">No devices</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <p className="text-sm font-medium text-gray-600 mb-3">By Status</p>
              <div className="space-y-2">
                {Object.entries(stats.by_status).map(([status, count]) => (
                  <div key={status} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">{status}</span>
                    <span className="text-sm font-semibold text-gray-900">{count}</span>
                  </div>
                ))}
                {Object.keys(stats.by_status).length === 0 && (
                  <p className="text-sm text-gray-500">No devices</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Device List */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Unassigned Devices
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No unassigned devices</p>
              <p className="text-sm text-gray-500 mt-1">
                All devices have been assigned to companies
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Seen
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assign to Company
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {devices.map(device => (
                    <tr key={device.device_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {device.device_code}
                          </div>
                          {device.firmware_version && (
                            <div className="text-xs text-gray-500">
                              FW: {device.firmware_version}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">
                          {device.device_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <DeviceStatusBadge status={device.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {device.last_seen
                          ? format(new Date(device.last_seen), 'MMM d, yyyy HH:mm')
                          : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(device.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <select
                            value={selectedCompany === device.device_id ? selectedCompany : ''}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            disabled={assigningDevice === device.device_id}
                          >
                            <option value="">Select company...</option>
                            {companies.map(company => (
                              <option key={company.company_id} value={company.company_id}>
                                {company.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Check size={14} />}
                            onClick={() => handleAssignDevice(device.device_id)}
                            disabled={!selectedCompany || assigningDevice === device.device_id}
                            isLoading={assigningDevice === device.device_id}
                          >
                            Assign
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Help Text */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-blue-900 mb-1">About Device Pool</h3>
            <p className="text-sm text-blue-700">
              Devices appear in this pool when they first connect from the field without a company assignment.
              As a super admin, you can assign these devices to specific companies. Once assigned, the device
              and all its data will become visible to users in that company.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevicePoolPage;
