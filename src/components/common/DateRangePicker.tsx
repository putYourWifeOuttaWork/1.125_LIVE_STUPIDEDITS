import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onDateRangeChange?: (startDate: string, endDate: string) => void;
  className?: string;
}

export const DateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange, onDateRangeChange, className = '' }: DateRangePickerProps) => {
  const [preset, setPreset] = useState<string>('custom');

  const handlePresetChange = (presetValue: string) => {
    setPreset(presetValue);

    const now = new Date();
    let start = new Date();

    switch (presetValue) {
      case '24h':
        start.setHours(now.getHours() - 24);
        break;
      case '7d':
        start.setDate(now.getDate() - 7);
        break;
      case '30d':
        start.setDate(now.getDate() - 30);
        break;
      case '90d':
        start.setDate(now.getDate() - 90);
        break;
      case 'custom':
        return;
      default:
        return;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = now.toISOString().split('T')[0];
    if (onDateRangeChange) {
      onDateRangeChange(startStr, endStr);
    } else {
      if (onStartDateChange) onStartDateChange(startStr);
      if (onEndDateChange) onEndDateChange(endStr);
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreset('custom');
    const newDate = e.target.value;
    if (onStartDateChange) {
      onStartDateChange(newDate);
    } else if (onDateRangeChange) {
      onDateRangeChange(newDate, endDate);
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreset('custom');
    const newDate = e.target.value;
    if (onEndDateChange) {
      onEndDateChange(newDate);
    } else if (onDateRangeChange) {
      onDateRangeChange(startDate, newDate);
    }
  };

  const formatDateForInput = (isoDate: string) => {
    if (!isoDate) return '';
    return isoDate.split('T')[0];
  };

  return (
    <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
      <div className="flex items-center">
        <Calendar size={16} className="text-gray-400 mr-2" />
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {preset === 'custom' && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              onChange={handleStartDateChange}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={handleEndDateChange}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default DateRangePicker;
