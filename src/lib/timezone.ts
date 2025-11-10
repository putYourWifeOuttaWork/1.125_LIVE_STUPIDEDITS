import { parseISO, formatDistanceToNow } from 'date-fns';
import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Convert UTC date to a site's timezone
 */
export function toSiteZoned(utcDate: Date | string, timezone: string = 'UTC'): Date {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  return toZonedTime(date, timezone);
}

/**
 * Convert a site-local date to UTC
 */
export function fromSiteZoned(localDate: Date, timezone: string = 'UTC'): Date {
  return fromZonedTime(localDate, timezone);
}

/**
 * Format a UTC date in a site's timezone
 */
export function formatInSiteTz(
  utcDate: Date | string,
  timezone: string = 'UTC',
  formatStr: string = 'MMM d, yyyy HH:mm:ss'
): string {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, formatStr, { timeZone: timezone });
}

/**
 * Get today's date in a site's timezone (YYYY-MM-DD)
 */
export function todayInSiteTz(timezone: string = 'UTC'): string {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  return format(zonedNow, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Get the UTC start and end timestamps for a given date in a site's timezone
 */
export function dayRangeInSiteTz(
  localDateStr: string,
  timezone: string = 'UTC'
): { start: string; end: string } {
  // Parse the local date string as midnight in the site's timezone
  const [year, month, day] = localDateStr.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

  // Convert to UTC
  const startUtc = fromZonedTime(startOfDay, timezone);
  const endUtc = fromZonedTime(endOfDay, timezone);

  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  };
}

/**
 * Get relative time string (e.g., "5 seconds ago", "2 minutes ago")
 */
export function getRelativeTime(utcDate: Date | string): string {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  return formatDistanceToNow(date, { addSuffix: true });
}
