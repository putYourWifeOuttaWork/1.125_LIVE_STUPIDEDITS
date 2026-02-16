import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Clock, User, Settings, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ReportSnapshot, METRIC_LABELS, METRIC_UNITS, groupMetricsByScale } from '../../types/analytics';
import { transformTimeSeriesForD3 } from '../../services/analyticsService';
import type { MetricAxisInfo } from './LineChartWithBrush';
import { LineChartWithBrush } from './LineChartWithBrush';
import { BarChartWithBrush } from './BarChartWithBrush';
import HeatmapChart from './HeatmapChart';
import { useDrillDown } from '../../hooks/useReportData';
import DrillDownPanel from './DrillDownPanel';

interface SnapshotViewerProps {
  snapshot: ReportSnapshot;
  onBack: () => void;
  chartWidth?: number;
  compact?: boolean;
  hideHeader?: boolean;
  snapshots?: ReportSnapshot[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}

export default function SnapshotViewer({
  snapshot,
  onBack,
  chartWidth: externalWidth,
  compact = false,
  hideHeader = false,
  snapshots,
  currentIndex,
  onNavigate,
}: SnapshotViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localWidth, setLocalWidth] = useState(600);

  useEffect(() => {
    if (externalWidth) return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLocalWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [externalWidth]);

  const chartWidth = externalWidth || localWidth;
  const config = snapshot.configuration_snapshot;
  const dataSnapshot = snapshot.data_snapshot;

  const metricTypes = (config?.metrics || []).map(m => m.type);
  const snapshotScaleGroups = groupMetricsByScale(metricTypes);

  const chartData = useMemo(() => {
    if (!dataSnapshot?.timeSeries || dataSnapshot.timeSeries.length === 0) return null;
    const activeMetrics = metricTypes.length > 0 ? metricTypes : ['mgi_score'];
    return transformTimeSeriesForD3(dataSnapshot.timeSeries, activeMetrics);
  }, [dataSnapshot, config]);

  const primaryMetricLabel =
    snapshotScaleGroups.primary.length > 0
      ? snapshotScaleGroups.primary.map(m => METRIC_LABELS[m]).join(' / ')
      : 'Value';

  const secondaryMetricLabel =
    snapshotScaleGroups.secondary.length > 0
      ? snapshotScaleGroups.secondary.map(m => METRIC_LABELS[m]).join(' / ')
      : undefined;

  const snapshotMetricAxisInfo: MetricAxisInfo[] = [
    ...snapshotScaleGroups.primary.map(m => ({
      name: m,
      label: METRIC_LABELS[m],
      unit: METRIC_UNITS[m],
      axis: 'primary' as const,
    })),
    ...snapshotScaleGroups.secondary.map(m => ({
      name: m,
      label: METRIC_LABELS[m],
      unit: METRIC_UNITS[m],
      axis: 'secondary' as const,
    })),
  ];

  const [brushRange, setBrushRange] = useState<[Date, Date] | null>(null);
  const [drillOffset, setDrillOffset] = useState(0);
  const drillDownRef = useRef<HTMLDivElement>(null);

  const handleBrush = useCallback((range: [Date, Date]) => {
    setBrushRange(range);
    setDrillOffset(0);
  }, []);

  useEffect(() => {
    setBrushRange(null);
    setDrillOffset(0);
  }, [snapshot.snapshot_id]);

  useEffect(() => {
    if (brushRange && drillDownRef.current) {
      setTimeout(() => {
        drillDownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [brushRange]);

  const {
    data: drillData,
    isLoading: drillLoading,
  } = useDrillDown(
    snapshot.company_id,
    brushRange?.[0] || null,
    brushRange?.[1] || null,
    {
      programIds: config?.programIds,
      siteIds: config?.siteIds,
      deviceIds: config?.deviceIds,
      offset: drillOffset,
    }
  );

  const isLineOrDot = !config || config.reportType === 'line' || config.reportType === 'dot';

  const chartHeight = compact ? 320 : 440;
  const hasCarousel = snapshots && snapshots.length > 1 && currentIndex !== undefined && onNavigate;
  const hasPrev = hasCarousel && currentIndex > 0;
  const hasNext = hasCarousel && currentIndex < snapshots.length - 1;

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-1.5 rounded hover:bg-amber-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-amber-700" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">
                    {snapshot.snapshot_name}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-amber-700">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Captured {format(new Date(snapshot.created_at), 'MMM d, yyyy HH:mm')}
                  </span>
                  {snapshot.created_by_name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {snapshot.created_by_name}
                    </span>
                  )}
                  {config && (
                    <span className="flex items-center gap-1">
                      <Settings className="w-3 h-3" />
                      {config.timeGranularity} granularity
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded font-medium">
              Historical Snapshot
            </span>
          </div>

          {hasCarousel && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-amber-200">
              <button
                onClick={() => hasPrev && onNavigate(currentIndex - 1)}
                disabled={!hasPrev}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  hasPrev
                    ? 'text-amber-800 hover:bg-amber-100 active:bg-amber-200'
                    : 'text-amber-300 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                {hasPrev ? (
                  <span className="hidden sm:inline max-w-[160px] truncate">
                    {snapshots[currentIndex - 1].snapshot_name}
                  </span>
                ) : (
                  <span className="hidden sm:inline">Oldest</span>
                )}
              </button>

              <span className="text-xs text-amber-600 font-medium tabular-nums">
                {currentIndex + 1} of {snapshots.length}
              </span>

              <button
                onClick={() => hasNext && onNavigate(currentIndex + 1)}
                disabled={!hasNext}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  hasNext
                    ? 'text-amber-800 hover:bg-amber-100 active:bg-amber-200'
                    : 'text-amber-300 cursor-not-allowed'
                }`}
              >
                {hasNext ? (
                  <span className="hidden sm:inline max-w-[160px] truncate">
                    {snapshots[currentIndex + 1].snapshot_name}
                  </span>
                ) : (
                  <span className="hidden sm:inline">Newest</span>
                )}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {compact && (
        <div className="flex items-center gap-2 px-1">
          <Camera className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-medium text-gray-700 truncate">
            {snapshot.snapshot_name}
          </span>
          <span className="text-xs text-gray-400">
            {format(new Date(snapshot.created_at), 'MMM d, HH:mm')}
          </span>
        </div>
      )}

      <div ref={containerRef} className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="w-full overflow-x-auto">
          {isLineOrDot ? (
            <LineChartWithBrush
              data={chartData || { timestamps: [], series: [] }}
              width={chartWidth}
              height={chartHeight}
              yAxisLabel={primaryMetricLabel}
              secondaryYAxisLabel={secondaryMetricLabel}
              metricInfo={snapshotMetricAxisInfo}
              onBrushEnd={handleBrush}
              loading={false}
            />
          ) : config.reportType === 'bar' ? (
            <BarChartWithBrush
              data={chartData || { labels: [], datasets: [] }}
              width={chartWidth}
              height={chartHeight}
              yAxisLabel={primaryMetricLabel}
              loading={false}
            />
          ) : config.reportType === 'heatmap_temporal' ? (
            <HeatmapChart
              data={[]}
              width={chartWidth}
              height={Math.max(350, chartHeight)}
              loading={false}
              yLabel="Devices"
              xLabel="Time Period"
            />
          ) : null}
        </div>
      </div>

      {isLineOrDot && !brushRange && (
        <p className="text-xs text-gray-400 italic px-1">
          Click and drag on the chart to drill down into specific time ranges
        </p>
      )}

      {brushRange && (
        <div ref={drillDownRef} className="space-y-2">
          <div className="flex items-center justify-between px-1">
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

      {dataSnapshot?.dateRange && (
        <div className="text-xs text-gray-400 px-1">
          Data range: {dataSnapshot.dateRange.start} to {dataSnapshot.dateRange.end}
        </div>
      )}
    </div>
  );
}
