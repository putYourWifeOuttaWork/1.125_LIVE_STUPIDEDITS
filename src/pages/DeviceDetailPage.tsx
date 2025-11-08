import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Activity, Battery, Wifi, Clock, Settings, XCircle, RefreshCw, FileText, Camera, AlertCircle, Image, Edit } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import DeviceStatusBadge from '../components/devices/DeviceStatusBadge';
import DeviceBatteryIndicator from '../components/devices/DeviceBatteryIndicator';
import DeviceSetupProgress from '../components/devices/DeviceSetupProgress';
import DeviceUnassignModal from '../components/devices/DeviceUnassignModal';
import DeviceReassignModal from '../components/devices/DeviceReassignModal';
import DeviceHistoryPanel from '../components/devices/DeviceHistoryPanel';
import DeviceImagesPanel from '../components/devices/DeviceImagesPanel';
import DeviceEditModal from '../components/devices/DeviceEditModal';
import { useDevice, useDeviceImages } from '../hooks/useDevice';
import { formatDistanceToNow } from 'date-fns';
import useCompanies from '../hooks/useCompanies';

type TabType = 'overview' | 'history' | 'images';

const DeviceDetailPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useCompanies();
  const { device, isLoading, activateDevice, deactivateDevice, unassignDevice, reassignDevice, updateDevice } = useDevice(deviceId);
  const { images } = useDeviceImages(deviceId || '');

  // Compute image counts from actual images
  const totalImages = images?.length || 0;
  const pendingImages = images?.filter(img => img.status === 'pending' || img.status === 'pending_retry').length || 0;
  const failedImages = images?.filter(img => img.status === 'failed').length || 0;
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!device) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Device not found</h3>
        <p className="mt-1 text-sm text-gray-500">
          The device you're looking for doesn't exist or you don't have access to it.
        </p>
        <div className="mt-6">
          <Button variant="primary" onClick={() => navigate('/devices')}>
            Back to Devices
          </Button>
        </div>
      </div>
    );
  }

  const siteName = device.sites?.name || 'Unassigned';
  const programName = device.pilot_programs?.name || 'Unassigned';
  const isAssigned = !!device.site_id && !!device.program_id;

  const handleUnassign = async (reason?: string) => {
    await unassignDevice(reason);
    setShowUnassignModal(false);
  };

  const handleReassign = async (mapping: any) => {
    await reassignDevice(mapping);
    setShowReassignModal(false);
  };

  const handleUpdate = async (updates: any) => {
    await updateDevice(updates);
    setShowEditModal(false);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate('/devices')}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back to devices"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {device.device_name || device.device_mac}
          </h1>
          <p className="text-gray-600 mt-1 font-mono text-sm">{device.device_mac}</p>
        </div>
        <div className="flex items-center gap-3">
          <DeviceStatusBadge
            lastSeenAt={device.last_seen_at}
            isActive={device.is_active}
          />
          {isAdmin && (
            <>
              {isAssigned && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Edit size={14} />}
                    onClick={() => setShowEditModal(true)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    onClick={() => setShowReassignModal(true)}
                  >
                    Reassign
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<XCircle size={14} />}
                    onClick={() => setShowUnassignModal(true)}
                  >
                    Unassign
                  </Button>
                </>
              )}
              {device.is_active ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deactivateDevice()}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => activateDevice()}
                  disabled={!isAssigned}
                >
                  Activate
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="inline-block mr-2" size={18} />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'history'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="inline-block mr-2" size={18} />
              History
            </button>
            <button
              onClick={() => setActiveTab('images')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'images'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Image className="inline-block mr-2" size={18} />
              Images
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Status Overview</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Last Seen</p>
                  <p className="font-medium">
                    {device.last_seen_at
                      ? formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Provisioning Status</p>
                  <p className="font-medium capitalize">
                    {device.provisioning_status?.replace('_', ' ') || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Next Wake</p>
                  <p className="font-medium">
                    {device.next_wake_at
                      ? formatDistanceToNow(new Date(device.next_wake_at), { addSuffix: true })
                      : 'Not scheduled'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Wake Schedule</p>
                  <p className="font-medium font-mono text-sm">
                    {device.wake_schedule_cron || 'Not set'}
                  </p>
                </div>
              </div>

              {device.battery_health_percent !== null && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Battery Health</p>
                  <DeviceBatteryIndicator
                    batteryHealthPercent={device.battery_health_percent}
                    size="lg"
                  />
                  {device.battery_voltage && (
                    <p className="text-xs text-gray-500 mt-1">
                      Voltage: {device.battery_voltage}V
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Assignment</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start">
                <MapPin size={18} className="text-gray-400 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Site</p>
                  <p className="font-medium">{siteName}</p>
                  {device.sites?.site_id && (
                    <button
                      onClick={() => navigate(`/programs/${device.program_id}/sites/${device.sites.site_id}`)}
                      className="text-sm text-primary-600 hover:text-primary-800 mt-1"
                    >
                      View site details →
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-start">
                <Activity size={18} className="text-gray-400 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Program</p>
                  <p className="font-medium">{programName}</p>
                  {device.program_id && (
                    <button
                      onClick={() => navigate(`/programs/${device.program_id}/sites`)}
                      className="text-sm text-primary-600 hover:text-primary-800 mt-1"
                    >
                      View program details →
                    </button>
                  )}
                </div>
              </div>
              {device.mapped_at && (
                <div className="flex items-start pt-3 border-t">
                  <Clock size={18} className="text-gray-400 mr-3 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500">Mapped</p>
                    <p className="text-sm">
                      {formatDistanceToNow(new Date(device.mapped_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isAdmin && device.provisioning_status !== 'active' && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Setup Progress</h2>
              </CardHeader>
              <CardContent>
                <DeviceSetupProgress device={device} showDetails={true} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Hardware Info</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Hardware Version</p>
                <p className="font-medium">{device.hardware_version}</p>
              </div>
              {device.firmware_version && (
                <div>
                  <p className="text-sm text-gray-500">Firmware Version</p>
                  <p className="font-medium">{device.firmware_version}</p>
                </div>
              )}
              {device.wifi_ssid && (
                <div className="flex items-start">
                  <Wifi size={16} className="text-gray-400 mr-2 mt-1" />
                  <div>
                    <p className="text-sm text-gray-500">WiFi Network</p>
                    <p className="font-medium">{device.wifi_ssid}</p>
                  </div>
                </div>
              )}
              {device.mqtt_client_id && (
                <div>
                  <p className="text-sm text-gray-500">MQTT Client ID</p>
                  <p className="font-mono text-xs">{device.mqtt_client_id}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {device.device_reported_site_id && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Device-Reported Data</h2>
              </CardHeader>
              <CardContent className="space-y-2">
                {device.device_reported_site_id && (
                  <div>
                    <p className="text-sm text-gray-500">Reported Site ID</p>
                    <p className="text-sm font-mono">{device.device_reported_site_id}</p>
                  </div>
                )}
                {device.device_reported_location && (
                  <div>
                    <p className="text-sm text-gray-500">Reported Location</p>
                    <p className="text-sm">{device.device_reported_location}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Images</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Images</p>
                  <p className="text-2xl font-bold text-gray-900">{totalImages}</p>
                </div>
                <Camera size={32} className="text-gray-300" />
              </div>
              {pendingImages > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-500">Pending Transfer</p>
                  <p className="text-lg font-semibold text-warning-600">{pendingImages}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Images currently being transmitted
                  </p>
                </div>
              )}
              {failedImages > 0 && (
                <div className="pt-3 border-t border-gray-200 bg-error-50 -mx-4 -mb-4 px-4 pb-4 rounded-b-lg">
                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <p className="text-sm font-medium text-error-800 flex items-center gap-1">
                        <AlertCircle size={14} />
                        Failed Transfers
                      </p>
                      <p className="text-2xl font-bold text-error-700 mt-1">{failedImages}</p>
                      <p className="text-xs text-error-600 mt-1">
                        Images that failed to complete before wake window
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full border-error-300 text-error-700 hover:bg-error-100"
                    onClick={() => {
                      // TODO: Implement retry all failed images
                      console.log('Retry all failed images for device:', device.device_id);
                    }}
                  >
                    Retry All Failed Images
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {device.notes && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Notes</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{device.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}

      {activeTab === 'history' && deviceId && (
        <DeviceHistoryPanel deviceId={deviceId} />
      )}

      {activeTab === 'images' && deviceId && (
        <DeviceImagesPanel deviceId={deviceId} />
      )}

      {showUnassignModal && (
        <DeviceUnassignModal
          isOpen={showUnassignModal}
          onClose={() => setShowUnassignModal(false)}
          device={device}
          onConfirm={handleUnassign}
        />
      )}

      {showReassignModal && (
        <DeviceReassignModal
          isOpen={showReassignModal}
          onClose={() => setShowReassignModal(false)}
          device={device}
          onSubmit={handleReassign}
        />
      )}

      {showEditModal && (
        <DeviceEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          device={device}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
};

export default DeviceDetailPage;
