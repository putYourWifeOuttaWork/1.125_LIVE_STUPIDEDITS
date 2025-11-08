import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, Search, AlertCircle, MapPin, Plus, Zap } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import LoadingScreen from '../components/common/LoadingScreen';
import DeviceCard from '../components/devices/DeviceCard';
import DeviceMappingModal from '../components/devices/DeviceMappingModal';
import DeviceSetupWizard from '../components/devices/DeviceSetupWizard';
import DeviceRegistrationModal from '../components/devices/DeviceRegistrationModal';
import { useDevices, usePendingDevices } from '../hooks/useDevices';
import { useDevice } from '../hooks/useDevice';
import { DeviceWithStats } from '../lib/types';
import { debounce } from '../utils/helpers';
import useCompanies from '../hooks/useCompanies';
import { toast } from 'react-toastify';

const DevicesPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useCompanies();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'inactive'>('all');
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedDeviceForMapping, setSelectedDeviceForMapping] = useState<DeviceWithStats | null>(null);
  const [useWizardMode, setUseWizardMode] = useState(true);

  const { devices: pendingDevices, isLoading: pendingLoading } = usePendingDevices();
  const { devices: allDevices, isLoading: devicesLoading } = useDevices({
    refetchInterval: 30000,
  });

  const { mapDevice } = useDevice(selectedDeviceForMapping?.device_id);

  const debouncedSearch = debounce((query: string) => {
    setDebouncedSearchQuery(query);
  }, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    debouncedSearch(e.target.value);
  };

  const handleMapDevice = (device: DeviceWithStats) => {
    setSelectedDeviceForMapping(device);
    if (useWizardMode) {
      setShowSetupWizard(true);
    } else {
      setShowMappingModal(true);
    }
  };

  const handleViewDevice = (device: DeviceWithStats) => {
    navigate(`/devices/${device.device_id}`);
  };

  const handleDeviceMapped = async (mapping: any) => {
    try {
      await mapDevice(mapping);
      setShowMappingModal(false);
      setShowSetupWizard(false);
      setSelectedDeviceForMapping(null);
      toast.success('Device mapped successfully!');
    } catch (error) {
      console.error('Error mapping device:', error);
      toast.error('Failed to map device');
    }
  };

  const handleRegistrationSuccess = () => {
    // Refresh devices list
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <Cpu className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">
          You don't have permission to manage devices. Please contact your company administrator.
        </p>
        <div className="mt-6">
          <Button variant="primary" onClick={() => navigate('/programs')}>
            Go to Programs
          </Button>
        </div>
      </div>
    );
  }

  if (devicesLoading && allDevices.length === 0) {
    return <LoadingScreen />;
  }

  const filteredDevices = allDevices.filter(device => {
    if (device.provisioning_status === 'pending_mapping') return false;

    const matchesSearch = debouncedSearchQuery
      ? device.device_name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        device.device_code?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        device.device_mac.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        device.sites?.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      : true;

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'inactive') return !device.is_active;

    if (!device.last_seen_at) return false;

    const lastSeenDate = new Date(device.last_seen_at);
    const now = new Date();
    const hoursSinceLastSeen = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60);

    if (statusFilter === 'online') return hoursSinceLastSeen < 2 && device.is_active;
    if (statusFilter === 'offline') return hoursSinceLastSeen >= 2 && device.is_active;

    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Device Registry</h1>
          <p className="text-gray-600 mt-1">
            Manage IoT devices and monitor their status
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            icon={<Plus size={16} />}
            onClick={() => setShowRegistrationModal(true)}
          >
            Register Device
          </Button>
          <Button
            variant="primary"
            icon={<Zap size={16} />}
            onClick={() => {
              if (pendingDevices.length > 0) {
                handleMapDevice(pendingDevices[0]);
              } else {
                toast.info('No pending devices to setup');
              }
            }}
            disabled={pendingDevices.length === 0}
          >
            Setup Device
          </Button>
        </div>
      </div>

      {pendingDevices.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                {pendingDevices.length} {pendingDevices.length === 1 ? 'Device' : 'Devices'} Awaiting Mapping
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                New devices have been provisioned and need to be assigned to sites.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingDevices.map((device) => (
                  <div key={device.device_id} className="bg-white rounded-md border border-yellow-300 p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {device.device_mac}
                        </p>
                        {device.device_reported_site_id && (
                          <p className="text-xs text-gray-600 mt-1">
                            Reported Site: {device.device_reported_site_id}
                          </p>
                        )}
                        {device.device_reported_location && (
                          <p className="text-xs text-gray-600">
                            Location: {device.device_reported_location}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<MapPin size={14} />}
                        onClick={() => handleMapDevice(device)}
                      >
                        Map
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <Input
            type="text"
            placeholder="Search devices by name, code, MAC, or site..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              statusFilter === 'all'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('online')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              statusFilter === 'online'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Online
          </button>
          <button
            onClick={() => setStatusFilter('offline')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              statusFilter === 'offline'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Offline
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              statusFilter === 'inactive'
                ? 'bg-gray-200 text-gray-800'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {filteredDevices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Cpu className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No devices found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {debouncedSearchQuery
              ? 'Try adjusting your search or filters'
              : 'Devices will appear here once they are mapped to sites'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map((device) => (
            <DeviceCard
              key={device.device_id}
              device={device}
              onView={handleViewDevice}
              canEdit={isAdmin}
            />
          ))}
        </div>
      )}

      {showMappingModal && selectedDeviceForMapping && (
        <DeviceMappingModal
          isOpen={showMappingModal}
          onClose={() => {
            setShowMappingModal(false);
            setSelectedDeviceForMapping(null);
          }}
          device={selectedDeviceForMapping}
          onSubmit={handleDeviceMapped}
        />
      )}

      {showSetupWizard && selectedDeviceForMapping && (
        <DeviceSetupWizard
          isOpen={showSetupWizard}
          onClose={() => {
            setShowSetupWizard(false);
            setSelectedDeviceForMapping(null);
          }}
          device={selectedDeviceForMapping}
          onComplete={handleDeviceMapped}
        />
      )}

      {showRegistrationModal && (
        <DeviceRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={handleRegistrationSuccess}
        />
      )}
    </div>
  );
};

export default DevicesPage;
