import { useState } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
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
  'vtt_mold_index',
  'colony_count',
  'colony_count_velocity',
  'temperature',
  'humidity',
  'pressure',
  'gas_resistance',
  'gas_resistance_compensated',
  'gas_resistance_baseline',
  'gas_resistance_deviation',
  'gas_resistance_zscore',
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

interface SortableMetricItemProps {
  id: string;
  metric: ReportMetric;
  index: number;
  colorFallback: string;
  canRemove: boolean;
  onUpdate: (updates: Partial<ReportMetric>) => void;
  onRemove: () => void;
}

function SortableMetricItem({
  id,
  metric,
  colorFallback,
  canRemove,
  onUpdate,
  onRemove,
}: SortableMetricItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5 ${
        isDragging ? 'shadow-md opacity-75 z-10 relative' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <select
          value={metric.type}
          onChange={(e) => onUpdate({ type: e.target.value as MetricType })}
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          {ALL_METRICS.map((type) => (
            <option key={type} value={type}>
              {METRIC_LABELS[type]}
            </option>
          ))}
        </select>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 pl-[22px]">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: metric.color || colorFallback }}
        />
        <select
          value={metric.aggregation}
          onChange={(e) =>
            onUpdate({ aggregation: e.target.value as AggregationFunction })
          }
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          {COMMON_AGGREGATIONS.map((agg) => (
            <option key={agg} value={agg}>
              {AGGREGATION_LABELS[agg]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

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
  const [idMap] = useState(() => new Map<number, string>());
  let nextId = 0;

  const getStableId = (index: number): string => {
    if (!idMap.has(index)) {
      idMap.set(index, `metric-${Date.now()}-${nextId++}`);
    }
    return idMap.get(index)!;
  };

  const sortableIds = metrics.map((_, i) => getStableId(i));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(active.id as string);
    const newIndex = sortableIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(metrics, oldIndex, newIndex);
    const reorderedIds = arrayMove(sortableIds, oldIndex, newIndex);

    idMap.clear();
    reorderedIds.forEach((id, i) => idMap.set(i, id));

    onChange(reordered);
  };

  const addMetric = () => {
    const usedTypes = metrics.map((m) => m.type);
    const nextType = ALL_METRICS.find((t) => !usedTypes.includes(t)) || 'mgi_score';
    const nextColor = CHART_COLORS[metrics.length % CHART_COLORS.length];
    onChange([...metrics, { type: nextType, aggregation: 'avg', color: nextColor }]);
  };

  const removeMetric = (index: number) => {
    const newMetrics = metrics.filter((_, i) => i !== index);
    idMap.clear();
    onChange(newMetrics);
  };

  const updateMetric = (index: number, updates: Partial<ReportMetric>) => {
    onChange(metrics.map((m, i) => (i === index ? { ...m, ...updates } : m)));
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
        Measures
      </label>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {metrics.map((metric, index) => (
              <SortableMetricItem
                key={sortableIds[index]}
                id={sortableIds[index]}
                metric={metric}
                index={index}
                colorFallback={CHART_COLORS[index % CHART_COLORS.length]}
                canRemove={metrics.length > 1}
                onUpdate={(updates) => updateMetric(index, updates)}
                onRemove={() => removeMetric(index)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
