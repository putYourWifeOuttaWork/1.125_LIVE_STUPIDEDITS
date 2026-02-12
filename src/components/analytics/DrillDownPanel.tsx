import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Image,
  Table,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { DrillDownRecord } from '../../types/analytics';
import { exportDataToCSV } from '../../services/analyticsService';
import { format } from 'date-fns';

interface DrillDownPanelProps {
  records: DrillDownRecord[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  title?: string;
}

type ViewMode = 'table' | 'images';

export default function DrillDownPanel({
  records,
  hasMore,
  loading,
  onLoadMore,
  title,
}: DrillDownPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<keyof DrillDownRecord>('captured_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 20;

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

  if (records.length === 0 && !loading) return null;

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
                className={`p-1.5 ${
                  viewMode === 'table'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-white text-gray-400 hover:text-gray-600'
                }`}
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
    </div>
  );
}
