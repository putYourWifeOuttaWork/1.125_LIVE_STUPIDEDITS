import { Calendar } from 'lucide-react';
import { TimeRange, TimeGranularity } from '../../types/analytics';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'last_24h', label: '24 Hours' },
  { value: 'last_7d', label: '7 Days' },
  { value: 'last_30d', label: '30 Days' },
  { value: 'this_program', label: 'Program Period' },
  { value: 'custom', label: 'Custom' },
];

const GRANULARITY_OPTIONS: { value: TimeGranularity; label: string }[] = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
];

interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  customStartDate?: string;
  customEndDate?: string;
  timeGranularity: TimeGranularity;
  onTimeRangeChange: (range: TimeRange) => void;
  onCustomStartDateChange: (date: string) => void;
  onCustomEndDateChange: (date: string) => void;
  onTimeGranularityChange: (granularity: TimeGranularity) => void;
}

export default function TimeRangeSelector({
  timeRange,
  customStartDate,
  customEndDate,
  timeGranularity,
  onTimeRangeChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onTimeGranularityChange,
}: TimeRangeSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
          Time Range
        </label>
        <div className="flex flex-wrap gap-1">
          {TIME_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTimeRangeChange(option.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                timeRange === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {timeRange === 'custom' && (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={customStartDate || ''}
            onChange={(e) => onCustomStartDateChange(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={customEndDate || ''}
            onChange={(e) => onCustomEndDateChange(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
          Granularity
        </label>
        <div className="flex gap-1">
          {GRANULARITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTimeGranularityChange(option.value)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timeGranularity === option.value
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
