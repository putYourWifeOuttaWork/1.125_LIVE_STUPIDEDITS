import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Activity, Battery, Wifi, Clock, Settings, XCircle, RefreshCw, FileText, Camera, AlertCircle, Image, Edit, Thermometer, Bell, Trash2, Zap } from 'lucide-react';
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
import DeviceEnvironmentalPanel from '../components/devices/DeviceEnvironmentalPanel';
import DeviceProgramHistoryPanel from '../components/devices/DeviceProgramHistoryPanel';
import DeviceEditModal from '../components/devices/DeviceEditModal';
import DeviceSettingsModal from '../components/devices/DeviceSettingsModal';
import DeviceAlertThresholdsModal from '../components/devices/DeviceAlertThresholdsModal';
import ManualWakeModal from '../components/devices/ManualWakeModal';
import { useDevice, useDeviceImages } from '../hooks/useDevice';
import { formatDistanceToNow } from 'date-fns';
import useCompanies from '../hooks/useCompanies';
import { DeviceService } from '../services/deviceService';
import { toast } from 'react-toastify';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { createLogger } from '../utils/logger';

const log = createLogger('DeviceDetail');

type TabType = 'overview' | 'programs' | 'environmental' | 'history' | 'images';

const DeviceDetailPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useCompanies();
  const { device, isLoading, activateDevice, deactivateDevice, unassignDevice, reassignDevice, updateDevice, refetch } = useDevice(deviceId);
  const { images } = useDeviceImages(deviceId || '');

  // Compute image counts from actual images
  const totalImages = images?.length || 0;
  const pendingImages = images?.filter(img => img.status === 'pending' || img.status === 'pending_retry').length || 0;
  const failedImages = images?.filter(img => img.status === 'failed').length || 0;
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAlertThresholdsModal, setShowAlertThresholdsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showManualWakeModal, setShowManualWakeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!device) {
    return (
      <div className="text-center py-8">
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

  const handleDelete = async () => {
    if (!deviceId) return;

    const result = await DeviceService.deleteDevice(deviceId);

    if (result.success) {
      toast.success('Device deleted successfully');
      navigate('/devices');
    } else {
      toast.error(result.error || 'Failed to delete device');
    }

    setShowDeleteModal(false);
  };

  // Calculate next wake estimate if not set but schedule exists
  const getNextWakeDisplay = () => {
    if (device.next_wake_at) {
      const nextWakeDate = new Date(device.next_wake_at);
      const now = new Date();

      // If next wake is in the past, show as overdue
      if (nextWakeDate < now) {
        return <span className="text-red-600">Overdue ({formatDistanceToNow(nextWakeDate, { addSuffix: true })})</span>;
      }

      return <span className="text-green-600">{formatDistanceToNow(nextWakeDate, { addSuffix: true })}</span>;
    }

    if (device.wake_schedule_cron) {
      if (!device.is_active) {
        return <span className="text-amber-600">Activate device to calculate</span>;
      }

      const parts = device.wake_schedule_cron.split(' ');
      if (parts.length === 5) {
        const minutes = parts[0];
        const hours = parts[1];

        if (minutes.startsWith('*/') && hours === '*') {
          const interval = parseInt(minutes.replace('*/', ''));
          if (!isNaN(interval) && interval > 0) {
            return <span className="text-gray-600">Every {interval} minutes (pending first wake)</span>;
          }
        }

        if (hours.startsWith('*/')) {
          const interval = parseInt(hours.replace('*/', ''));
          if (!isNaN(interval) && interval > 0) {
            return <span className="text-gray-600">Every {interval} hours (pending first wake)</span>;
          }
        }

        if (hours.includes(',')) {
          return <span className="text-gray-600">{hours.split(',').length} times daily (pending first wake)</span>;
        }
      }
      return <span className="text-gray-600">Pending first wake</span>;
    }

    return <span className="text-gray-400">Not scheduled</span>;
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center">
        <button
          onClick={() => navigate('/devices')}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back to devices"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {device.device_name || device.device_code}
          </h1>
          <p className="text-gray-600 mt-1 font-mono text-sm">{device.device_code}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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
                    icon={<Settings size={14} />}
                    onClick={() => setShowSettingsModal(true)}
                  >
                    Settings
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Bell size={14} />}
                    onClick={() => setShowAlertThresholdsModal(true)}
                  >
                    Alert Thresholds
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
              <Button
                variant="outline"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => setShowDeleteModal(true)}
                className="!border-red-300 !text-red-600 hover:!bg-red-50"
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="-mb-px flex space-x-6 min-w-max">
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
              onClick={() => setActiveTab('programs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'programs'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="inline-block mr-2" size={18} />
              Programs
            </button>
            <button
              onClick={() => setActiveTab('environmental')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'environmental'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Thermometer className="inline-block mr-2" size={18} />
              Environmental
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
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <p className="text-sm text-gray-500">Next Wake</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => setShowManualWakeModal(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                        title="Schedule a one-time manual wake"
                      >
                        <Zap className="h-3 w-3" />
                        Manual Wake
                      </button>
                    )}
                  </div>
                  <p className="font-medium">
                    {getNextWakeDisplay()}
                  </p>
                  {device.next_wake_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(device.next_wake_at).toLocaleString()}
                    </p>
                  )}
                  {device.manual_wake_override && (
                    <p className="text-xs text-orange-600 mt-1 font-medium flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Manual wake scheduled
                    </p>
                  )}
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

          {/* Device Statistics Card - ENHANCED */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Device Statistics</h2>
                {device.last_wake_at && (
                  <span className="text-xs text-gray-500">
                    Updated {formatDistanceToNow(new Date(device.last_wake_at), { addSuffix: true })}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="group transition-all hover:bg-gray-50 p-3 rounded-lg -m-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <p className="text-sm text-gray-500">Total Wakes</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {device.total_wakes || 0}
                  </p>
                  {device.last_wake_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Last: {formatDistanceToNow(new Date(device.last_wake_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="group transition-all hover:bg-gray-50 p-3 rounded-lg -m-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="h-4 w-4 text-red-500" />
                    <p className="text-sm text-gray-500">Total Alerts</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {device.total_alerts || 0}
                  </p>
                  {device.total_alerts > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      Requires attention
                    </p>
                  )}
                </div>
                <div className="group transition-all hover:bg-gray-50 p-3 rounded-lg -m-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Camera className="h-4 w-4 text-green-500" />
                    <p className="text-sm text-gray-500">Images Taken</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {device.total_images_taken || 0}
                  </p>
                  {device.total_images_taken > 0 && device.latest_mgi_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Latest: {formatDistanceToNow(new Date(device.latest_mgi_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="group transition-all hover:bg-gray-50 p-3 rounded-lg -m-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Image className="h-4 w-4 text-purple-500" />
                    <p className="text-sm text-gray-500">Expected Images</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {device.total_images_expected_to_date || 0}
                  </p>
                  {device.total_images_expected_to_date > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Since {device.mapped_at ? 'mapping' : 'provisioning'}
                    </p>
                  )}
                </div>
              </div>

              {/* Image Success Rate */}
              {device.total_images_expected_to_date && device.total_images_expected_to_date > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-500">Image Success Rate</p>
                    <p className="text-sm font-bold text-gray-900">
                      {((device.total_images_taken || 0) / device.total_images_expected_to_date * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        ((device.total_images_taken || 0) / device.total_images_expected_to_date) >= 0.9
                          ? 'bg-green-500'
                          : ((device.total_images_taken || 0) / device.total_images_expected_to_date) >= 0.7
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{
                        width: `${Math.min(((device.total_images_taken || 0) / device.total_images_expected_to_date * 100), 100)}%`
                      }}
                    ></div>
                  </div>
                  {device.total_images_expected_to_date > (device.total_images_taken || 0) && (
                    <p className="text-xs text-red-600 mt-1">
                      Missing {device.total_images_expected_to_date - (device.total_images_taken || 0)} images
                    </p>
                  )}
                </div>
              )}

              {/* Wake Variance */}
              {device.last_wake_variance_minutes !== null && device.last_wake_variance_minutes !== undefined && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500 mb-2">Last Wake Timing</p>
                  <div className="flex items-center gap-2">
                    {device.last_wake_variance_minutes === 0 ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        ✓ On time
                      </span>
                    ) : device.last_wake_variance_minutes < 0 ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {Math.abs(device.last_wake_variance_minutes)} min early
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                        {device.last_wake_variance_minutes} min late
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Wake variance helps identify timing drift or connectivity issues
                  </p>
                </div>
              )}

              {/* Battery Health Alerts */}
              {device.total_battery_health_alerts && device.total_battery_health_alerts > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Battery Health Alerts</p>
                      <p className="text-xs text-gray-400 mt-1">Lifetime low battery warnings</p>
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-lg font-bold bg-orange-100 text-orange-800">
                      {device.total_battery_health_alerts}
                    </span>
                  </div>
                </div>
              )}

              {/* Overtime Mode Warning */}
              {device.is_overtime_mode && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <AlertCircle size={16} className="mr-2 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Overtime Mode</p>
                      <p className="text-xs text-yellow-800 mt-1">
                        Program has ended but device is still collecting data. Please reassign to an active program.
                      </p>
                    </div>
                  </div>
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

          {/* Zone & Placement Card */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Zone & Placement</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                // Parse placement_json if it's a string
                let parsedPlacement = null;
                if (device.placement_json) {
                  try {
                    parsedPlacement = typeof device.placement_json === 'string'
                      ? JSON.parse(device.placement_json)
                      : device.placement_json;
                  } catch (e) {
                    log.error('Failed to parse placement_json:', e);
                  }
                }

                // Check if we have any placement data
                const hasPlacement = device.zone_label ||
                                   parsedPlacement ||
                                   (device.x_position && device.y_position);

                if (!hasPlacement) {
                  return (
                    <div className="text-center py-4">
                      <MapPin size={32} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No zone or placement assigned</p>
                      {isAdmin && (
                        <button
                          onClick={() => setShowEditModal(true)}
                          className="text-sm text-primary-600 hover:text-primary-800 mt-2"
                        >
                          Add placement details →
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    {device.zone_label && (
                      <div>
                        <p className="text-sm text-gray-500">Zone</p>
                        <p className="font-medium">{device.zone_label}</p>
                      </div>
                    )}
                    {device.x_position && device.y_position && (
                      <div>
                        <p className="text-sm text-gray-500">Map Coordinates (X, Y)</p>
                        <p className="font-medium font-mono">
                          {device.x_position}, {device.y_position}
                        </p>
                      </div>
                    )}
                    {parsedPlacement?.x !== undefined && parsedPlacement?.y !== undefined && (
                      <div>
                        <p className="text-sm text-gray-500">Detailed Coordinates (X, Y)</p>
                        <p className="font-medium font-mono">
                          {parsedPlacement.x}, {parsedPlacement.y}
                        </p>
                      </div>
                    )}
                    {parsedPlacement?.height && (
                      <div>
                        <p className="text-sm text-gray-500">Height/Position</p>
                        <p className="font-medium capitalize">{parsedPlacement.height.replace(/_/g, ' ')}</p>
                      </div>
                    )}
                    {parsedPlacement?.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-gray-500 mb-1">Placement Notes</p>
                        <p className="text-sm">{parsedPlacement.notes}</p>
                      </div>
                    )}
                  </>
                );
              })()}
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
                      log.debug('Retry all failed images for device:', device.device_id);
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

      {activeTab === 'programs' && deviceId && (
        <DeviceProgramHistoryPanel deviceId={deviceId} />
      )}

      {activeTab === 'environmental' && deviceId && (
        <DeviceEnvironmentalPanel deviceId={deviceId} />
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

      {showSettingsModal && (
        <DeviceSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          device={device}
          onSuccess={() => {
            refetch();
          }}
        />
      )}

      {showAlertThresholdsModal && device.company_id && (
        <DeviceAlertThresholdsModal
          isOpen={showAlertThresholdsModal}
          onClose={() => setShowAlertThresholdsModal(false)}
          deviceId={device.device_id}
          deviceCode={device.device_code}
          companyId={device.company_id}
        />
      )}

      {showDeleteModal && (
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          title="Delete Device"
          message={
            <>
              <p className="mb-2">Are you sure you want to delete this device?</p>
              <p className="mb-2">
                <strong>{device.device_name || device.device_code}</strong>
              </p>
              <p className="text-sm text-red-600 font-semibold">
                ⚠️ FOR TESTING ONLY - This will permanently delete the device and all related records:
              </p>
              <ul className="text-sm text-gray-600 mt-2 ml-4 list-disc">
                <li>Device history and events</li>
                <li>Device images and telemetry</li>
                <li>Device commands and alerts</li>
                <li>Assignment history</li>
              </ul>
              <p className="text-sm text-gray-600 mt-2">This action cannot be undone.</p>
            </>
          }
          confirmLabel="Delete Device"
        />
      )}

      {showManualWakeModal && (
        <ManualWakeModal
          isOpen={showManualWakeModal}
          onClose={() => setShowManualWakeModal(false)}
          deviceId={device.device_id}
          deviceName={device.device_name || device.device_code}
          currentNextWake={device.next_wake_at}
          onSuccess={() => {
            refetch();
            setShowManualWakeModal(false);
          }}
        />
      )}
    </div>
  );
};


export default DeviceDetailPage;
