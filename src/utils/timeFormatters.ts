import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export interface FormattedWakeTime {
  utc: string;
  local: string;
  timestamp: string;
}

export function formatWakeTime(
  isoTimestamp: string,
  timezone: string
): FormattedWakeTime {
  const date = parseISO(isoTimestamp);

  return {
    utc: format(date, 'MMM d, h:mm a') + ' UTC',
    local: formatInTimeZone(date, timezone, 'MMM d, h:mm a zzz'),
    timestamp: isoTimestamp
  };
}

export function formatWakeTimes(
  timestamps: string[],
  timezone: string
): FormattedWakeTime[] {
  return timestamps.map(ts => formatWakeTime(ts, timezone));
}
