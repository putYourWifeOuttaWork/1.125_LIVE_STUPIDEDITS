/**
 * MGI (Mold Growth Index) Utilities
 * 
 * Critical metrics for device health monitoring:
 * - MGI Score: 0-100% mold growth coverage
 * - MGI Velocity: Change in MGI per session
 * - MGI Speed: Change in MGI per day
 */

export interface MGIThresholds {
  healthy: number;
  warning: number;
  concerning: number;
  critical: number;
}

export interface VelocityThresholds {
  normal: number;
  elevated: number;
  high: number;
}

export const MGI_THRESHOLDS: MGIThresholds = {
  healthy: 30,      // 0-30%: Green
  warning: 50,      // 31-50%: Yellow
  concerning: 65,   // 51-65%: Orange
  critical: 65,     // 65%+: Red
};

export const VELOCITY_THRESHOLDS: VelocityThresholds = {
  normal: 3,        // 1-3% per session = small pulse
  elevated: 7,      // 4-7% per session = medium pulse
  high: 12,         // 8-12% per session = large pulse
  // 12%+ = very large and fast pulse
};

export type MGILevel = 'healthy' | 'warning' | 'concerning' | 'critical';

/**
 * Get MGI severity level based on score
 */
export function getMGILevel(mgiScore: number | null): MGILevel {
  if (mgiScore === null || mgiScore < 0) return 'healthy';
  
  if (mgiScore <= MGI_THRESHOLDS.healthy) return 'healthy';
  if (mgiScore <= MGI_THRESHOLDS.warning) return 'warning';
  if (mgiScore <= MGI_THRESHOLDS.concerning) return 'concerning';
  return 'critical';
}

/**
 * Get color for MGI level
 */
export function getMGIColor(mgiScore: number | null): string {
  const level = getMGILevel(mgiScore);
  
  const colors: Record<MGILevel, string> = {
    healthy: '#10b981',      // Green
    warning: '#f59e0b',      // Yellow/Amber
    concerning: '#f97316',   // Orange
    critical: '#ef4444',     // Red
  };
  
  return colors[level];
}

/**
 * Get display color with opacity for backgrounds
 */
export function getMGIColorWithOpacity(mgiScore: number | null, opacity: number = 0.1): string {
  const level = getMGILevel(mgiScore);
  
  const colors: Record<MGILevel, string> = {
    healthy: `rgba(16, 185, 129, ${opacity})`,
    warning: `rgba(245, 158, 11, ${opacity})`,
    concerning: `rgba(249, 115, 22, ${opacity})`,
    critical: `rgba(239, 68, 68, ${opacity})`,
  };
  
  return colors[level];
}

/**
 * Format MGI score for display
 */
export function formatMGI(mgiScore: number | null): string {
  if (mgiScore === null) return 'N/A';
  return `${(mgiScore * 100).toFixed(1)}%`;
}

/**
 * Format MGI velocity for display
 */
export function formatVelocity(velocity: number | null): string {
  if (velocity === null) return 'N/A';
  const sign = velocity > 0 ? '+' : '';
  return `${sign}${(velocity * 100).toFixed(1)}%`;
}

/**
 * Format MGI speed (per day) for display
 */
export function formatSpeed(speed: number | null): string {
  if (speed === null) return 'N/A';
  const sign = speed > 0 ? '+' : '';
  return `${sign}${(speed * 100).toFixed(1)}%/day`;
}

/**
 * Check if velocity is present to show pulse animation (always show if velocity exists)
 */
export function shouldShowVelocityPulse(velocity: number | null): boolean {
  if (velocity === null || velocity === undefined) return false;
  // Always show pulse if there's any velocity (even 0 for minimal pulse)
  return true;
}

/**
 * Get pulse radius based on velocity magnitude
 */
export function getVelocityPulseRadius(velocity: number | null, baseRadius: number = 10): number {
  if (velocity === null) return baseRadius * 1.5; // minimal pulse for no data

  const velocityPercent = Math.abs(velocity * 100);

  // Scale pulse size based on velocity levels
  if (velocityPercent <= VELOCITY_THRESHOLDS.normal) {
    // 0-3%: Small pulse
    return baseRadius * 2;
  } else if (velocityPercent <= VELOCITY_THRESHOLDS.elevated) {
    // 4-7%: Medium pulse
    return baseRadius * 3;
  } else if (velocityPercent <= VELOCITY_THRESHOLDS.high) {
    // 8-12%: Large pulse
    return baseRadius * 4;
  } else {
    // 12%+: Very large pulse
    return baseRadius * 5;
  }
}

/**
 * Get velocity level
 */
export type VelocityLevel = 'small' | 'medium' | 'large' | 'very_large';

export function getVelocityLevel(velocity: number | null): VelocityLevel {
  if (velocity === null) return 'small';

  const velocityPercent = Math.abs(velocity * 100);

  if (velocityPercent <= VELOCITY_THRESHOLDS.normal) return 'small';
  if (velocityPercent <= VELOCITY_THRESHOLDS.elevated) return 'medium';
  if (velocityPercent <= VELOCITY_THRESHOLDS.high) return 'large';
  return 'very_large';
}

/**
 * Get pulse animation duration based on velocity (faster animation = higher velocity)
 */
export function getVelocityPulseDuration(velocity: number | null): number {
  if (velocity === null) return 3000; // slow for no data

  const velocityPercent = Math.abs(velocity * 100);

  // Faster pulse = higher velocity
  if (velocityPercent <= VELOCITY_THRESHOLDS.normal) {
    // 0-3%: Slow pulse
    return 3000; // 3 seconds
  } else if (velocityPercent <= VELOCITY_THRESHOLDS.elevated) {
    // 4-7%: Medium-speed pulse
    return 2200; // 2.2 seconds
  } else if (velocityPercent <= VELOCITY_THRESHOLDS.high) {
    // 8-12%: Fast pulse
    return 1500; // 1.5 seconds
  } else {
    // 12%+: Very fast pulse
    return 1000; // 1 second
  }
}

/**
 * Get MGI badge styling
 */
export function getMGIBadgeClass(mgiScore: number | null): string {
  const level = getMGILevel(mgiScore);
  
  const classes: Record<MGILevel, string> = {
    healthy: 'bg-green-100 text-green-800 border-green-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    concerning: 'bg-orange-100 text-orange-800 border-orange-300',
    critical: 'bg-red-100 text-red-800 border-red-300',
  };
  
  return classes[level];
}

/**
 * Get MGI level description
 */
export function getMGILevelDescription(mgiScore: number | null): string {
  const level = getMGILevel(mgiScore);
  
  const descriptions: Record<MGILevel, string> = {
    healthy: 'Healthy - Low mold growth',
    warning: 'Warning - Moderate growth',
    concerning: 'Concerning - High growth',
    critical: 'Critical - Very high growth',
  };
  
  return descriptions[level];
}
