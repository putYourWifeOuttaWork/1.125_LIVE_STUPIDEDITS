import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Image,
  Table,
  ChevronLeft,
  ChevronRight,
  Eye,
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

type ViewMode = 'aggregated' | 'table' | 'images';

interface AggregatedDevice {
  device_id: string;
  device_code: string;
  site_name: string;
  program_name: string;
  image_count: number;
  avg_mgi: number | null;
  min_mgi: number | null;
  max_mgi: number | null;
  avg_temp: number | null;
  avg_humidity: number | null;
  date_range: string;
  records: DrillDownRecord[];
}

export default function DrillDownPanel({
  records,
  hasMore,
  loading,
  onLoadMore,
  title,
}: DrillDownPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('aggregated');
  const [sortField, setSortField] = useState<keyof DrillDownRecord>('captured_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<AggregatedDevice | null>(null);
  const perPage = 20;

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
      const validHumidity = deviceRecords.filter((r) => r.humidity !== null);

      const dates = deviceRecords.map((r) => new Date(r.captured_at));
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      return {
        device_id: deviceId,
        device_code: deviceRecords[0].device_code,
        site_name: deviceRecords[0].site_name,
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
        avg_temp:
          validTemp.length > 0
            ? validTemp.reduce((sum, r) => sum + r.temperature!, 0) / validTemp.length
            : null,
        avg_humidity:
          validHumidity.length > 0
            ? validHumidity.reduce((sum, r) => sum + r.humidity!, 0) / validHumidity.length
            : null,
        date_range: `${format(minDate, 'MMM d, HH:mm')} - ${format(maxDate, 'HH:mm')}`,
        records: deviceRecords.sort((a, b) =>
          new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
        ),
      };
    });
  }, [records]);

  const sorted = [...records].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const paginated = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(sorted.length / perPage);

  const handleDeviceClick = (device: AggregatedDevice) => {
    setSelectedDevice(device);
    setModalOpen(true);
  };

  const handleSort = (field: keyof DrillDownRecord) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: keyof DrillDownRecord }) => {
    if (sortField !== field) return null;
    return sortAsc ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  const columns: { key: keyof DrillDownRecord; label: string; format?: (v: any) => string }[] = [
    {
      key: 'captured_at',
      label: 'Captured',
      format: (v: string) => (v ? format(new Date(v), 'MMM d, HH:mm') : '-'),
    },
    { key: 'device_code', label: 'Device' },
    { key: 'site_name', label: 'Site' },
    { key: 'program_name', label: 'Program' },
    {
      key: 'temperature',
      label: 'Temp',
      format: (v: number | null) => (v != null ? `${v.toFixed(1)}` : '-'),
    },
    {
      key: 'humidity',
      label: 'Humidity',
      format: (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '-'),
    },
    {
      key: 'mgi_score',
      label: 'MGI',
      format: (v: number | null) => (v != null ? v.toFixed(2) : '-'),
    },
    {
      key: 'battery_voltage',
      label: 'Battery',
      format: (v: number | null) => (v != null ? `${v.toFixed(2)}V` : '-'),
    },
    { key: 'status', label: 'Status' },
  ];

  // Add console logging for debugging
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
                onClick={() => setViewMode('aggregated')}
                className={`p-1.5 ${
                  viewMode === 'aggregated'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-white text-gray-400 hover:text-gray-600'
                }`}
                title="Aggregated View"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 ${
                  viewMode === 'table'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-white text-gray-400 hover:text-gray-600'
                }`}
                title="Table View"
              >
                <Table className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('images')}
                className={`p-1.5 ${
                  viewMode === 'images'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-white text-gray-400 hover:text-gray-600'
                }`}
                title="Image Grid View"
              >
                <Image className="w-4 h-4" />
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
          ) : viewMode === 'aggregated' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Device
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Site
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Images
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg MGI
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      MGI Range
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Temp
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time Range
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {aggregatedDevices.map((device) => (
                    <tr
                      key={device.device_id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                        {device.device_code}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                        {device.site_name}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {device.image_count}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                        {device.avg_mgi !== null ? device.avg_mgi.toFixed(2) : 'N/A'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700 text-xs">
                        {device.min_mgi !== null && device.max_mgi !== null
                          ? `${device.min_mgi.toFixed(2)} - ${device.max_mgi.toFixed(2)}`
                          : 'N/A'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                        {device.avg_temp !== null
                          ? `${device.avg_temp.toFixed(1)}°C`
                          : 'N/A'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700 text-xs">
                        {device.date_range}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          onClick={() => handleDeviceClick(device)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View Images
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {aggregatedDevices.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-500">
                  No devices found in the selected range
                </div>
              )}
            </div>
          ) : viewMode === 'table' ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {columns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                        >
                          {col.label}
                          <SortIcon field={col.key} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginated.map((record, i) => (
                      <tr
                        key={record.image_id || i}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className="px-3 py-2 whitespace-nowrap text-gray-700"
                          >
                            {col.format
                              ? col.format(record[col.key])
                              : String(record[col.key] ?? '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  Showing {page * perPage + 1}-
                  {Math.min((page + 1) * perPage, sorted.length)} of{' '}
                  {sorted.length}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (page + 1 >= totalPages && hasMore) {
                        onLoadMore();
                      }
                      setPage(Math.min(totalPages - 1, page + 1));
                    }}
                    disabled={page + 1 >= totalPages && !hasMore}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {sorted
                  .filter((r) => r.image_url)
                  .slice(0, 40)
                  .map((record, i) => (
                    <div
                      key={record.image_id || i}
                      className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
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
                          <div className="text-white text-xs font-medium">
                            {record.device_code}
                          </div>
                          <div className="text-white/80 text-[10px]">
                            MGI: {record.mgi_score?.toFixed(2) ?? 'N/A'}
                          </div>
                          <div className="text-white/60 text-[10px]">
                            {record.captured_at
                              ? format(new Date(record.captured_at), 'MMM d, HH:mm')
                              : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {sorted.filter((r) => r.image_url).length === 0 && (
                <div className="text-center py-8 text-sm text-gray-500">
                  No images available for the selected records
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Image Modal */}
      {selectedDevice && (
        <DrillDownImageModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedDevice(null);
          }}
          records={selectedDevice.records}
          deviceCode={selectedDevice.device_code}
        />
      )}
    </div>
  );
}
