import { useState, Fragment, useEffect } from 'react';
import { Download, Filter, RefreshCw, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useDeviceHistory, HistoryFilterOptions } from '../../hooks/useDeviceHistory';
import { DeviceEventCategory, EventSeverity } from '../../lib/types';
import Button from '../common/Button';
import LoadingScreen from '../common/LoadingScreen';
import EventCategoryBadge from './EventCategoryBadge';
import SeverityIndicator from './SeverityIndicator';
import DeviceEventDetails from './DeviceEventDetails';
import DateRangePicker from '../common/DateRangePicker';
import { toast } from 'react-toastify';

interface DeviceHistoryPanelProps {
  deviceId: string;
}

const DeviceHistoryPanel = ({ deviceId }: DeviceHistoryPanelProps) => {
  const {
    history,
    loading,
    error,
    fetchHistory,
    filterHistory,
    exportHistoryCsv,
    currentFilters,
    totalCount,
    currentPage,
    pageSize,
    setPage,
    totalPages,
    availablePrograms,
    availableSites,
    availableSessions,
    loadingFilters,
    fetchAvailableSites,
    fetchAvailableSessions
  } = useDeviceHistory({ deviceId });

  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [localFilters, setLocalFilters] = useState<HistoryFilterOptions>({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
    categories: undefined,
    severityLevels: undefined,
    hasErrors: undefined,
    searchText: undefined
  });

  const handleApplyFilters = async () => {
    await filterHistory(localFilters);
  };

  const handleResetFilters = async () => {
    const defaultFilters: HistoryFilterOptions = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString()
    };
    setLocalFilters(defaultFilters);
    await filterHistory(defaultFilters);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await exportHistoryCsv();
      if (csv) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `device-history-${deviceId}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Device history exported successfully');
      }
    } catch (err) {
      toast.error('Failed to export device history');
    } finally {
      setExporting(false);
    }
  };

  const toggleRowExpansion = (historyId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(historyId)) {
      newExpanded.delete(historyId);
    } else {
      newExpanded.add(historyId);
    }
    setExpandedRows(newExpanded);
  };

  const eventCategories: DeviceEventCategory[] = [
    'WakeSession', 'ImageCapture', 'EnvironmentalReading', 'BatteryStatus',
    'Assignment', 'Unassignment', 'Activation', 'Deactivation',
    'ChunkTransmission', 'OfflineCapture', 'WiFiConnectivity', 'MQTTStatus',
    'ProvisioningStep', 'FirmwareUpdate', 'ConfigurationChange',
    'MaintenanceActivity', 'ErrorEvent'
  ];

  const severityLevels: EventSeverity[] = ['info', 'warning', 'error', 'critical'];

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Device Event History</h3>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} total events | Page {currentPage} of {totalPages} | Showing {history.length} events
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
            onClick={fetchHistory}
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
                Event Category
              </label>
              <select
                multiple
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.categories || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value) as DeviceEventCategory[];
                  setLocalFilters({ ...localFilters, categories: selected.length > 0 ? selected : undefined });
                }}
                size={5}
              >
                {eventCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Severity Level
              </label>
              <select
                multiple
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.severityLevels || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value) as EventSeverity[];
                  setLocalFilters({ ...localFilters, severityLevels: selected.length > 0 ? selected : undefined });
                }}
                size={4}
              >
                {severityLevels.map(sev => (
                  <option key={sev} value={sev} className="capitalize">{sev}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Description
              </label>
              <input
                type="text"
                placeholder="Search events..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.searchText || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, searchText: e.target.value || undefined })}
              />

              <div className="mt-3">
                <label className="flex items-center text-sm">
                  <input
                    type="checkbox"
                    checked={localFilters.hasErrors || false}
                    onChange={(e) => setLocalFilters({ ...localFilters, hasErrors: e.target.checked || undefined })}
                    className="mr-2"
                  />
                  Errors Only
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Program
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.programId || ''}
                onChange={(e) => {
                  const programId = e.target.value || undefined;
                  setLocalFilters({ ...localFilters, programId, siteId: undefined, sessionId: undefined });
                  if (programId) {
                    fetchAvailableSites(programId);
                  }
                }}
                disabled={loadingFilters}
              >
                <option value="">All Programs</option>
                {availablePrograms.map(prog => (
                  <option key={prog.program_id} value={prog.program_id}>
                    {prog.program_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.siteId || ''}
                onChange={(e) => {
                  const siteId = e.target.value || undefined;
                  setLocalFilters({ ...localFilters, siteId, sessionId: undefined });
                  if (siteId && localFilters.programId) {
                    fetchAvailableSessions(localFilters.programId, siteId);
                  }
                }}
                disabled={!localFilters.programId || loadingFilters}
              >
                <option value="">All Sites</option>
                {availableSites.map(site => (
                  <option key={site.site_id} value={site.site_id}>
                    {site.site_name} {site.site_code ? `(${site.site_code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                value={localFilters.sessionId || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, sessionId: e.target.value || undefined })}
                disabled={!localFilters.programId || !localFilters.siteId || loadingFilters}
              >
                <option value="">All Sessions</option>
                {availableSessions.map(session => (
                  <option key={session.session_id} value={session.session_id}>
                    {session.session_label}
                  </option>
                ))}
              </select>
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

      {history.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg">
          <Clock className="mx-auto h-12 w-12 text-gray-300 mb-2" />
          <p className="text-gray-500">No device events found</p>
        </div>
      ) : (
        <>
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Severity
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {history.map((event) => (
                  <Fragment key={event.history_id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleRowExpansion(event.history_id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(event.event_timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <EventCategoryBadge category={event.event_category} size="sm" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <SeverityIndicator severity={event.severity} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>
                          <p className="font-medium">{event.event_type}</p>
                          {event.description && (
                            <p className="text-gray-500 mt-1">{event.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {event.user_email ? (
                          <div className="flex items-center">
                            <User size={14} className="mr-1" />
                            {event.user_email}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">System</span>
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(event.history_id) && (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 bg-gray-50">
                          <DeviceEventDetails event={event} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
              <span className="font-medium">{totalCount}</span> events
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronLeft size={16} />}
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1 text-sm rounded ${
                        currentPage === pageNum
                          ? 'bg-primary-600 text-white font-medium'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default DeviceHistoryPanel;
