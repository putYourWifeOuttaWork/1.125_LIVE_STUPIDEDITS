import { ShieldAlert, TrendingUp, AlertTriangle } from 'lucide-react';
import type { SiteRiskSummary, VTTRiskLevel } from '../../utils/vttModel';
import {
  getRiskBgClass,
  getRiskLabel,
  getRiskColor,
  formatVTTIndex,
  formatHoursToEscalation,
  isRiskEscalating,
} from '../../utils/vttModel';

interface SiteRiskBadgeProps {
  siteSummary: SiteRiskSummary | null | undefined;
  isLoading: boolean;
  variant?: 'compact' | 'detailed';
}

function CompactBadge({ siteSummary }: { siteSummary: SiteRiskSummary }) {
  if (!siteSummary.worst_risk_level) return null;

  const escalating = isRiskEscalating(
    siteSummary.worst_risk_level,
    siteSummary.worst_24h_forecast
  );

  return (
    <div className="inline-flex items-center gap-1.5">
      <ShieldAlert size={14} style={{ color: getRiskColor(siteSummary.worst_risk_level) }} />
      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${getRiskBgClass(siteSummary.worst_risk_level)}`}>
        {getRiskLabel(siteSummary.worst_risk_level)}
      </span>
      {escalating && <TrendingUp size={12} className="text-red-500" />}
      {siteSummary.devices_above_critical_rh > 0 && (
        <span className="text-[10px] text-red-600 font-medium">
          {siteSummary.devices_above_critical_rh} above RH
        </span>
      )}
    </div>
  );
}

function DetailedBadge({ siteSummary }: { siteSummary: SiteRiskSummary }) {
  if (!siteSummary.worst_risk_level) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <ShieldAlert size={16} className="text-gray-400" />
        <span>No risk data</span>
      </div>
    );
  }

  const escalating = isRiskEscalating(
    siteSummary.worst_risk_level,
    siteSummary.worst_72h_forecast
  );

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} style={{ color: getRiskColor(siteSummary.worst_risk_level) }} />
          <span className="text-sm font-medium text-gray-700">Site Mold Risk</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getRiskBgClass(siteSummary.worst_risk_level)}`}>
          {getRiskLabel(siteSummary.worst_risk_level)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-gray-500">Worst Index</p>
          <p className="text-sm font-bold font-mono" style={{ color: getRiskColor(siteSummary.worst_risk_level) }}>
            {formatVTTIndex(siteSummary.max_mold_index)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Avg Index</p>
          <p className="text-sm font-bold font-mono text-gray-700">
            {formatVTTIndex(siteSummary.avg_mold_index)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Escalation</p>
          <p className={`text-sm font-bold ${
            siteSummary.min_hours_to_escalation !== null && siteSummary.min_hours_to_escalation < 24
              ? 'text-red-600' : 'text-green-600'
          }`}>
            {formatHoursToEscalation(siteSummary.min_hours_to_escalation)}
          </p>
        </div>
      </div>

      {(siteSummary.devices_above_critical_rh > 0 || escalating) && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
          {siteSummary.devices_above_critical_rh > 0 && (
            <div className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle size={12} />
              <span>{siteSummary.devices_above_critical_rh} of {siteSummary.device_count} devices above critical RH</span>
            </div>
          )}
          {escalating && (
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <TrendingUp size={12} />
              <span>Forecast: {getRiskLabel(siteSummary.worst_72h_forecast)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SiteRiskBadge({ siteSummary, isLoading, variant = 'compact' }: SiteRiskBadgeProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse inline-flex items-center gap-1.5">
        <div className="w-4 h-4 bg-gray-200 rounded" />
        <div className="w-16 h-5 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!siteSummary || siteSummary.device_count === 0) return null;

  if (variant === 'compact') {
    return <CompactBadge siteSummary={siteSummary} />;
  }

  return <DetailedBadge siteSummary={siteSummary} />;
}
