import { ParsedAction } from '../../services/voiceService';
import { Zone } from '../../hooks/useZones';
import {
  Leaf,
  AlertTriangle,
  Droplets,
  Bell,
  MapPin,
  HelpCircle,
} from 'lucide-react';

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof Leaf }> = {
  LOG_BATCH: { label: 'Log Batch', color: 'bg-primary-100 text-primary-700', icon: Leaf },
  LOG_LOSS: { label: 'Record Loss', color: 'bg-error-100 text-error-700', icon: AlertTriangle },
  LOG_TREATMENT: { label: 'Log Treatment', color: 'bg-secondary-100 text-secondary-700', icon: Droplets },
  ACKNOWLEDGE_ALERT: { label: 'Acknowledge Alert', color: 'bg-warning-100 text-warning-700', icon: Bell },
  CREATE_ZONE: { label: 'Create Zone', color: 'bg-accent-100 text-accent-700', icon: MapPin },
  QUERY: { label: 'Query', color: 'bg-gray-100 text-gray-700', icon: HelpCircle },
};

interface VoiceActionCardProps {
  action: ParsedAction;
  index: number;
  zones: Zone[];
  onUpdateZone: (index: number, zoneId: string) => void;
}

export function VoiceActionCard({ action, index, zones, onUpdateZone }: VoiceActionCardProps) {
  const config = ACTION_CONFIG[action.action_type] || ACTION_CONFIG.QUERY;
  const Icon = config.icon;

  const dataEntries = Object.entries(action.data).filter(
    ([key]) => !['query_type', 'site_id'].includes(key)
  );

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
          <Icon size={12} />
          {config.label}
        </span>
        <span className="text-xs text-gray-400">
          {Math.round(action.confidence * 100)}% confidence
        </span>
      </div>

      {dataEntries.length > 0 && (
        <div className="space-y-1 mb-2">
          {dataEntries.map(([key, value]) => (
            <div key={key} className="flex items-center text-sm">
              <span className="text-gray-500 w-28 flex-shrink-0 capitalize">
                {key.replace(/_/g, ' ')}:
              </span>
              <span className="text-gray-900 font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {action.zone_name && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          <MapPin size={14} className="text-gray-400" />
          {action.zone_resolved ? (
            <span className="text-sm text-primary-700 font-medium">
              Zone: {action.zone_name}
            </span>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm text-warning-600">
                "{action.zone_name}" not found.
              </span>
              <select
                className="text-sm border border-gray-300 rounded px-2 py-1 flex-1"
                defaultValue=""
                onChange={(e) => onUpdateZone(index, e.target.value)}
              >
                <option value="" disabled>
                  Select zone...
                </option>
                {zones.map((z) => (
                  <option key={z.zone_id} value={z.zone_id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
