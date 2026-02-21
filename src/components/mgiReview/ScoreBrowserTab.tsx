import { useState, useCallback, useMemo } from 'react';
import { Filter, SortAsc, Search, X, Pencil, Download } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  useScoredImages, useScoreDistribution,
  useProgramsForBrowser, useDevicesForBrowser,
  useBulkScoreBrowserAction, useBulkExportLog,
  type ScoredImage, type ScoreBrowserFilters,
} from '../../hooks/useScoreBrowser';
import ScoreDistributionSummary from './ScoreDistributionSummary';
import ScoreBrowserTable from './ScoreBrowserTable';
import ScoreBrowserDetailPanel from './ScoreBrowserDetailPanel';
import BulkScoreBrowserModal from './BulkScoreBrowserModal';
import DateRangePicker from '../common/DateRangePicker';
import { exportScoredImagesCsv } from '../../utils/csvExport';

interface Props {
  companies: { company_id: string; name: string }[];
  sites: { id: string; name: string; company_id: string }[];
}

const defaultDateFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
};

const defaultDateTo = () => new Date().toISOString().split('T')[0];

export default function ScoreBrowserTab({ companies, sites }: Props) {
  const [filters, setFilters] = useState<ScoreBrowserFilters>({
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
    sortBy: 'score_desc',
    page: 0,
    pageSize: 50,
  });
  const [selectedImage, setSelectedImage] = useState<ScoredImage | null>(null);
  const [minScoreInput, setMinScoreInput] = useState('');
  const [maxScoreInput, setMaxScoreInput] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const { data: programs } = useProgramsForBrowser(filters.companyId);
  const { data: devices } = useDevicesForBrowser(filters.siteId);
  const { data: imageData, isLoading } = useScoredImages(filters);
  const { data: distribution, isLoading: distLoading } = useScoreDistribution({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    companyId: filters.companyId,
    programId: filters.programId,
    siteId: filters.siteId,
    deviceId: filters.deviceId,
  });

  const bulkAction = useBulkScoreBrowserAction();
  const exportLog = useBulkExportLog();

  const filteredSites = filters.companyId
    ? sites.filter(s => s.company_id === filters.companyId)
    : sites;

  const selectedImages = useMemo(() => {
    if (checkedIds.size === 0 || !imageData?.images) return [];
    return imageData.images.filter(i => checkedIds.has(i.image_id));
  }, [checkedIds, imageData?.images]);

  const updateFilter = useCallback(<K extends keyof ScoreBrowserFilters>(key: K, value: ScoreBrowserFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, page: key === 'page' ? (value as number) : 0 }));
    if (key !== 'page') setCheckedIds(new Set());
  }, []);

  const handleDateRangeChange = useCallback((start: string, end: string) => {
    setFilters(prev => ({ ...prev, dateFrom: start, dateTo: end, page: 0 }));
    setCheckedIds(new Set());
  }, []);

  const handleCompanyChange = useCallback((companyId: string) => {
    setFilters(prev => ({
      ...prev,
      companyId: companyId || undefined,
      programId: undefined,
      siteId: undefined,
      deviceId: undefined,
      page: 0,
    }));
    setCheckedIds(new Set());
  }, []);

  const handleProgramChange = useCallback((programId: string) => {
    setFilters(prev => ({
      ...prev,
      programId: programId || undefined,
      page: 0,
    }));
    setCheckedIds(new Set());
  }, []);

  const handleSiteChange = useCallback((siteId: string) => {
    setFilters(prev => ({
      ...prev,
      siteId: siteId || undefined,
      deviceId: undefined,
      page: 0,
    }));
    setCheckedIds(new Set());
  }, []);

  const applyScoreRange = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      minScore: minScoreInput ? parseFloat(minScoreInput) / 100 : undefined,
      maxScore: maxScoreInput ? parseFloat(maxScoreInput) / 100 : undefined,
      page: 0,
    }));
    setCheckedIds(new Set());
  }, [minScoreInput, maxScoreInput]);

  const handlePageChange = useCallback((p: number) => {
    setFilters(prev => ({ ...prev, page: p }));
    setCheckedIds(new Set());
  }, []);

  const handleActionComplete = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const handleBulkSubmit = useCallback(async (params: {
    imageIds: string[];
    action: 'set_qa_status' | 'override_score';
    newQaStatus?: string;
    newScore?: number;
    notes?: string;
  }) => {
    const result = await bulkAction.mutateAsync(params);
    if (result.succeeded > 0) {
      setCheckedIds(new Set());
    }
    return result;
  }, [bulkAction]);

  const handleExport = useCallback(async () => {
    if (selectedImages.length === 0) return;
    try {
      exportScoredImagesCsv(selectedImages);
      await exportLog.mutateAsync({
        imageIds: selectedImages.map(i => i.image_id),
        exportFormat: 'csv',
      });
      toast.success(`Exported ${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''} to CSV`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedImages, exportLog]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <DateRangePicker
            startDate={filters.dateFrom}
            endDate={filters.dateTo}
            onDateRangeChange={handleDateRangeChange}
          />

          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Company</label>
            <select
              value={filters.companyId || ''}
              onChange={e => handleCompanyChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Companies</option>
              {companies.map(c => (
                <option key={c.company_id} value={c.company_id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Program</label>
            <select
              value={filters.programId || ''}
              onChange={e => handleProgramChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Programs</option>
              {(programs || []).map(p => (
                <option key={p.program_id} value={p.program_id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Site</label>
            <select
              value={filters.siteId || ''}
              onChange={e => handleSiteChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Sites</option>
              {filteredSites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Device</label>
            <select
              value={filters.deviceId || ''}
              onChange={e => updateFilter('deviceId', e.target.value || undefined)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Devices</option>
              {(devices || []).map(d => (
                <option key={d.device_id} value={d.device_id}>{d.device_code}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">
              <SortAsc className="w-3 h-3 inline mr-0.5" />Sort
            </label>
            <select
              value={filters.sortBy}
              onChange={e => updateFilter('sortBy', e.target.value as ScoreBrowserFilters['sortBy'])}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="score_desc">Highest Score First</option>
              <option value="score_asc">Lowest Score First</option>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="velocity_desc">Largest Velocity First</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">QA Status</label>
            <select
              value={filters.qaStatus || 'all'}
              onChange={e => updateFilter('qaStatus', e.target.value === 'all' ? undefined : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="accepted">Accepted</option>
              <option value="pending_review">Pending Review</option>
              <option value="admin_confirmed">Confirmed</option>
              <option value="admin_overridden">Overridden</option>
            </select>
          </div>

          <div className="flex items-end gap-1.5">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Min %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="0"
                value={minScoreInput}
                onChange={e => setMinScoreInput(e.target.value)}
                onBlur={applyScoreRange}
                onKeyDown={e => e.key === 'Enter' && applyScoreRange()}
                className="w-16 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-gray-400 text-sm pb-2">-</span>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Max %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="100"
                value={maxScoreInput}
                onChange={e => setMaxScoreInput(e.target.value)}
                onBlur={applyScoreRange}
                onKeyDown={e => e.key === 'Enter' && applyScoreRange()}
                className="w-16 px-2 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={applyScoreRange}
              className="px-2.5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Apply score range"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Distribution summary */}
      <ScoreDistributionSummary distribution={distribution} isLoading={distLoading} />

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-blue-800 bg-blue-100 border border-blue-300 rounded-full">
              {checkedIds.size} selected
            </span>
            <button
              onClick={() => setBulkModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Bulk Edit
            </button>
            <button
              onClick={handleExport}
              disabled={exportLog.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          </div>
          <button
            onClick={() => setCheckedIds(new Set())}
            className="p-1 rounded hover:bg-blue-100 transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4 text-blue-500" />
          </button>
        </div>
      )}

      {/* Main content: table + detail panel */}
      <div className="flex gap-0 h-[calc(100vh-480px)] min-h-[400px]">
        <div className={`flex flex-col ${selectedImage ? 'w-3/5' : 'w-full'} transition-all duration-200 border border-gray-200 rounded-lg overflow-hidden bg-white`}>
          <ScoreBrowserTable
            images={imageData?.images || []}
            selectedId={selectedImage?.image_id || null}
            onSelect={setSelectedImage}
            totalCount={imageData?.totalCount || 0}
            page={filters.page}
            pageSize={filters.pageSize}
            onPageChange={handlePageChange}
            isLoading={isLoading}
            checkedIds={checkedIds}
            onCheckedChange={setCheckedIds}
          />
        </div>

        {selectedImage && (
          <div className="w-2/5 min-w-[360px]">
            <ScoreBrowserDetailPanel
              image={selectedImage}
              onClose={() => setSelectedImage(null)}
              onActionComplete={handleActionComplete}
            />
          </div>
        )}
      </div>

      {/* Bulk modal */}
      <BulkScoreBrowserModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        selectedImages={selectedImages}
        onSubmit={handleBulkSubmit}
        isSubmitting={bulkAction.isPending}
      />
    </div>
  );
}
