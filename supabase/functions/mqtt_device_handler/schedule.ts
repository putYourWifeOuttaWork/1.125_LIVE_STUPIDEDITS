/**
 * Phase 3 - Schedule Module
 * 
 * Parse cron expressions and calculate wake times
 */

import type { WakeBucket, WakeIndexResult } from './types.ts';

/**
 * Parse cron expression to extract expected wake hours
 * Supports: "0 8,16 * * *" and "0 */2 * * *"
 */
export function parseCronExpression(cronExpression: string | null): number[] {
  if (!cronExpression) {
    return [8]; // Default: 8am once per day
  }

  try {
    // Split cron: "minute hour day month weekday"
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 2) {
      return [8];
    }

    const hourPart = parts[1];

    // Handle comma-separated hours: "8,16" → [8, 16]
    if (hourPart.includes(',')) {
      return hourPart.split(',').map(h => parseInt(h.trim(), 10)).filter(h => !isNaN(h) && h >= 0 && h < 24);
    }

    // Handle interval syntax: "*/2" → [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
    if (hourPart.startsWith('*/')) {
      const interval = parseInt(hourPart.substring(2), 10);
      if (isNaN(interval) || interval <= 0 || interval > 24) {
        return [8];
      }
      const hours: number[] = [];
      for (let h = 0; h < 24; h += interval) {
        hours.push(h);
      }
      return hours;
    }

    // Single hour: "8" → [8]
    const singleHour = parseInt(hourPart, 10);
    if (!isNaN(singleHour) && singleHour >= 0 && singleHour < 24) {
      return [singleHour];
    }

    // Wildcard or unknown: default to every hour
    if (hourPart === '*') {
      return Array.from({ length: 24 }, (_, i) => i);
    }

    return [8]; // Fallback
  } catch (err) {
    console.error('[Schedule] Error parsing cron:', err);
    return [8];
  }
}

/**
 * Compute wake buckets for a given date and cron
 */
export function computeWakeBuckets(
  cronExpression: string | null,
  sessionDate: string, // YYYY-MM-DD
  timezone: string
): WakeBucket[] {
  const hours = parseCronExpression(cronExpression);
  
  return hours.map((hour, idx) => ({
    hour,
    index: idx + 1, // 1-based wake index
  }));
}

/**
 * Infer wake window index by snapping captured_at to nearest bucket
 */
export function inferWakeIndex(
  capturedAt: string, // ISO 8601
  wakeBuckets: WakeBucket[]
): WakeIndexResult {
  if (wakeBuckets.length === 0) {
    return { wake_index: 1, is_overage: true };
  }

  const capturedDate = new Date(capturedAt);
  const capturedHour = capturedDate.getUTCHours(); // Use UTC for consistency

  // Find closest bucket
  let minDiff = 24;
  let closestBucket: WakeBucket | null = null;

  for (const bucket of wakeBuckets) {
    const diff = Math.abs(capturedHour - bucket.hour);
    if (diff < minDiff) {
      minDiff = diff;
      closestBucket = bucket;
    }
  }

  if (!closestBucket) {
    return { wake_index: 1, is_overage: true };
  }

  // Overage if more than 1 hour away from any bucket
  const isOverage = minDiff > 1;

  return {
    wake_index: closestBucket.index,
    is_overage: isOverage,
    matched_hour: closestBucket.hour,
  };
}

/**
 * Calculate next wake time after current timestamp
 */
export function calculateNextWake(
  cronExpression: string | null,
  timezone: string,
  fromTime?: Date
): string {
  const now = fromTime || new Date();
  const currentHour = now.getUTCHours();
  const hours = parseCronExpression(cronExpression);

  // Find next hour in schedule
  let nextHour: number | null = null;
  for (const hour of hours) {
    if (hour > currentHour) {
      nextHour = hour;
      break;
    }
  }

  // If no hour found today, use first hour of tomorrow
  if (nextHour === null) {
    nextHour = hours[0];
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(nextHour, 0, 0, 0);
    return tomorrow.toISOString();
  }

  // Set next wake to today at next hour
  const nextWake = new Date(now);
  nextWake.setUTCHours(nextHour, 0, 0, 0);
  return nextWake.toISOString();
}
