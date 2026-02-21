import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { ProgramEffectiveStatus } from '../../lib/types';

interface ProgramStatusBadgeProps {
  effectiveStatus?: ProgramEffectiveStatus;
  hasActiveDevices?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig = {
  active: {
    label: 'Active',
    className: 'bg-success-100 text-success-800',
    Icon: CheckCircle,
  },
  expired: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-700',
    Icon: XCircle,
  },
  scheduled: {
    label: 'Scheduled',
    className: 'bg-blue-100 text-blue-800',
    Icon: Clock,
  },
} as const;

const ProgramStatusBadge = ({
  effectiveStatus,
  hasActiveDevices,
  size = 'md',
}: ProgramStatusBadgeProps) => {
  const resolved = effectiveStatus ?? 'expired';
  const config = statusConfig[resolved];
  const iconSize = size === 'sm' ? 10 : 12;

  const showDeviceWarning = resolved === 'expired' && hasActiveDevices;

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
        } rounded-full font-medium ${config.className}`}
      >
        <config.Icon size={iconSize} className="mr-1 flex-shrink-0" />
        {config.label}
      </span>
      {showDeviceWarning && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800"
          title="Devices still assigned -- sessions will continue for data fidelity"
        >
          <AlertTriangle size={10} className="mr-0.5 flex-shrink-0" />
          Devices
        </span>
      )}
    </span>
  );
};

export default ProgramStatusBadge;
