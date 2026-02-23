import { useState, useCallback, useRef, useEffect } from 'react';
import { LineChart, BarChart3, Grid3x3, TrendingUp, Info } from 'lucide-react';
import {
  ReportConfiguration,
  ReportType,
  GroupByDimension,
} from '../../types/analytics';
import ScopeSelector from './ScopeSelector';
import type { ProgramStatusInfo } from './ScopeSelector';
import MetricsSelector from './MetricsSelector';
import TimeRangeSelector from './TimeRangeSelector';
import ComparisonEntityPicker from './ComparisonEntityPicker';

const VIZ_TYPES: {
  value: ReportType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'line',
    label: 'Line',
    description: 'Trends over time',
    icon: <LineChart className="w-5 h-5" />,
  },
  {
    value: 'bar',
    label: 'Bar',
    description: 'Compare groups',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    value: 'heatmap_temporal',
    label: 'Heatmap',
    description: 'Entity x Time grid',
    icon: <Grid3x3 className="w-5 h-5" />,
  },
  {
    value: 'dot',
    label: 'Scatter',
    description: 'Correlation analysis',
    icon: <TrendingUp className="w-5 h-5" />,
  },
];

const GROUP_BY_OPTIONS: { value: GroupByDimension; label: string }[] = [
  { value: 'device', label: 'By Device' },
  { value: 'site', label: 'By Site' },
  { value: 'program', label: 'By Program' },
  { value: 'time', label: 'By Time Bucket' },
];

interface ReportConfigPanelProps {
  config: ReportConfiguration;
  onChange: (config: ReportConfiguration) => void;
  showNameFields?: boolean;
}

const RELATIVE_RANGES = new Set(['last_24h', 'last_7d', 'last_30d']);

export default function ReportConfigPanel({
  config,
  onChange,
  showNameFields = true,
}: ReportConfigPanelProps) {
  const [inactiveHint, setInactiveHint] = useState(false);
  const prevProgramIdsRef = useRef<string[]>(config.programIds);

  const update = (partial: Partial<ReportConfiguration>) => {
    onChange({ ...config, ...partial });
  };

  const handleProgramStatusChange = useCallback(
    (statuses: ProgramStatusInfo[]) => {
      const allInactive = statuses.length > 0 && statuses.every((s) => s.status === 'inactive');
      const programIdsChanged =
        JSON.stringify(config.programIds) !== JSON.stringify(prevProgramIdsRef.current);

      if (allInactive && programIdsChanged && RELATIVE_RANGES.has(config.timeRange)) {
        onChange({ ...config, timeRange: 'this_program' });
        setInactiveHint(true);
      } else if (!allInactive) {
        setInactiveHint(false);
      }

      prevProgramIdsRef.current = config.programIds;
    },
    [config, onChange]
  );

  useEffect(() => {
    if (inactiveHint) {
      const timer = setTimeout(() => setInactiveHint(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [inactiveHint]);

  return (
    <div className="space-y-6">
      {showNameFields && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Report Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. MGI Trends - Site Alpha"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={config.description || ''}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What does this report track?"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Visualization
        </label>
        <div className="grid grid-cols-2 gap-2">
          {VIZ_TYPES.map((viz) => (
            <button
              key={viz.value}
              type="button"
              onClick={() => update({ reportType: viz.value })}
              className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all text-left ${
                config.reportType === viz.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <div
                className={`p-1.5 rounded ${
                  config.reportType === viz.value
                    ? 'bg-blue-100'
                    : 'bg-gray-100'
                }`}
              >
                {viz.icon}
              </div>
              <div>
                <div className="text-sm font-medium">{viz.label}</div>
                <div className="text-[10px] text-gray-500">
                  {viz.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <ScopeSelector
          programIds={config.programIds}
          siteIds={config.siteIds}
          deviceIds={config.deviceIds}
          onProgramIdsChange={(ids) => update({ programIds: ids })}
          onSiteIdsChange={(ids) => update({ siteIds: ids })}
          onDeviceIdsChange={(ids) => update({ deviceIds: ids })}
          onProgramStatusChange={handleProgramStatusChange}
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <TimeRangeSelector
          timeRange={config.timeRange}
          customStartDate={config.customStartDate}
          customEndDate={config.customEndDate}
          timeGranularity={config.timeGranularity}
          onTimeRangeChange={(range) => update({ timeRange: range })}
          onCustomStartDateChange={(date) =>
            update({ customStartDate: date })
          }
          onCustomEndDateChange={(date) => update({ customEndDate: date })}
          onTimeGranularityChange={(gran) =>
            update({ timeGranularity: gran })
          }
        />
        {inactiveHint && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Time range switched to Program Period for inactive program data.
              You can change it back anytime.
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <MetricsSelector
          metrics={config.metrics}
          onChange={(metrics) => update({ metrics })}
        />
      </div>

      {(config.reportType === 'bar' ||
        config.reportType === 'heatmap_temporal') && (
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Group By
          </label>
          <div className="flex flex-wrap gap-1">
            {GROUP_BY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ groupBy: opt.value })}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  config.groupBy === opt.value
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {config.reportType === 'line' && (
        <div className="border-t border-gray-200 pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableComparison}
              onChange={(e) =>
                update({
                  enableComparison: e.target.checked,
                  ...(!e.target.checked && { comparisonEntities: [] }),
                })
              }
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Enable side-by-side comparison
            </span>
          </label>
          {config.enableComparison && (
            <>
              <div className="mt-2">
                <select
                  value={config.comparisonType || 'site'}
                  onChange={(e) =>
                    update({
                      comparisonType: e.target.value as 'program' | 'device' | 'site',
                      comparisonEntities: [],
                    })
                  }
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                >
                  <option value="site">Compare Sites</option>
                  <option value="device">Compare Devices</option>
                  <option value="program">Compare Programs</option>
                </select>
              </div>
              <ComparisonEntityPicker
                entityType={config.comparisonType || 'site'}
                selected={config.comparisonEntities || []}
                onChange={(ids) => update({ comparisonEntities: ids })}
                scopeDeviceIds={config.deviceIds}
                scopeSiteIds={config.siteIds}
                scopeProgramIds={config.programIds}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
