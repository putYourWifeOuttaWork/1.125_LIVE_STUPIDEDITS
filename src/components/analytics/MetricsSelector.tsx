import { Plus, X } from 'lucide-react';
import {
  ReportMetric,
  MetricType,
  AggregationFunction,
  METRIC_LABELS,
  AGGREGATION_LABELS,
} from '../../types/analytics';

const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#84cc16',
  '#f97316',
];

const ALL_METRICS: MetricType[] = [
  'mgi_score',
  'mgi_velocity',
  'mgi_speed',
  'temperature',
  'humidity',
  'pressure',
  'gas_resistance',
  'battery_voltage',
  'alert_count',
  'wake_reliability',
  'image_success_rate',
];

const COMMON_AGGREGATIONS: AggregationFunction[] = [
  'avg',
  'min',
  'max',
  'sum',
  'count',
  'stddev',
];

interface MetricsSelectorProps {
  metrics: ReportMetric[];
  onChange: (metrics: ReportMetric[]) => void;
  maxMetrics?: number;
}

export default function MetricsSelector({
  metrics,
  onChange,
  maxMetrics = 5,
}: MetricsSelectorProps) {
  const addMetric = () => {
    const usedTypes = metrics.map((m) => m.type);
    const nextType = ALL_METRICS.find((t) => !usedTypes.includes(t)) || 'mgi_score';
    const nextColor = CHART_COLORS[metrics.length % CHART_COLORS.length];

    onChange([
      ...metrics,
      { type: nextType, aggregation: 'avg', color: nextColor },
    ]);
  };

  const removeMetric = (index: number) => {
    onChange(metrics.filter((_, i) => i !== index));
  };

  const updateMetric = (index: number, updates: Partial<ReportMetric>) => {
    onChange(
      metrics.map((m, i) => (i === index ? { ...m, ...updates } : m))
    );
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
        Measures
      </label>

      {metrics.map((metric, index) => (
        <div
          key={index}
          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: metric.color || CHART_COLORS[index % CHART_COLORS.length] }}
          />

          <select
            value={metric.type}
            onChange={(e) =>
              updateMetric(index, { type: e.target.value as MetricType })
            }
            className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            {ALL_METRICS.map((type) => (
              <option key={type} value={type}>
                {METRIC_LABELS[type]}
              </option>
            ))}
          </select>

          <select
            value={metric.aggregation}
            onChange={(e) =>
              updateMetric(index, {
                aggregation: e.target.value as AggregationFunction,
              })
            }
            className="w-28 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            {COMMON_AGGREGATIONS.map((agg) => (
              <option key={agg} value={agg}>
                {AGGREGATION_LABELS[agg]}
              </option>
            ))}
          </select>

          {metrics.length > 1 && (
            <button
              type="button"
              onClick={() => removeMetric(index)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {metrics.length < maxMetrics && (
        <button
          type="button"
          onClick={addMetric}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors w-full justify-center border border-dashed border-blue-300"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Measure
        </button>
      )}
    </div>
  );
}
