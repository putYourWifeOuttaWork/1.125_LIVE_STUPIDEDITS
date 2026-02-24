import { useState } from 'react';
import { ShieldAlert, TrendingUp, TrendingDown, Minus, Clock, Droplets, Thermometer, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import type { VTTRiskState } from '../../utils/vttModel';
import {
  getRiskBgClass,
  getRiskLabel,
  getRiskDescription,
  getRiskColor,
  formatVTTIndex,
  formatRHExcess,
  formatHoursToEscalation,
  formatGrowthFavorability,
  getRiskTrend,
  isRiskEscalating,
} from '../../utils/vttModel';

interface RiskForecastCardProps {
  riskState: VTTRiskState | null | undefined;
  isLoading: boolean;
  onRecalculate?: () => void;
}

function TrendIcon({ trend }: { trend: ReturnType<typeof getRiskTrend> }) {
  switch (trend) {
    case 'rapidly_worsening':
      return <TrendingUp size={16} className="text-red-600" />;
    case 'worsening':
      return <TrendingUp size={16} className="text-orange-500" />;
    case 'improving':
      return <TrendingDown size={16} className="text-green-600" />;
    default:
      return <Minus size={16} className="text-gray-400" />;
  }
}

function TrendLabel({ trend }: { trend: ReturnType<typeof getRiskTrend> }) {
  const labels: Record<string, string> = {
    rapidly_worsening: 'Rapidly Worsening',
    worsening: 'Worsening',
    improving: 'Improving',
    stable: 'Stable',
  };
  const colors: Record<string, string> = {
    rapidly_worsening: 'text-red-600',
    worsening: 'text-orange-500',
    improving: 'text-green-600',
    stable: 'text-gray-500',
  };
  return <span className={`text-xs font-medium ${colors[trend]}`}>{labels[trend]}</span>;
}

function ForecastRow({
  label,
  index,
  riskLevel,
  currentLevel,
}: {
  label: string;
  index: number | null;
  riskLevel: string | null;
  currentLevel: string | null;
}) {
  const escalating = isRiskEscalating(
    currentLevel as VTTRiskState['vtt_risk_level'],
    riskLevel as VTTRiskState['vtt_risk_level']
  );

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500 w-12">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-medium">{formatVTTIndex(index)}</span>
        {riskLevel && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getRiskBgClass(riskLevel as VTTRiskState['vtt_risk_level'])}`}>
            {getRiskLabel(riskLevel as VTTRiskState['vtt_risk_level'])}
          </span>
        )}
        {escalating && <TrendingUp size={12} className="text-red-500" />}
      </div>
    </div>
  );
}

export default function RiskForecastCard({ riskState, isLoading, onRecalculate }: RiskForecastCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold">Mold Risk Forecast</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!riskState) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold">Mold Risk Forecast</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <ShieldAlert size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No risk data available</p>
            <p className="text-xs text-gray-400 mt-1">
              Risk calculations require temperature and humidity readings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const trend = getRiskTrend(
    riskState.vtt_risk_level,
    riskState.forecast_24h_risk,
    riskState.forecast_72h_risk
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: getRiskColor(riskState.vtt_risk_level) }} />
            <h2 className="text-lg font-semibold">Mold Risk Forecast</h2>
          </div>
          <div className="flex items-center gap-2">
            <TrendIcon trend={trend} />
            <TrendLabel trend={trend} />
            {onRecalculate && (
              <button
                onClick={onRecalculate}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                title="Recalculate risk"
              >
                <RefreshCw size={14} className="text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${getRiskBgClass(riskState.vtt_risk_level)}`}>
                {getRiskLabel(riskState.vtt_risk_level)}
              </span>
              <span className="text-2xl font-bold font-mono" style={{ color: getRiskColor(riskState.vtt_risk_level) }}>
                {formatVTTIndex(riskState.vtt_mold_index)}
              </span>
              <span className="text-xs text-gray-400">/ 6.0</span>
            </div>
            <p className="text-sm text-gray-600">{getRiskDescription(riskState.vtt_risk_level)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Droplets size={14} className="text-blue-500" />
              <span className="text-xs text-gray-500">RH Excess</span>
            </div>
            <p className={`text-lg font-bold ${
              riskState.rh_excess !== null && riskState.rh_excess > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {formatRHExcess(riskState.rh_excess)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Above critical threshold</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Thermometer size={14} className="text-orange-500" />
              <span className="text-xs text-gray-500">Favorability</span>
            </div>
            <p className={`text-lg font-bold ${
              riskState.growth_favorability > 0.5 ? 'text-red-600' :
              riskState.growth_favorability > 0.2 ? 'text-amber-600' : 'text-green-600'
            }`}>
              {formatGrowthFavorability(riskState.growth_favorability)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Growth conditions</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={14} className="text-gray-500" />
              <span className="text-xs text-gray-500">Escalation</span>
            </div>
            <p className={`text-lg font-bold ${
              riskState.hours_to_next_level !== null && riskState.hours_to_next_level < 24 ? 'text-red-600' :
              riskState.hours_to_next_level !== null && riskState.hours_to_next_level < 72 ? 'text-amber-600' : 'text-green-600'
            }`}>
              {formatHoursToEscalation(riskState.hours_to_next_level)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">To next level</p>
          </div>
        </div>

        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{expanded ? 'Hide' : 'Show'} forecast details</span>
          </button>

          {expanded && (
            <div className="mt-3 border-t pt-3 space-y-1">
              <p className="text-xs font-medium text-gray-600 mb-2">Projected Risk (current conditions)</p>
              <ForecastRow
                label="Now"
                index={riskState.vtt_mold_index}
                riskLevel={riskState.vtt_risk_level}
                currentLevel={riskState.vtt_risk_level}
              />
              <ForecastRow
                label="24h"
                index={riskState.forecast_24h_index}
                riskLevel={riskState.forecast_24h_risk}
                currentLevel={riskState.vtt_risk_level}
              />
              <ForecastRow
                label="48h"
                index={riskState.forecast_48h_index}
                riskLevel={riskState.forecast_48h_risk}
                currentLevel={riskState.vtt_risk_level}
              />
              <ForecastRow
                label="72h"
                index={riskState.forecast_72h_index}
                riskLevel={riskState.forecast_72h_risk}
                currentLevel={riskState.vtt_risk_level}
              />

              {riskState.latest_temperature_c !== null && riskState.latest_humidity !== null && (
                <div className="mt-3 pt-2 border-t text-xs text-gray-400 space-y-0.5">
                  <p>Calculated from: {((riskState.latest_temperature_c * 9/5) + 32).toFixed(1)} F / {riskState.latest_humidity?.toFixed(0)}% RH</p>
                  {riskState.rh_critical !== null && (
                    <p>Critical RH threshold: {riskState.rh_critical.toFixed(1)}%</p>
                  )}
                  {riskState.last_calculated_at && (
                    <p>Last updated: {new Date(riskState.last_calculated_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
