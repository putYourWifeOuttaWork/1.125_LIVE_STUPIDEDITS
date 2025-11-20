import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatMGI, formatVelocity, getMGIBadgeClass, getMGILevelDescription } from '../../utils/mgiUtils';

interface DeviceMGIBadgeProps {
  mgiScore: number | null;
  mgiVelocity?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showVelocity?: boolean;
  className?: string;
}

export default function DeviceMGIBadge({
  mgiScore,
  mgiVelocity,
  size = 'md',
  showVelocity = false,
  className = '',
}: DeviceMGIBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  if (mgiScore === null) {
    return (
      <div className={`inline-flex items-center gap-1 rounded-md border bg-gray-100 text-gray-500 ${sizeClasses[size]} ${className}`}>
        <span className="font-medium">MGI: N/A</span>
      </div>
    );
  }

  const velocityIndicator = mgiVelocity !== null && mgiVelocity !== undefined ? (
    Math.abs(mgiVelocity) < 0.01 ? (
      <Minus size={iconSizes[size]} className="text-gray-500" />
    ) : mgiVelocity > 0 ? (
      <TrendingUp size={iconSizes[size]} className="text-red-600" />
    ) : (
      <TrendingDown size={iconSizes[size]} className="text-green-600" />
    )
  ) : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border ${getMGIBadgeClass(mgiScore)} ${sizeClasses[size]} ${className}`}
      title={getMGILevelDescription(mgiScore)}
    >
      <span className="font-semibold">MGI: {formatMGI(mgiScore)}</span>
      {showVelocity && velocityIndicator && (
        <>
          {velocityIndicator}
          <span className="text-xs opacity-80">{formatVelocity(mgiVelocity)}</span>
        </>
      )}
    </div>
  );
}
