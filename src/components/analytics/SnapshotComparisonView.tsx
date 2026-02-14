import { useMemo } from 'react';
import { ArrowLeft, Camera, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ReportSnapshot, METRIC_LABELS } from '../../types/analytics';
import { transformTimeSeriesForD3 } from '../../services/analyticsService';
import Button from '../common/Button';
import SnapshotViewer from './SnapshotViewer';

interface SnapshotComparisonViewProps {
  snapshotA: ReportSnapshot;
  snapshotB: ReportSnapshot;
  onBack: () => void;
}

interface StatSummary {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

function computeStats(snapshot: ReportSnapshot): StatSummary {
  const ts = snapshot.data_snapshot?.timeSeries;
  if (!ts || !Array.isArray(ts) || ts.length === 0) {
    return { count: 0, min: null, max: null, avg: null };
  }
  const primaryMetric =
    snapshot.configuration_snapshot?.metrics?.[0]?.type || 'mgi_score';
  const values = ts
    .filter((d: any) => d.metric_name === primaryMetric && d.metric_value != null)
    .map((d: any) => d.metric_value as number);

  if (values.length === 0) return { count: ts.length, min: null, max: null, avg: null };

  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
  };
}

function fmt(v: number | null, dec = 2): string {
  if (v == null) return '--';
  return v.toFixed(dec);
}

export default function SnapshotComparisonView({
  snapshotA,
  snapshotB,
  onBack,
}: SnapshotComparisonViewProps) {
  const statsA = useMemo(() => computeStats(snapshotA), [snapshotA]);
  const statsB = useMemo(() => computeStats(snapshotB), [snapshotB]);

  const metricLabel =
    snapshotA.configuration_snapshot?.metrics?.[0]?.type
      ? METRIC_LABELS[snapshotA.configuration_snapshot.metrics[0].type]
      : 'Value';

  const diffAvg =
    statsA.avg != null && statsB.avg != null ? statsB.avg - statsA.avg : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Snapshots
          </Button>
          <h3 className="text-sm font-medium text-gray-700">
            Side-by-Side Comparison
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Snapshot A
            </span>
          </div>
          <SnapshotViewer
            snapshot={snapshotA}
            onBack={onBack}
            compact
            hideHeader
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Snapshot B
            </span>
          </div>
          <SnapshotViewer
            snapshot={snapshotB}
            onBack={onBack}
            compact
            hideHeader
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-700">
            Comparison Summary -- {metricLabel}
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                  Metric
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-blue-600 uppercase">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Snapshot A
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-emerald-600 uppercase">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Snapshot B
                  </div>
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr>
                <td className="px-4 py-2 text-gray-700">Data Points</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{statsA.count}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{statsB.count}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">
                  {statsB.count - statsA.count > 0 ? '+' : ''}{statsB.count - statsA.count}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-700">Minimum</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{fmt(statsA.min)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{fmt(statsB.min)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">
                  {statsA.min != null && statsB.min != null
                    ? `${statsB.min - statsA.min > 0 ? '+' : ''}${fmt(statsB.min - statsA.min)}`
                    : '--'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-700">Maximum</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{fmt(statsA.max)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{fmt(statsB.max)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">
                  {statsA.max != null && statsB.max != null
                    ? `${statsB.max - statsA.max > 0 ? '+' : ''}${fmt(statsB.max - statsA.max)}`
                    : '--'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-700">Average</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{fmt(statsA.avg)}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{fmt(statsB.avg)}</td>
                <td className={`px-4 py-2 text-right font-mono ${
                  diffAvg != null
                    ? diffAvg > 0
                      ? 'text-green-600'
                      : diffAvg < 0
                        ? 'text-red-600'
                        : 'text-gray-500'
                    : 'text-gray-500'
                }`}>
                  {diffAvg != null ? `${diffAvg > 0 ? '+' : ''}${fmt(diffAvg)}` : '--'}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-700">Captured</td>
                <td className="px-4 py-2 text-right text-gray-600 text-xs">
                  {format(new Date(snapshotA.created_at), 'MMM d, yyyy HH:mm')}
                </td>
                <td className="px-4 py-2 text-right text-gray-600 text-xs">
                  {format(new Date(snapshotB.created_at), 'MMM d, yyyy HH:mm')}
                </td>
                <td className="px-4 py-2 text-right text-gray-500 text-xs">
                  {(() => {
                    const diffMs = new Date(snapshotB.created_at).getTime() - new Date(snapshotA.created_at).getTime();
                    const diffDays = Math.abs(Math.round(diffMs / (1000 * 60 * 60 * 24)));
                    if (diffDays === 0) return 'Same day';
                    return `${diffDays} day${diffDays !== 1 ? 's' : ''} apart`;
                  })()}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-700">Granularity</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {snapshotA.configuration_snapshot?.timeGranularity || '--'}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {snapshotB.configuration_snapshot?.timeGranularity || '--'}
                </td>
                <td className="px-4 py-2 text-right text-gray-500 text-xs">
                  {snapshotA.configuration_snapshot?.timeGranularity ===
                  snapshotB.configuration_snapshot?.timeGranularity
                    ? 'Same'
                    : 'Different'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
