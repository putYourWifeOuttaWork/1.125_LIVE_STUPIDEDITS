import { Circle } from 'lucide-react';

const INACTIVE_THRESHOLD_HOURS = 48;

export type DeviceActivityStatus = 'active' | 'warning' | 'inactive';

export interface DeviceStatusBadgeProps {
  lastWakeAt?: string | null;
  wakeScheduleCron?: string | null;
  missedWakes?: number;
  isActive?: boolean;
  className?: string;
}

export function parseCronIntervalMinutes(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return 1440;

  const minutePart = parts[0];
  const hourPart = parts[1];

  if (minutePart.startsWith('*/')) {
    const interval = parseInt(minutePart.slice(2), 10);
    if (interval > 0 && interval <= 60) return interval;
    return 60;
  }

  if (minutePart.includes(',') && hourPart === '*') {
    const count = minutePart.split(',').length;
    return count > 1 ? 60 / count : 60;
  }

  if (hourPart.startsWith('*/')) {
    const interval = parseInt(hourPart.slice(2), 10);
    if (interval > 0 && interval <= 24) return interval * 60;
    return 1440;
  }

  if (hourPart.includes(',')) {
    const count = hourPart.split(',').length;
    return count > 1 ? 1440 / count : 1440;
  }

  if (hourPart === '*' && /^\d+$/.test(minutePart)) return 60;
  if (/^\d+$/.test(hourPart) && /^\d+$/.test(minutePart)) return 1440;
  if (hourPart === '*' && minutePart === '*') return 1;

  return 1440;
}

export function calculateMissedWakes(
  cron: string | null | undefined,
  lastWakeAt: string | null | undefined
): number {
  if (!cron || !lastWakeAt) return 0;

  const elapsed = (Date.now() - new Date(lastWakeAt).getTime()) / 60000;
  if (elapsed <= 0) return 0;

  const interval = parseCronIntervalMinutes(cron);
  return Math.max(0, Math.floor(elapsed / interval) - 1);
}

export function computeDeviceStatus(props: {
  lastWakeAt?: string | null;
  wakeScheduleCron?: string | null;
  missedWakes?: number;
  isActive?: boolean;
}): { status: DeviceActivityStatus; missedCount: number; hoursSinceWake: number | null } {
  const { lastWakeAt, wakeScheduleCron, isActive } = props;

  if (isActive === false) {
    return { status: 'inactive', missedCount: 0, hoursSinceWake: null };
  }

  if (!lastWakeAt) {
    return { status: 'inactive', missedCount: 0, hoursSinceWake: null };
  }

  const lastWakeDate = new Date(lastWakeAt);
  const now = new Date();
  const hoursSinceWake = (now.getTime() - lastWakeDate.getTime()) / (1000 * 60 * 60);

  const missed = props.missedWakes ?? calculateMissedWakes(wakeScheduleCron, lastWakeAt);

  if (hoursSinceWake >= INACTIVE_THRESHOLD_HOURS) {
    return { status: 'inactive', missedCount: missed, hoursSinceWake };
  }

  if (missed > 1) {
    return { status: 'warning', missedCount: missed, hoursSinceWake };
  }

  return { status: 'active', missedCount: missed, hoursSinceWake };
}

const DeviceStatusBadge = ({
  lastWakeAt,
  wakeScheduleCron,
  missedWakes,
  isActive,
  className = '',
}: DeviceStatusBadgeProps) => {
  const { status, missedCount } = computeDeviceStatus({
    lastWakeAt,
    wakeScheduleCron,
    missedWakes,
    isActive,
  });

  if (status === 'active') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ${className}`}>
        <Circle size={8} className="mr-1 fill-green-500" />
        Active
      </span>
    );
  }

  if (status === 'warning') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 ${className}`}>
        <Circle size={8} className="mr-1 fill-amber-500" />
        Warning{missedCount > 0 ? ` - ${missedCount} missed` : ''}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${className}`}>
      <Circle size={8} className="mr-1 fill-gray-500" />
      Inactive
    </span>
  );
};

export default DeviceStatusBadge;
