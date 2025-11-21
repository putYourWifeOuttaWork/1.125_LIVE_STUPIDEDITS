import { Wifi, WifiOff } from 'lucide-react';

interface ConnectivityData {
  status: 'excellent' | 'good' | 'poor' | 'offline' | 'unknown';
  color: string;
  trailing_wakes_expected: number;
  trailing_wakes_actual: number;
  reliability_percent: number | null;
}

interface DeviceConnectivityIndicatorProps {
  connectivity?: ConnectivityData;
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
}

export function DeviceConnectivityIndicator({
  connectivity,
  size = 'small',
  showTooltip = true,
}: DeviceConnectivityIndicatorProps) {
  if (!connectivity) {
    return null;
  }

  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-5 h-5',
    large: 'w-6 h-6',
  };

  const getIconOpacity = () => {
    if (connectivity.status === 'excellent') return 1;
    if (connectivity.status === 'good') return 0.7;
    if (connectivity.status === 'poor') return 0.4;
    return 0.2;
  };

  const getTooltipText = () => {
    if (connectivity.status === 'unknown') {
      return 'No wake schedule configured';
    }

    const { trailing_wakes_actual, trailing_wakes_expected, reliability_percent } = connectivity;

    return `Wake Reliability: ${trailing_wakes_actual}/${trailing_wakes_expected} (${
      reliability_percent?.toFixed(0) ?? 0
    }%)\nLast 3 expected wakes`;
  };

  const isOffline = connectivity.status === 'offline' || connectivity.status === 'poor';

  return (
    <div
      className="relative inline-block"
      title={showTooltip ? getTooltipText() : undefined}
    >
      {isOffline ? (
        <WifiOff
          className={sizeClasses[size]}
          style={{
            color: connectivity.color,
            opacity: getIconOpacity(),
          }}
          strokeWidth={2.5}
        />
      ) : (
        <Wifi
          className={sizeClasses[size]}
          style={{
            color: connectivity.color,
            opacity: getIconOpacity(),
          }}
          strokeWidth={2.5}
        />
      )}

      {connectivity.status !== 'unknown' && (
        <div
          className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-white"
          style={{ backgroundColor: connectivity.color }}
        />
      )}
    </div>
  );
}
