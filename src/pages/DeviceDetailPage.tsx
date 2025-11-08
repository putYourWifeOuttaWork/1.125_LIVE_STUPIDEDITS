import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Activity, Battery, Wifi, Clock } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import DeviceStatusBadge from '../components/devices/DeviceStatusBadge';
import DeviceBatteryIndicator from '../components/devices/DeviceBatteryIndicator';
import { useDevice } from '../hooks/useDevice';
import { formatDistanceToNow } from 'date-fns';

const DeviceDetailPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { device, isLoading, activateDevice, deactivateDevice } = useDevice(deviceId);

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
            >
              Activate
            </Button>
          )}
        </div>
      </div>

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
    </div>
  );
};

export default DeviceDetailPage;
