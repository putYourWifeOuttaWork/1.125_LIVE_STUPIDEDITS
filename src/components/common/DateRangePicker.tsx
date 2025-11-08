import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onDateRangeChange: (startDate: string, endDate: string) => void;
  className?: string;
}

const DateRangePicker = ({ startDate, endDate, onDateRangeChange, className = '' }: DateRangePickerProps) => {
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

    onDateRangeChange(start.toISOString(), now.toISOString());
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreset('custom');
    onDateRangeChange(new Date(e.target.value).toISOString(), endDate);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreset('custom');
    onDateRangeChange(startDate, new Date(e.target.value).toISOString());
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
