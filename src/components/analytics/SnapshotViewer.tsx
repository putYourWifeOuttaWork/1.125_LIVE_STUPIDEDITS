import { useMemo, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, User, Settings, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { ReportSnapshot, METRIC_LABELS } from '../../types/analytics';
import { transformTimeSeriesForD3 } from '../../services/analyticsService';
import { LineChartWithBrush } from './LineChartWithBrush';
import { BarChartWithBrush } from './BarChartWithBrush';
import HeatmapChart from './HeatmapChart';

interface SnapshotViewerProps {
  snapshot: ReportSnapshot;
  onBack: () => void;
  chartWidth?: number;
  compact?: boolean;
  hideHeader?: boolean;
}

export default function SnapshotViewer({
  snapshot,
  onBack,
  chartWidth: externalWidth,
  compact = false,
  hideHeader = false,
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

  const chartData = useMemo(() => {
    if (!dataSnapshot?.timeSeries || dataSnapshot.timeSeries.length === 0) return null;
    const primaryMetric =
      config?.metrics?.length > 0 ? config.metrics[0].type : 'mgi_score';
    return transformTimeSeriesForD3(dataSnapshot.timeSeries, primaryMetric);
  }, [dataSnapshot, config]);

  const primaryMetricLabel =
    config?.metrics?.length > 0
      ? METRIC_LABELS[config.metrics[0].type]
      : 'Value';

  const chartHeight = compact ? 320 : 440;

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
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
          {(!config || config.reportType === 'line' || config.reportType === 'dot') ? (
            <LineChartWithBrush
              data={chartData || { timestamps: [], series: [] }}
              width={chartWidth}
              height={chartHeight}
              yAxisLabel={primaryMetricLabel}
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

      {dataSnapshot?.dateRange && (
        <div className="text-xs text-gray-400 px-1">
          Data range: {dataSnapshot.dateRange.start} to {dataSnapshot.dateRange.end}
        </div>
      )}
    </div>
  );
}
