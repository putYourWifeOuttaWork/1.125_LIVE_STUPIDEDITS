import { EventSeverity } from '../../lib/types';
import { Info, AlertTriangle, XCircle, AlertOctagon } from 'lucide-react';

interface SeverityIndicatorProps {
  severity: EventSeverity;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const severityConfig: Record<EventSeverity, { label: string; color: string; bgColor: string; icon: typeof Info }> = {
  info: { label: 'Info', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Info },
  warning: { label: 'Warning', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: AlertTriangle },
  error: { label: 'Error', color: 'text-error-600', bgColor: 'bg-error-100', icon: XCircle },
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100', icon: AlertOctagon }
};

const SeverityIndicator = ({ severity, showLabel = false, size = 'md' }: SeverityIndicatorProps) => {
  const config = severityConfig[severity];
  const Icon = config.icon;

  const iconSize = size === 'sm' ? 14 : 16;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  if (showLabel) {
    return (
      <span className={`inline-flex items-center ${textSize} font-medium ${config.color}`}>
        <Icon size={iconSize} className="mr-1" />
        {config.label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${config.bgColor}`}>
      <Icon size={iconSize} className={config.color} />
    </span>
  );
};

export default SeverityIndicator;
