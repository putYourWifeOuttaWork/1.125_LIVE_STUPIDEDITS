import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Image,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Eye,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { DrillDownRecord } from '../../types/analytics';
import { exportDataToCSV } from '../../services/analyticsService';
import { format } from 'date-fns';
import DrillDownImageModal from './DrillDownImageModal';

interface DrillDownPanelProps {
  records: DrillDownRecord[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  title?: string;
}

type ViewMode = 'table' | 'images';

interface AggregatedDevice {
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  image_count: number;
  avg_mgi: number | null;
  min_mgi: number | null;
  max_mgi: number | null;
  min_temp: number | null;
  max_temp: number | null;
  date_range: string;
  first_capture: string;
  last_capture: string;
  records: DrillDownRecord[];
}

export default function DrillDownPanel({
  records,
  hasMore,
  loading,
  onLoadMore,
  title,
}: DrillDownPanelProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<DrillDownRecord[]>([]);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);

  // Aggregate records by device
  const aggregatedDevices = useMemo((): AggregatedDevice[] => {
    const deviceMap = new Map<string, DrillDownRecord[]>();

    records.forEach((record) => {
      if (!deviceMap.has(record.device_id)) {
        deviceMap.set(record.device_id, []);
      }
      deviceMap.get(record.device_id)!.push(record);
    });

    return Array.from(deviceMap.entries()).map(([deviceId, deviceRecords]) => {
      const validMGI = deviceRecords.filter((r) => r.mgi_score !== null);
      const validTemp = deviceRecords.filter((r) => r.temperature !== null);

      const dates = deviceRecords.map((r) => new Date(r.captured_at));
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      return {
        device_id: deviceId,
        device_code: deviceRecords[0].device_code,
        site_id: deviceRecords[0].site_id,
        site_name: deviceRecords[0].site_name,
        program_id: deviceRecords[0].program_id,
        program_name: deviceRecords[0].program_name,
        image_count: deviceRecords.length,
        avg_mgi:
          validMGI.length > 0
            ? validMGI.reduce((sum, r) => sum + r.mgi_score!, 0) / validMGI.length
            : null,
        min_mgi:
          validMGI.length > 0
            ? Math.min(...validMGI.map((r) => r.mgi_score!))
            : null,
        max_mgi:
          validMGI.length > 0
            ? Math.max(...validMGI.map((r) => r.mgi_score!))
            : null,
        min_temp:
          validTemp.length > 0
            ? Math.min(...validTemp.map((r) => r.temperature!))
            : null,
        max_temp:
          validTemp.length > 0
            ? Math.max(...validTemp.map((r) => r.temperature!))
            : null,
        date_range: `${format(minDate, 'MMM d, HH:mm')} - ${format(maxDate, 'HH:mm')}`,
        first_capture: minDate.toISOString(),
        last_capture: maxDate.toISOString(),
        records: deviceRecords.sort((a, b) =>
          new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
        ),
      };
    });
  }, [records]);

  const toggleDevice = (deviceId: string) => {
    const newExpanded = new Set(expandedDevices);
    if (newExpanded.has(deviceId)) {
      newExpanded.delete(deviceId);
    } else {
      newExpanded.add(deviceId);
    }
    setExpandedDevices(newExpanded);
  };

  const handleViewImage = (record: DrillDownRecord, siblingRecords: DrillDownRecord[]) => {
    const idx = siblingRecords.findIndex(r => r.image_id === record.image_id);
    setModalRecords(siblingRecords);
    setModalInitialIndex(Math.max(0, idx));
    setModalOpen(true);
  };

  const handleViewSession = (record: DrillDownRecord) => {
    if (record.session_id && record.program_id && record.site_id) {
      navigate(`/programs/${record.program_id}/sites/${record.site_id}/sessions/${record.session_id}`);
    }
  };

  const handleViewAllImages = (device: AggregatedDevice) => {
    setModalRecords(device.records);
    setModalInitialIndex(0);
    setModalOpen(true);
  };

  console.log('[DrillDownPanel] Rendering with:', {
    recordCount: records.length,
    loading,
    hasMore,
    aggregatedCount: aggregatedDevices.length,
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {title || 'Drill-Down Details'}
          <span className="text-xs text-gray-500 font-normal">
            ({records.length} records{hasMore ? '+' : ''})
          </span>
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === 'table'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-white text-gray-400 hover:text-gray-600'
                }`}
                title="Table View"
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('images')}
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === 'images'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-white text-gray-400 hover:text-gray-600'
                }`}
                title="Image Gallery"
              >
                Gallery
              </button>
            </div>
            <button
              type="button"
              onClick={() => exportDataToCSV(records, 'drill_down_export')}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div>
          {loading && records.length === 0 ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading records...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">No records found</p>
              <p className="text-xs text-gray-500">Try adjusting your filters or time selection</p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Site
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Images
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg MGI
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Temp Range
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time Range
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {aggregatedDevices.map((device) => (
                    <>
                      {/* Device Summary Row */}
                      <tr
                        key={device.device_id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleDevice(device.device_id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {expandedDevices.has(device.device_id) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                          {device.device_code}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {device.site_name}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {device.image_count}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-gray-700">
                          {device.avg_mgi !== null ? device.avg_mgi.toFixed(2) : 'N/A'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-gray-700 text-xs">
                          {device.min_temp !== null && device.max_temp !== null
                            ? `${device.min_temp.toFixed(1)} - ${device.max_temp.toFixed(1)}°C`
                            : 'N/A'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700 text-xs">
                          {device.date_range}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleViewAllImages(device)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            View All
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Image Rows */}
                      {expandedDevices.has(device.device_id) &&
                        device.records.map((record, idx) => (
                          <tr
                            key={record.image_id || `${device.device_id}-${idx}`}
                            className="bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                          >
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2" colSpan={2}>
                              <div className="flex items-center gap-3 pl-6">
                                {/* Thumbnail */}
                                {record.image_url ? (
                                  <img
                                    src={record.image_url}
                                    alt={`Capture ${idx + 1}`}
                                    className="w-12 h-12 object-cover rounded border border-gray-200"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                                    <Image className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <div className="text-xs">
                                  <div className="font-medium text-gray-700">
                                    {format(new Date(record.captured_at), 'MMM d, HH:mm:ss')}
                                  </div>
                                  {record.session_id && (
                                    <div className="text-gray-500 text-[10px]">
                                      Session: {record.session_id.slice(0, 8)}...
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-700">
                              {record.mgi_score !== null ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  {record.mgi_score.toFixed(2)}
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-700">
                              {record.temperature !== null
                                ? `${record.temperature.toFixed(1)}°C`
                                : 'N/A'}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-700">
                              {record.humidity !== null
                                ? `${record.humidity.toFixed(1)}%`
                                : 'N/A'}
                            </td>
                            <td className="px-3 py-2" colSpan={2}>
                              <div className="flex items-center justify-center gap-2">
                                {record.image_url && (
                                  <button
                                    onClick={() => handleViewImage(record, device.records)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                    title="View Image"
                                  >
                                    <Eye className="w-3 h-3" />
                                    Image
                                  </button>
                                )}
                                {record.session_id && (
                                  <button
                                    onClick={() => handleViewSession(record)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                                    title="View Session Details"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Session
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {records
                  .filter((r) => r.image_url)
                  .map((record, i) => (
                    <div
                      key={record.image_id || i}
                      className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer"
                      onClick={() => handleViewImage(record, records.filter(r => r.image_url))}
                    >
                      <div className="aspect-square">
                        <img
                          src={record.image_url!}
                          alt={`${record.device_code} capture`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <div className="text-white text-xs font-medium truncate">
                            {record.device_code}
                          </div>
                          <div className="text-white/80 text-[10px]">
                            MGI: {record.mgi_score?.toFixed(2) ?? 'N/A'}
                          </div>
                          <div className="text-white/60 text-[10px]">
                            {format(new Date(record.captured_at), 'MMM d, HH:mm')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {records.filter((r) => r.image_url).length === 0 && (
                <div className="text-center py-8 text-sm text-gray-500">
                  No images available for the selected records
                </div>
              )}
            </div>
          )}

          {hasMore && !loading && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-center">
              <button
                type="button"
                onClick={onLoadMore}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Load More Records
              </button>
            </div>
          )}

          {loading && records.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                Loading more...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image Modal */}
      <DrillDownImageModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalRecords([]);
        }}
        records={modalRecords}
        initialIndex={modalInitialIndex}
      />
    </div>
  );
}
