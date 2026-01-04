import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export interface FormattedWakeTime {
  utc: string;
  local: string;
  timestamp: string;
}

/**
 * Parse a date-only string (YYYY-MM-DD) without timezone conversion.
 * This prevents the common issue where new Date("2026-01-04") is interpreted
 * as UTC midnight, which shifts to the previous day in timezones behind UTC.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object representing the date at local midnight
 */
export function parseDateOnly(dateString: string): Date {
  if (!dateString) return new Date();

  // Split the date string and construct Date with year, month, day
  // This treats the date as local time, avoiding UTC conversion
  const parts = dateString.split('T')[0].split('-');
  if (parts.length !== 3) return new Date(dateString);

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
  const day = parseInt(parts[2], 10);

  return new Date(year, month, day);
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
