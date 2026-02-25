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
  CalendarClock,
  Play,
  BookmarkPlus,
  Trash2,
  AlertTriangle,
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
import SnapshotScheduleModal from '../components/analytics/SnapshotScheduleModal';
import SnapshotTimelinePlayer from '../components/analytics/SnapshotTimelinePlayer';
import { AnimatedLineChart } from '../components/analytics/AnimatedLineChart';
import { useReportData, useDrillDown } from '../hooks/useReportData';
import { useActiveCompany } from '../hooks/useActiveCompany';
import { useUserRole } from '../hooks/useUserRole';
import {
  ReportConfiguration,
  ReportSnapshot,
  ReportSnapshotSchedule,
  SerializedChartAnnotation,
  SnapshotCadence,
  METRIC_LABELS,
  METRIC_UNITS,
  CADENCE_LABELS,
  HeatmapCell,
  TimeRange,
  TimeGranularity,
  DEFAULT_REPORT_CONFIG,
  groupMetricsByScale,
} from '../types/analytics';
import type { MetricAxisInfo, ChartAnnotation } from '../components/analytics/LineChartWithBrush';
import {
  fetchReportById,
  fetchSnapshotsForReport,
  createSnapshot,
  exportDataToCSV,
  fetchScheduleForReport,
  upsertSnapshotSchedule,
  deleteSnapshotSchedule,
  toggleSnapshotSchedule,
  transformTimeSeriesForD3,
  promoteDraftReport,
  discardDraftReport,
} from '../services/analyticsService';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

type PageMode = 'live' | 'snapshots';
type SnapshotView = 'list' | 'single' | 'compare' | 'playback';

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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackTransitionMs, setPlaybackTransitionMs] = useState(800);

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

  const {
    data: schedule,
  } = useQuery({
    queryKey: ['report-schedule', reportId],
    queryFn: () => fetchScheduleForReport(reportId!),
    enabled: !!reportId,
  });

  const snapshotCount = snapshots?.length || 0;
  const isDraft = report?.is_draft === true;
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [promotingDraft, setPromotingDraft] = useState(false);
  const [discardingDraft, setDiscardingDraft] = useState(false);

  const reportAnnotations: ChartAnnotation[] = useMemo(() => {
    if (!report?.annotations || !Array.isArray(report.annotations)) return [];
    return report.annotations.map((a: SerializedChartAnnotation) => ({
      ...a,
      timestamp: a.timestamp ? new Date(a.timestamp) : undefined,
      startTimestamp: a.startTimestamp ? new Date(a.startTimestamp) : undefined,
      endTimestamp: a.endTimestamp ? new Date(a.endTimestamp) : undefined,
    }));
  }, [report?.annotations]);

  const handlePromoteDraft = async () => {
    if (!reportId) return;
    setPromotingDraft(true);
    try {
      await promoteDraftReport(reportId);
      queryClient.invalidateQueries({ queryKey: ['report-detail', reportId] });
      setDraftDismissed(true);
      toast.success('Report saved to your library');
    } catch (err) {
      console.error('Failed to promote draft:', err);
      toast.error('Failed to save report');
    } finally {
      setPromotingDraft(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!reportId) return;
    setDiscardingDraft(true);
    try {
      await discardDraftReport(reportId);
      toast.success('Draft report discarded');
      navigate(-1);
    } catch (err) {
      console.error('Failed to discard draft:', err);
      toast.error('Failed to discard report');
      setDiscardingDraft(false);
    }
  };

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

  const drillDownFilters = useMemo(() => {
    const cfg = effectiveConfig;
    if (!cfg.enableComparison || !cfg.comparisonEntities?.length) {
      return {
        programIds: cfg.programIds,
        siteIds: cfg.siteIds,
        deviceIds: cfg.deviceIds,
      };
    }

    const ct = cfg.comparisonType || 'site';
    if (ct === 'program') {
      const merged = Array.from(new Set([...cfg.programIds, ...cfg.comparisonEntities]));
      return { programIds: merged, siteIds: [] as string[], deviceIds: [] as string[] };
    }
    if (ct === 'site') {
      const merged = Array.from(new Set([...cfg.siteIds, ...cfg.comparisonEntities]));
      return { programIds: cfg.programIds, siteIds: merged, deviceIds: [] as string[] };
    }
    const merged = Array.from(new Set([...cfg.deviceIds, ...cfg.comparisonEntities]));
    return { programIds: cfg.programIds, siteIds: cfg.siteIds, deviceIds: merged };
  }, [effectiveConfig]);

  const {
    data: drillData,
    isLoading: drillLoading,
  } = useDrillDown(
    activeCompanyId,
    brushRange?.[0] || null,
    brushRange?.[1] || null,
    {
      programIds: drillDownFilters.programIds,
      siteIds: drillDownFilters.siteIds,
      deviceIds: drillDownFilters.deviceIds,
      offset: drillOffset,
    }
  );

  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const padding = 32;
      if (rect.width > 0) {
        setChartWidth(Math.max(280, rect.width - padding));
      }
    };

    const rafId = requestAnimationFrame(measure);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(Math.max(280, entry.contentRect.width));
      }
    });
    observer.observe(node);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [mode]);

  const drillDownRef = useRef<HTMLDivElement>(null);

  const handleBrush = useCallback((range: [Date, Date]) => {
    setBrushRange(range);
    setDrillOffset(0);
  }, []);

  useEffect(() => {
    if (brushRange && drillDownRef.current) {
      setTimeout(() => {
        drillDownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [brushRange]);

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

  const handleSaveSchedule = async (params: {
    cadence: SnapshotCadence;
    snapshotTime: string;
    timezone: string;
    enabled: boolean;
  }) => {
    if (!report || !activeCompanyId) return;
    await upsertSnapshotSchedule({
      reportId: report.report_id,
      companyId: activeCompanyId,
      cadence: params.cadence,
      snapshotTime: params.snapshotTime,
      timezone: params.timezone,
      enabled: params.enabled,
    });
    queryClient.invalidateQueries({ queryKey: ['report-schedule', reportId] });
    toast.success('Auto-snapshot schedule saved');
  };

  const handleDeleteSchedule = async () => {
    if (!schedule) return;
    await deleteSnapshotSchedule(schedule.schedule_id);
    queryClient.invalidateQueries({ queryKey: ['report-schedule', reportId] });
    toast.success('Auto-snapshot schedule removed');
  };

  const handleToggleSchedule = async (enabled: boolean) => {
    if (!schedule) return;
    await toggleSnapshotSchedule(schedule.schedule_id, enabled);
    queryClient.invalidateQueries({ queryKey: ['report-schedule', reportId] });
    toast.success(enabled ? 'Auto-snapshot resumed' : 'Auto-snapshot paused');
  };

  const handleStartPlayback = useCallback(() => {
    setPlaybackIndex(0);
    setSnapshotView('playback');
  }, []);

  const handlePlaybackIndexChange = useCallback((idx: number) => {
    setPlaybackIndex(idx);
  }, []);

  const playbackScaleGroups = useMemo(() => {
    if (snapshotView !== 'playback' || sortedSnapshots.length === 0) return null;
    const snap = sortedSnapshots[playbackIndex];
    const config = snap?.configuration_snapshot;
    const types = (config?.metrics || []).map((m: any) => m.type);
    return groupMetricsByScale(types);
  }, [snapshotView, sortedSnapshots, playbackIndex]);

  const playbackChartData = useMemo(() => {
    if (snapshotView !== 'playback' || sortedSnapshots.length === 0) return null;
    const snap = sortedSnapshots[playbackIndex];
    if (!snap?.data_snapshot?.timeSeries) return null;
    const config = snap.configuration_snapshot;
    const activeMetrics = config?.metrics?.map((m: any) => m.type) || ['mgi_score'];
    const secSet = playbackScaleGroups && playbackScaleGroups.secondary.length > 0
      ? new Set<string>(playbackScaleGroups.secondary)
      : undefined;
    return transformTimeSeriesForD3(snap.data_snapshot.timeSeries, activeMetrics, secSet);
  }, [snapshotView, sortedSnapshots, playbackIndex, playbackScaleGroups]);

  const playbackMetricAxisInfo: MetricAxisInfo[] = useMemo(() => {
    if (!playbackScaleGroups) return [];
    return [
      ...playbackScaleGroups.primary.map(m => ({
        name: m,
        label: METRIC_LABELS[m],
        unit: METRIC_UNITS[m],
        axis: 'primary' as const,
      })),
      ...playbackScaleGroups.secondary.map(m => ({
        name: m,
        label: METRIC_LABELS[m],
        unit: METRIC_UNITS[m],
        axis: 'secondary' as const,
      })),
    ];
  }, [playbackScaleGroups]);

  const metricTypes = (effectiveConfig.metrics || []).map(m => m.type);
  const scaleGroups = groupMetricsByScale(metricTypes);

  const primaryMetricLabel =
    scaleGroups.primary.length > 0
      ? scaleGroups.primary.map(m => METRIC_LABELS[m]).join(' / ')
      : 'Value';

  const secondaryMetricLabel =
    scaleGroups.secondary.length > 0
      ? scaleGroups.secondary.map(m => METRIC_LABELS[m]).join(' / ')
      : undefined;

  const metricAxisInfo: MetricAxisInfo[] = [
    ...scaleGroups.primary.map(m => ({
      name: m,
      label: METRIC_LABELS[m],
      unit: METRIC_UNITS[m],
      axis: 'primary' as const,
    })),
    ...scaleGroups.secondary.map(m => ({
      name: m,
      label: METRIC_LABELS[m],
      unit: METRIC_UNITS[m],
      axis: 'secondary' as const,
    })),
  ];

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
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/analytics')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {report.name}
            </h1>
            {report.description && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
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

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
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
          <div className="flex items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              icon={<Camera className="w-4 h-4" />}
              className="!rounded-r-none !border-r-0"
            >
              Snapshot
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowScheduleModal(true)}
              className="!rounded-l-none !px-2"
              title="Schedule auto-snapshots"
            >
              <CalendarClock className={`w-4 h-4 ${schedule?.enabled ? 'text-emerald-600' : schedule?.paused_reason ? 'text-amber-500' : ''}`} />
            </Button>
          </div>
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

      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
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
          {schedule?.enabled && (
            <span className="ml-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Auto-snapshot active" />
          )}
          {!schedule?.enabled && schedule?.paused_reason && (
            <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" title="Auto-snapshot auto-paused" />
          )}
        </button>
      </div>

      {isDraft && !draftDismissed && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Draft Report -- Auto-generated from alert investigation
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                This report will be automatically removed in 7 days unless you keep it.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePromoteDraft}
              disabled={promotingDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors disabled:opacity-50"
            >
              {promotingDraft ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BookmarkPlus className="w-3.5 h-3.5" />
              )}
              Keep in Library
            </button>
            <button
              onClick={handleDiscardDraft}
              disabled={discardingDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors disabled:opacity-50"
            >
              {discardingDraft ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Discard
            </button>
          </div>
        </div>
      )}

      {schedule?.enabled && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          <CalendarClock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            Auto-snapshot: <span className="font-medium">{CADENCE_LABELS[schedule.cadence]}</span> at{' '}
            <span className="font-medium">
              {schedule.snapshot_time.slice(0, 5)}
            </span>
          </span>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="ml-auto text-emerald-600 hover:text-emerald-800 font-medium underline underline-offset-2"
          >
            Manage
          </button>
        </div>
      )}

      {!schedule?.enabled && schedule?.paused_reason && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="flex-1">{schedule.paused_reason}</span>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="shrink-0 text-amber-600 hover:text-amber-800 font-medium underline underline-offset-2"
          >
            Manage
          </button>
        </div>
      )}

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
                  secondaryYAxisLabel={secondaryMetricLabel}
                  metricInfo={metricAxisInfo}
                  annotations={reportAnnotations.length > 0 ? reportAnnotations : undefined}
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
            <div ref={drillDownRef} className="space-y-2">
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
                activeMetrics={effectiveConfig.metrics}
              />
            </div>
          )}
        </>
      )}

      {mode === 'snapshots' && (
        <>
          {snapshotView === 'list' && (
            <>
              {sortedSnapshots.length >= 2 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm text-gray-500">
                    {sortedSnapshots.length} snapshots available
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStartPlayback}
                    icon={<Play className="w-4 h-4" />}
                  >
                    Play Timeline
                  </Button>
                </div>
              )}
              <SnapshotListPanel
                snapshots={snapshots || []}
                loading={loadingSnapshots}
                onView={handleViewSnapshot}
                onCompare={handleCompare}
                onDeleted={invalidateSnapshots}
                onRenamed={invalidateSnapshots}
              />
            </>
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

          {snapshotView === 'playback' && sortedSnapshots.length >= 2 && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                  <Play className="w-4 h-4 text-blue-600" />
                  Timeline Playback
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Watch your data evolve over time with smooth animated transitions between snapshots.
                </p>
              </div>

              <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="w-full overflow-x-auto">
                  {playbackChartData && (
                    <AnimatedLineChart
                      data={playbackChartData}
                      height={480}
                      yAxisLabel={
                        playbackScaleGroups?.primary
                          .map(m => METRIC_LABELS[m]).join(' / ') || 'Value'
                      }
                      secondaryYAxisLabel={
                        playbackScaleGroups?.secondary.length
                          ? playbackScaleGroups.secondary
                              .map(m => METRIC_LABELS[m]).join(' / ')
                          : undefined
                      }
                      metricInfo={playbackMetricAxisInfo}
                      transitionDuration={playbackTransitionMs}
                    />
                  )}
                </div>
              </div>

              <SnapshotTimelinePlayer
                snapshots={sortedSnapshots}
                currentIndex={playbackIndex}
                onIndexChange={handlePlaybackIndexChange}
                onClose={handleBackToList}
                transitionDuration={playbackTransitionMs}
              />

              {sortedSnapshots[playbackIndex]?.data_snapshot?.dateRange && (
                <div className="text-xs text-gray-400 px-1">
                  Data range:{' '}
                  {sortedSnapshots[playbackIndex].data_snapshot.dateRange.start} to{' '}
                  {sortedSnapshots[playbackIndex].data_snapshot.dateRange.end}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <CreateSnapshotModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onConfirm={handleCreateSnapshot}
      />

      <SnapshotScheduleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        schedule={schedule || null}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
        onToggle={handleToggleSchedule}
      />
    </div>
  );
}
