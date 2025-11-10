import { todayInSiteTz } from '../../lib/timezone';

interface DateInSiteTzPickerProps {
  value: string;
  timezone: string;
  onChange: (date: string) => void;
}

export function DateInSiteTzPicker({ value, timezone, onChange }: DateInSiteTzPickerProps) {
  const today = todayInSiteTz(timezone);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="date-picker" className="text-sm font-medium text-gray-700">
        Date:
      </label>
      <input
        type="date"
        id="date-picker"
        value={value}
        max={today}
        onChange={(e) => onChange(e.target.value)}
        className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
      />
    </div>
  );
}
