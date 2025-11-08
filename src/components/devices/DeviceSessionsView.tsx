import { useState } from 'react';
import { Download, Filter, RefreshCw, Activity, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useDeviceHistory, SessionFilterOptions } from '../../hooks/useDeviceHistory';
import { DeviceSessionStatus } from '../../lib/types';
import Button from '../common/Button';
import LoadingScreen from '../common/LoadingScreen';
import SessionStatusBadge from './SessionStatusBadge';
import DeviceTelemetryCard from './DeviceTelemetryCard';
import DateRangePicker from '../common/DateRangePicker';
import { toast } from 'react-toastify';

interface DeviceSessionsViewProps {
  deviceId: string;
}

const DeviceSessionsView = ({ deviceId }: DeviceSessionsViewProps) => {
  const {
    sessions,
    loading,
    error,
    fetchSessions,
    filterSessions,
    exportSessionsCsv,
    currentSessionFilters
  } = useDeviceHistory({ deviceId });

  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const [localFilters, setLocalFilters] = useState<SessionFilterOptions>({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
    status: undefined,
    withErrors: undefined,
    successOnly: undefined
  });

  const handleApplyFilters = async () => {
    await filterSessions(localFilters);
  };

  const handleResetFilters = async () => {
    const defaultFilters: SessionFilterOptions = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString()
    };
    setLocalFilters(defaultFilters);
    await filterSessions(defaultFilters);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await exportSessionsCsv();
      if (csv) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `device-sessions-${deviceId}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Device sessions exported successfully');
      }
    } catch (err) {
      toast.error('Failed to export device sessions');
    } finally {
      setExporting(false);
    }
  };

  const toggleSessionExpansion = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
    }
    setExpandedSessions(newExpanded);
  };

  const sessionStatuses: DeviceSessionStatus[] = ['success', 'partial', 'failed', 'in_progress'];

  const calculateStats = () => {
    const total = sessions.length;
    const successful = sessions.filter(s => s.status === 'success').length;
    const failed = sessions.filter(s => s.status === 'failed').length;
    const withErrors = sessions.filter(s => s.error_codes && s.error_codes.length > 0).length;

    return { total, successful, failed, withErrors, successRate: total > 0 ? (successful / total * 100).toFixed(1) : '0' };
  };

  const stats = calculateStats();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <Activity className="text-blue-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Successful</p>
              <p className="text-2xl font-bold text-success-600 mt-1">{stats.successful}</p>
            </div>
            <Activity className="text-success-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.successRate}%</p>
            </div>
            <Activity className="text-primary-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">With Errors</p>
              <p className="text-2xl font-bold text-error-600 mt-1">{stats.withErrors}</p>
            </div>
            <AlertCircle className="text-error-500" size={32} />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Wake Sessions</h3>
          <p className="text-sm text-gray-500 mt-1">
            Device wake cycle history and telemetry
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Filter size={14} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExport}
            isLoading={exporting}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={fetchSessions}
          >
            Refresh
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-4 animate-fade-in">
          <DateRangePicker
            startDate={localFilters.startDate || ''}
            endDate={localFilters.endDate || ''}
            onDateRangeChange={(start, end) => setLocalFilters({ ...localFilters, startDate: start, endDate: end })}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Status
              </label>
              <select
                multiple
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.status || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value) as DeviceSessionStatus[];
                  setLocalFilters({ ...localFilters, status: selected.length > 0 ? selected : undefined });
                }}
                size={4}
              >
                {sessionStatuses.map(status => (
                  <option key={status} value={status} className="capitalize">{status.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={localFilters.withErrors || false}
                  onChange={(e) => setLocalFilters({ ...localFilters, withErrors: e.target.checked || undefined, successOnly: false })}
                  className="mr-2"
                />
                With Errors Only
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={localFilters.successOnly || false}
                  onChange={(e) => setLocalFilters({ ...localFilters, successOnly: e.target.checked || undefined, withErrors: false })}
                  className="mr-2"
                />
                Successful Only
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-error-50 text-error-700 p-4 rounded-lg">
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg">
          <Activity className="mx-auto h-12 w-12 text-gray-300 mb-2" />
          <p className="text-gray-500">No wake sessions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.session_id} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleSessionExpansion(session.session_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <SessionStatusBadge status={session.status} />
                      <span className="text-sm font-medium text-gray-900">
                        {format(new Date(session.wake_timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({formatDistanceToNow(new Date(session.wake_timestamp), { addSuffix: true })})
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      {session.image_captured && (
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                          Image Captured
                        </span>
                      )}
                      {session.connection_success && (
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                          Connected
                        </span>
                      )}
                      {session.chunks_total > 0 && (
                        <span>
                          Chunks: {session.chunks_sent}/{session.chunks_total}
                        </span>
                      )}
                      {session.session_duration_ms && (
                        <span>
                          Duration: {(session.session_duration_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                      {session.error_codes && session.error_codes.length > 0 && (
                        <span className="text-error-600 font-medium">
                          {session.error_codes.length} Error(s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {expandedSessions.has(session.session_id) && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="space-y-4">
                    {session.telemetry_data && Object.keys(session.telemetry_data).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Telemetry Data</h4>
                        <DeviceTelemetryCard telemetryData={session.telemetry_data} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Site</p>
                        <p className="font-medium">{session.site_name || 'Not assigned'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Program</p>
                        <p className="font-medium">{session.program_name || 'Not assigned'}</p>
                      </div>
                      {session.next_wake_scheduled && (
                        <div>
                          <p className="text-gray-500">Next Wake</p>
                          <p className="font-medium">
                            {formatDistanceToNow(new Date(session.next_wake_scheduled), { addSuffix: true })}
                          </p>
                        </div>
                      )}
                      {session.pending_images_count > 0 && (
                        <div>
                          <p className="text-gray-500">Pending Images</p>
                          <p className="font-medium">{session.pending_images_count}</p>
                        </div>
                      )}
                    </div>

                    {session.error_codes && session.error_codes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Error Codes</h4>
                        <div className="flex flex-wrap gap-2">
                          {session.error_codes.map((code, idx) => (
                            <span key={idx} className="px-2 py-1 bg-error-100 text-error-800 rounded text-xs font-mono">
                              {code}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {session.was_offline_capture && (
                      <div className="bg-orange-50 border border-orange-200 rounded p-3">
                        <p className="text-sm text-orange-800">
                          <AlertCircle className="inline mr-1" size={14} />
                          This was an offline capture
                          {session.offline_duration_hours && ` (offline for ${session.offline_duration_hours} hours)`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeviceSessionsView;
