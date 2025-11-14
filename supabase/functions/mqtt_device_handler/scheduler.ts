/**
 * Phase 3 - Scheduler Module
 *
 * Calculate next wake time based on cron expressions
 * Supports common cron patterns used by devices
 */

/**
 * Parse cron expression to get wake hours
 * Supports:
 * - Comma-separated: "0 8,16 * * *" returns [8, 16]
 * - Interval pattern: "0 STAR/2 * * *" returns [0, 2, 4, 6, ..., 22]
 * - Single: "0 14 * * *" returns [14]
 */
function parseWakeHours(cronExpression: string): number[] {
  if (!cronExpression || cronExpression.trim() === '') {
    return [8]; // Default: 8am
  }

  // Split cron expression and get hour part
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 2) {
    return [8]; // Default if invalid
  }

  const hourPart = parts[1];

  // Handle comma-separated hours: "8,16,20"
  if (hourPart.includes(',')) {
    return hourPart
      .split(',')
      .map(h => parseInt(h.trim()))
      .filter(h => !isNaN(h) && h >= 0 && h <= 23)
      .sort((a, b) => a - b);
  }

  // Handle interval syntax: star-slash-N means every N hours
  if (hourPart.includes('*/')) {
    const match = hourPart.match(/\*\/(\d+)/);
    if (match) {
      const interval = parseInt(match[1]);
      if (interval > 0 && interval <= 24) {
        const hours: number[] = [];
        for (let h = 0; h < 24; h += interval) {
          hours.push(h);
        }
        return hours;
      }
    }
  }

  // Handle wildcard: "*" means every hour
  if (hourPart === '*') {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  // Handle single hour: "14"
  const hour = parseInt(hourPart);
  if (!isNaN(hour) && hour >= 0 && hour <= 23) {
    return [hour];
  }

  // Fallback
  return [8];
}

/**
 * Calculate next wake time from current time
 * Returns ISO 8601 UTC timestamp
 */
export function calculateNextWake(
  cronExpression: string,
  fromTime?: Date
): string {
  const now = fromTime || new Date();
  const wakeHours = parseWakeHours(cronExpression);

  // Get current hour
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  // Find next wake hour
  let nextWakeHour: number | null = null;
  let isNextDay = false;

  // Look for next wake hour today
  for (const hour of wakeHours) {
    if (hour > currentHour || (hour === currentHour && currentMinute < 30)) {
      nextWakeHour = hour;
      break;
    }
  }

  // If no wake hour found today, use first wake hour tomorrow
  if (nextWakeHour === null) {
    nextWakeHour = wakeHours[0];
    isNextDay = true;
  }

  // Build next wake time
  const nextWake = new Date(now);
  nextWake.setUTCHours(nextWakeHour, 0, 0, 0);

  if (isNextDay) {
    nextWake.setUTCDate(nextWake.getUTCDate() + 1);
  }

  return nextWake.toISOString();
}

/**
 * Get all wake times for a given day
 * Useful for UI display and scheduling
 */
export function getWakeTimesForDay(
  cronExpression: string,
  date: Date
): Date[] {
  const wakeHours = parseWakeHours(cronExpression);

  return wakeHours.map(hour => {
    const wakeTime = new Date(date);
    wakeTime.setUTCHours(hour, 0, 0, 0);
    return wakeTime;
  });
}

/**
 * Count expected wakes per day
 * Matches SQL function fn_parse_cron_wake_count
 */
export function countDailyWakes(cronExpression: string): number {
  const wakeHours = parseWakeHours(cronExpression);
  return wakeHours.length;
}

/**
 * Validate cron expression format
 */
export function isValidCron(cronExpression: string): boolean {
  if (!cronExpression || cronExpression.trim() === '') {
    return false;
  }

  const parts = cronExpression.trim().split(/\s+/);

  // Basic format check: "minute hour * * *"
  if (parts.length !== 5) {
    return false;
  }

  // Validate hour part (index 1)
  const hourPart = parts[1];

  // Valid patterns
  const validPatterns = [
    /^\d+$/, // Single hour: "8"
    /^\d+(,\d+)+$/, // Comma-separated: "8,16,20"
    /^\*\/\d+$/, // Interval: star-slash-N
    /^\*$/, // Wildcard: "*"
  ];

  return validPatterns.some(pattern => pattern.test(hourPart));
}

/**
 * Format next wake time for display
 */
export function formatNextWake(nextWakeISO: string, timezone?: string): string {
  const date = new Date(nextWakeISO);

  if (timezone) {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return date.toISOString();
}
