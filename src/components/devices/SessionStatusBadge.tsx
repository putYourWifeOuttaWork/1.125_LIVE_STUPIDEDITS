import { DeviceSessionStatus } from '../../lib/types';
import { CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';

interface SessionStatusBadgeProps {
  status: DeviceSessionStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<DeviceSessionStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  success: { label: 'Success', color: 'bg-success-100 text-success-800', icon: CheckCircle },
  partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
  failed: { label: 'Failed', color: 'bg-error-100 text-error-800', icon: XCircle },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800', icon: Clock }
};

const SessionStatusBadge = ({ status, size = 'md' }: SessionStatusBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-2.5 py-1';

  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.color} ${sizeClasses}`}>
      <Icon size={iconSize} className="mr-1" />
      {config.label}
    </span>
  );
};

export default SessionStatusBadge;
