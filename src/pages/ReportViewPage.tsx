import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  Download,
  Camera,
  Loader2,
  Calendar,
  Clock,
  User,
  Settings,
  History,
  Radio,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { LineChartWithBrush } from '../components/analytics/LineChartWithBrush';
import { BarChartWithBrush } from '../components/analytics/BarChartWithBrush';
import HeatmapChart from '../components/analytics/HeatmapChart';
import DrillDownPanel from '../components/analytics/DrillDownPanel';
import TimeRangeSelector from '../components/analytics/TimeRangeSelector';
import SnapshotListPanel from '../components/analytics/SnapshotListPanel';
import SnapshotViewer from '../components/analytics/SnapshotViewer';
import SnapshotComparisonView from '../components/analytics/SnapshotComparisonView';
import CreateSnapshotModal from '../components/analytics/CreateSnapshotModal';
import { useReportData, useDrillDown } from '../hooks/useReportData';
import { useActiveCompany } from '../hooks/useActiveCompany';
import { useUserRole } from '../hooks/useUserRole';
import {
  ReportConfiguration,
  ReportSnapshot,
  METRIC_LABELS,
  HeatmapCell,
  TimeRange,
  TimeGranularity,
  DEFAULT_REPORT_CONFIG,
} from '../types/analytics';
import {
  fetchReportById,
  fetchSnapshotsForReport,
  createSnapshot,
  exportDataToCSV,
} from '../services/analyticsService';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

type PageMode = 'live' | 'snapshots';
type SnapshotView = 'list' | 'single' | 'compare';

export default function ReportViewPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const { isSuperAdmin } = useUserRole();

  const [mode, setMode] = useState<PageMode>('live');
  const [snapshotView, setSnapshotView] = useState<SnapshotView>('list');
  const [viewingSnapshot, setViewingSnapshot] = useState<ReportSnapshot | null>(null);
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [overrideConfig, setOverrideConfig] = useState<Partial<ReportConfiguration> | null>(null);
  const [brushRange, setBrushRange] = useState<[Date, Date] | null>(null);
  const [drillOffset, setDrillOffset] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [chartWidth, setChartWidth] = useState(800);

  const {
    data: report,
    isLoading: loadingReport,
    error: reportError,
  } = useQuery({
    queryKey: ['report-detail', reportId],
    queryFn: () => fetchReportById(reportId!),
    enabled: !!reportId,
  });

  const {
    data: snapshots,
    isLoading: loadingSnapshots,
  } = useQuery({
    queryKey: ['report-snapshots', reportId],
    queryFn: () => fetchSnapshotsForReport(reportId!),
    enabled: !!reportId,
  });

  const snapshotCount = snapshots?.length || 0;

  const sortedSnapshots = useMemo(() => {
    if (!snapshots) return [];
    return [...snapshots].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [snapshots]);

  const currentSnapshotIndex = useMemo(() => {
    if (!viewingSnapshot || sortedSnapshots.length === 0) return -1;
    return sortedSnapshots.findIndex(
      (s) => s.snapshot_id === viewingSnapshot.snapshot_id
    );
  }, [viewingSnapshot, sortedSnapshots]);

  const handleSnapshotNavigate = useCallback(
    (index: number) => {
      if (index >= 0 && index < sortedSnapshots.length) {
        setViewingSnapshot(sortedSnapshots[index]);
      }
    },
    [sortedSnapshots]
  );

  const effectiveConfig: ReportConfiguration = report
    ? { ...DEFAULT_REPORT_CONFIG, ...report.configuration, ...overrideConfig }
    : DEFAULT_REPORT_CONFIG;

  const { lineChartData, barChartData, heatmapData, isLoading: dataLoading, isFetching, rawTimeSeries, isComparisonActive, dateRange, refresh } =
    useReportData(effectiveConfig, !!report);

  const {
    data: drillData,
    isLoading: drillLoading,
  } = useDrillDown(
    activeCompanyId,
    brushRange?.[0] || null,
    brushRange?.[1] || null,
    {
      programIds: effectiveConfig.programIds,
      siteIds: effectiveConfig.siteIds,
      deviceIds: effectiveConfig.deviceIds,
      offset: drillOffset,
    }
  );

  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availableWidth = entry.contentRect.width;
        setChartWidth(availableWidth);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleBrush = useCallback((range: [Date, Date]) => {
    setBrushRange(range);
    setDrillOffset(0);
  }, []);

  const handleHeatmapClick = useCallback((cell: HeatmapCell) => {
    try {
      const ts = new Date(cell.colKey);
      const end = new Date(ts.getTime() + 24 * 60 * 60 * 1000);
      setBrushRange([ts, end]);
      setDrillOffset(0);
    } catch {
      // ignore invalid dates
    }
  }, []);

  const handleCreateSnapshot = async (name: string, description: string) => {
    if (!report || !activeCompanyId) return;
    const snapshotData = {
      timeSeries: rawTimeSeries,
      dateRange,
    };
    await createSnapshot(
      report.report_id,
      activeCompanyId,
      name,
      snapshotData,
      effectiveConfig,
      description || undefined
    );
    queryClient.invalidateQueries({ queryKey: ['report-snapshots', reportId] });
    setShowCreateModal(false);
    toast.success('Snapshot saved');
  };

  const handleExport = () => {
    if (rawTimeSeries.length > 0) {
      exportDataToCSV(rawTimeSeries, `report_${report?.name || 'export'}`);
    } else {
      toast.error('No data to export');
    }
  };

  const handleViewSnapshot = (snapshot: ReportSnapshot) => {
    setViewingSnapshot(snapshot);
    setSnapshotView('single');
  };

  const handleCompare = (ids: [string, string]) => {
    setCompareIds(ids);
    setSnapshotView('compare');
  };

  const handleBackToList = () => {
    setSnapshotView('list');
    setViewingSnapshot(null);
    setCompareIds(null);
  };

  const invalidateSnapshots = () => {
    queryClient.invalidateQueries({ queryKey: ['report-snapshots', reportId] });
  };

  const primaryMetricLabel =
    effectiveConfig.metrics?.length > 0
      ? METRIC_LABELS[effectiveConfig.metrics[0].type]
      : 'Value';

  if (loadingReport) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (reportError || !report) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Report not found
        </h2>
        <p className="text-gray-500 mb-4">
          This report may have been deleted or you don't have access.
        </p>
        <Button onClick={() => navigate('/analytics')} variant="outline">
          Back to Analytics
        </Button>
      </div>
    );
  }

  const compareSnapshots =
    compareIds && snapshots
      ? [
          snapshots.find((s) => s.snapshot_id === compareIds[0]),
          snapshots.find((s) => s.snapshot_id === compareIds[1]),
        ]
      : [null, null];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analytics')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {report.name}
            </h1>
            {report.description && (
              <p className="text-sm text-gray-500 mt-0.5">
                {report.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {report.created_by_name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(report.created_at), 'MMM d, yyyy')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {effectiveConfig.timeGranularity} granularity
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === 'live' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { refresh(); toast.info('Refreshing live data...'); }}
                icon={<RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />}
                disabled={isFetching}
              >
                {isFetching ? 'Refreshing...' : 'Refresh Data'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                icon={<Settings className="w-4 h-4" />}
              >
                {showSettings ? 'Hide' : 'Adjust'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                icon={<Download className="w-4 h-4" />}
              >
                Export
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            icon={<Camera className="w-4 h-4" />}
          >
            Snapshot
          </Button>
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/analytics/${reportId}/edit`)}
              icon={<Edit className="w-4 h-4" />}
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => { setMode('live'); handleBackToList(); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors ${
            mode === 'live'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Radio className="w-4 h-4" />
          Live Data
        </button>
        <button
          onClick={() => setMode('snapshots')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors ${
            mode === 'snapshots'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <History className="w-4 h-4" />
          Snapshots
          {snapshotCount > 0 && (
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${
              mode === 'snapshots'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {snapshotCount}
            </span>
          )}
        </button>
      </div>

      {mode === 'live' && (
        <>
          {showSettings && (
            <Card className="p-4">
              <TimeRangeSelector
                timeRange={overrideConfig?.timeRange || effectiveConfig.timeRange}
                customStartDate={
                  overrideConfig?.customStartDate || effectiveConfig.customStartDate
                }
                customEndDate={
                  overrideConfig?.customEndDate || effectiveConfig.customEndDate
                }
                timeGranularity={
                  overrideConfig?.timeGranularity || effectiveConfig.timeGranularity
                }
                onTimeRangeChange={(r: TimeRange) =>
                  setOverrideConfig((prev) => ({ ...prev, timeRange: r }))
                }
                onCustomStartDateChange={(d: string) =>
                  setOverrideConfig((prev) => ({ ...prev, customStartDate: d }))
                }
                onCustomEndDateChange={(d: string) =>
                  setOverrideConfig((prev) => ({ ...prev, customEndDate: d }))
                }
                onTimeGranularityChange={(g: TimeGranularity) =>
                  setOverrideConfig((prev) => ({ ...prev, timeGranularity: g }))
                }
              />
            </Card>
          )}

          <div ref={chartContainerRef} className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {dataLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Refreshing data...
              </div>
            )}

            {isComparisonActive && (
              <div className="mb-3 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium">
                Comparison mode -- showing {effectiveConfig.comparisonEntities?.length || 0}{' '}
                {effectiveConfig.comparisonType === 'device' ? 'devices' : effectiveConfig.comparisonType === 'site' ? 'sites' : 'programs'} side-by-side
              </div>
            )}

            <div className="w-full overflow-x-auto">
              {effectiveConfig.reportType === 'line' ||
              effectiveConfig.reportType === 'dot' ? (
                <LineChartWithBrush
                  data={lineChartData || { timestamps: [], series: [] }}
                  width={chartWidth}
                  height={480}
                  yAxisLabel={primaryMetricLabel}
                  onBrushEnd={handleBrush}
                  loading={dataLoading && !lineChartData}
                />
              ) : effectiveConfig.reportType === 'bar' ? (
                <BarChartWithBrush
                  data={barChartData || { labels: [], datasets: [] }}
                  width={chartWidth}
                  height={480}
                  yAxisLabel={primaryMetricLabel}
                  loading={dataLoading && !barChartData}
                />
              ) : effectiveConfig.reportType === 'heatmap_temporal' ? (
                <HeatmapChart
                  data={heatmapData}
                  width={chartWidth}
                  height={Math.max(350, 480)}
                  onCellClick={handleHeatmapClick}
                  loading={dataLoading && heatmapData.length === 0}
                  yLabel={
                    effectiveConfig.groupBy === 'device'
                      ? 'Devices'
                      : effectiveConfig.groupBy === 'site'
                        ? 'Sites'
                        : 'Programs'
                  }
                  xLabel="Time Period"
                />
              ) : null}
            </div>

            {(effectiveConfig.reportType === 'line' ||
              effectiveConfig.reportType === 'dot') && (
              <p className="mt-2 text-xs text-gray-400 italic">
                Click and drag on the chart to drill down into specific time ranges
              </p>
            )}
            {effectiveConfig.reportType === 'heatmap_temporal' && (
              <p className="mt-2 text-xs text-gray-400 italic">
                Click on any cell to see detailed records for that entity and time
                period
              </p>
            )}
          </div>

          {brushRange && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  Drill-down:{' '}
                  {format(brushRange[0], 'MMM d, HH:mm')} -{' '}
                  {format(brushRange[1], 'MMM d, HH:mm')}
                </h3>
                <button
                  onClick={() => {
                    setBrushRange(null);
                    setDrillOffset(0);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear selection
                </button>
              </div>
              <DrillDownPanel
                records={drillData?.records || []}
                hasMore={drillData?.hasMore || false}
                loading={drillLoading}
                onLoadMore={() => setDrillOffset((prev) => prev + 50)}
              />
            </div>
          )}
        </>
      )}

      {mode === 'snapshots' && (
        <>
          {snapshotView === 'list' && (
            <SnapshotListPanel
              snapshots={snapshots || []}
              loading={loadingSnapshots}
              onView={handleViewSnapshot}
              onCompare={handleCompare}
              onDeleted={invalidateSnapshots}
              onRenamed={invalidateSnapshots}
            />
          )}

          {snapshotView === 'single' && viewingSnapshot && (
            <SnapshotViewer
              snapshot={viewingSnapshot}
              onBack={handleBackToList}
              snapshots={sortedSnapshots}
              currentIndex={currentSnapshotIndex}
              onNavigate={handleSnapshotNavigate}
            />
          )}

          {snapshotView === 'compare' &&
            compareSnapshots[0] &&
            compareSnapshots[1] && (
              <SnapshotComparisonView
                snapshotA={compareSnapshots[0]}
                snapshotB={compareSnapshots[1]}
                onBack={handleBackToList}
              />
            )}
        </>
      )}

      <CreateSnapshotModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onConfirm={handleCreateSnapshot}
      />
    </div>
  );
}
