import { Battery, BatteryLow, BatteryWarning } from 'lucide-react';

interface DeviceBatteryIndicatorProps {
  batteryHealthPercent: number | null;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const DeviceBatteryIndicator = ({
  batteryHealthPercent,
  showLabel = true,
  size = 'md'
}: DeviceBatteryIndicatorProps) => {
  if (batteryHealthPercent === null) {
    return (
      <div className="flex items-center text-gray-400">
        <Battery size={size === 'sm' ? 14 : size === 'md' ? 16 : 20} className="mr-1" />
        {showLabel && <span className="text-sm">Unknown</span>}
      </div>
    );
  }

  const sizeClass = size === 'sm' ? 'w-16 h-2' : size === 'md' ? 'w-20 h-3' : 'w-24 h-4';
  const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 20;
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';

  let bgColor = 'bg-green-500';
  let textColor = 'text-green-700';
  let Icon = Battery;

  if (batteryHealthPercent < 20) {
    bgColor = 'bg-red-500';
    textColor = 'text-red-700';
    Icon = BatteryLow;
  } else if (batteryHealthPercent < 60) {
    bgColor = 'bg-yellow-500';
    textColor = 'text-yellow-700';
    Icon = BatteryWarning;
  }

  return (
    <div className="flex items-center gap-2">
      <Icon size={iconSize} className={textColor} />
      <div className={`${sizeClass} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          className={`h-full ${bgColor} transition-all duration-300`}
          style={{ width: `${batteryHealthPercent}%` }}
        />
      </div>
      {showLabel && (
        <span className={`${textSize} font-medium ${textColor}`}>
          {batteryHealthPercent}%
        </span>
      )}
    </div>
  );
};

export default DeviceBatteryIndicator;
