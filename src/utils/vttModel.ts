export type VTTRiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'critical';

export interface VTTRiskState {
  device_id: string;
  company_id: string | null;
  site_id: string | null;
  vtt_mold_index: number;
  vtt_risk_level: VTTRiskLevel;
  latest_temperature_c: number | null;
  latest_humidity: number | null;
  rh_critical: number | null;
  rh_excess: number | null;
  growth_favorability: number;
  forecast_24h_index: number | null;
  forecast_48h_index: number | null;
  forecast_72h_index: number | null;
  forecast_24h_risk: VTTRiskLevel | null;
  forecast_48h_risk: VTTRiskLevel | null;
  forecast_72h_risk: VTTRiskLevel | null;
  hours_to_next_level: number | null;
  last_calculated_at: string | null;
  calculation_inputs: {
    temperature_f?: number;
    temperature_c?: number;
    humidity?: number;
    rh_critical?: number;
    growth_rate_per_hour?: number;
  };
}

export interface SiteRiskSummary {
  site_id: string;
  device_count: number;
  avg_mold_index: number | null;
  max_mold_index: number | null;
  avg_growth_favorability: number | null;
  max_growth_favorability: number | null;
  worst_risk_level: VTTRiskLevel | null;
  avg_rh_excess: number | null;
  devices_above_critical_rh: number;
  worst_24h_forecast: VTTRiskLevel | null;
  worst_72h_forecast: VTTRiskLevel | null;
  min_hours_to_escalation: number | null;
  last_calculated_at: string | null;
  devices: Array<{
    device_id: string;
    vtt_mold_index: number;
    vtt_risk_level: VTTRiskLevel;
    growth_favorability: number;
    rh_excess: number;
    forecast_24h_risk: VTTRiskLevel | null;
    hours_to_next_level: number | null;
  }> | null;
}

const RISK_COLORS: Record<VTTRiskLevel, string> = {
  low: '#10b981',
  moderate: '#3b82f6',
  elevated: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const RISK_BG_COLORS: Record<VTTRiskLevel, string> = {
  low: 'bg-green-100 text-green-800 border-green-300',
  moderate: 'bg-blue-100 text-blue-800 border-blue-300',
  elevated: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

const RISK_LABELS: Record<VTTRiskLevel, string> = {
  low: 'Low Risk',
  moderate: 'Moderate',
  elevated: 'Elevated',
  high: 'High Risk',
  critical: 'Critical',
};

const RISK_DESCRIPTIONS: Record<VTTRiskLevel, string> = {
  low: 'Conditions unfavorable for mold growth',
  moderate: 'Conditions approaching mold growth threshold',
  elevated: 'Active mold growth conditions detected',
  high: 'Significant mold growth risk present',
  critical: 'Severe conditions requiring immediate intervention',
};

export function getRiskColor(level: VTTRiskLevel | null): string {
  return RISK_COLORS[level || 'low'];
}

export function getRiskBgClass(level: VTTRiskLevel | null): string {
  return RISK_BG_COLORS[level || 'low'];
}

export function getRiskLabel(level: VTTRiskLevel | null): string {
  return RISK_LABELS[level || 'low'];
}

export function getRiskDescription(level: VTTRiskLevel | null): string {
  return RISK_DESCRIPTIONS[level || 'low'];
}

export function formatVTTIndex(index: number | null): string {
  if (index === null || index === undefined) return 'N/A';
  return index.toFixed(2);
}

export function formatRHExcess(excess: number | null): string {
  if (excess === null || excess === undefined) return 'N/A';
  const sign = excess > 0 ? '+' : '';
  return `${sign}${excess.toFixed(1)}%`;
}

export function formatHoursToEscalation(hours: number | null): string {
  if (hours === null || hours === undefined) return 'Stable';
  if (hours < 1) return '<1 hour';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

export function formatGrowthFavorability(fav: number | null): string {
  if (fav === null || fav === undefined) return 'N/A';
  return `${(fav * 100).toFixed(0)}%`;
}

export function riskLevelToNumeric(level: VTTRiskLevel | null): number {
  switch (level) {
    case 'low': return 0;
    case 'moderate': return 1;
    case 'elevated': return 2;
    case 'high': return 3;
    case 'critical': return 4;
    default: return 0;
  }
}

export function isRiskEscalating(current: VTTRiskLevel | null, forecast: VTTRiskLevel | null): boolean {
  return riskLevelToNumeric(forecast) > riskLevelToNumeric(current);
}

export function getRiskTrend(
  current: VTTRiskLevel | null,
  forecast24h: VTTRiskLevel | null,
  forecast72h: VTTRiskLevel | null
): 'improving' | 'stable' | 'worsening' | 'rapidly_worsening' {
  const currentNum = riskLevelToNumeric(current);
  const f24Num = riskLevelToNumeric(forecast24h);
  const f72Num = riskLevelToNumeric(forecast72h);

  if (f72Num > currentNum + 1) return 'rapidly_worsening';
  if (f24Num > currentNum || f72Num > currentNum) return 'worsening';
  if (f24Num < currentNum || f72Num < currentNum) return 'improving';
  return 'stable';
}

export function vttIndexToMGINormalized(vttIndex: number): number {
  return Math.min(1, Math.max(0, vttIndex / 6.0));
}
