import { Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DeviceStatusBadgeProps {
  lastSeenAt: string | null;
  isActive: boolean;
  className?: string;
}

const DeviceStatusBadge = ({ lastSeenAt, isActive, className = '' }: DeviceStatusBadgeProps) => {
  if (!isActive) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${className}`}>
        <Circle size={8} className="mr-1 fill-gray-500" />
        Inactive
      </span>
    );
  }

  if (!lastSeenAt) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${className}`}>
        <Circle size={8} className="mr-1 fill-gray-400" />
        Never Seen
      </span>
    );
  }

  const lastSeenDate = new Date(lastSeenAt);
  const now = new Date();
  const hoursSinceLastSeen = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastSeen < 2) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ${className}`}>
        <Circle size={8} className="mr-1 fill-green-500" />
        Online
      </span>
    );
  }

  if (hoursSinceLastSeen < 24) {
    const timeAgo = formatDistanceToNow(lastSeenDate, { addSuffix: true });
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ${className}`}>
        <Circle size={8} className="mr-1 fill-yellow-500" />
        {timeAgo}
      </span>
    );
  }

  const timeAgo = formatDistanceToNow(lastSeenDate, { addSuffix: true });
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 ${className}`}>
      <Circle size={8} className="mr-1 fill-red-500" />
      Offline {timeAgo}
    </span>
  );
};

export default DeviceStatusBadge;
