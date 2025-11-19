import { Thermometer, Droplets, Battery, TrendingUp, TrendingDown } from 'lucide-react';

interface DevicePosition {
  device_id: string;
  device_code: string;
  device_name: string;
  x: number;
  y: number;
  battery_level: number | null;
  status: string;
  last_seen: string | null;
  temperature: number | null;
  humidity: number | null;
}

interface ZoneAnalyticsProps {
  devices: DevicePosition[];
  zoneMode: 'temperature' | 'humidity' | 'battery';
}

export default function ZoneAnalytics({ devices, zoneMode }: ZoneAnalyticsProps) {
  const devicesWithData = devices.filter(d => {
    if (zoneMode === 'temperature') return d.temperature !== null;
    if (zoneMode === 'humidity') return d.humidity !== null;
    if (zoneMode === 'battery') return d.battery_level !== null;
    return false;
  });

  if (devicesWithData.length === 0) {
    return null;
  }

  const values = devicesWithData.map(d => {
    if (zoneMode === 'temperature') return d.temperature!;
    if (zoneMode === 'humidity') return d.humidity!;
    return d.battery_level!;
  });

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Find hotspot and coldspot
  const hotspot = devicesWithData.reduce((prev, curr) => {
    const prevVal = zoneMode === 'temperature' ? prev.temperature! : zoneMode === 'humidity' ? prev.humidity! : prev.battery_level!;
    const currVal = zoneMode === 'temperature' ? curr.temperature! : zoneMode === 'humidity' ? curr.humidity! : curr.battery_level!;
    return currVal > prevVal ? curr : prev;
  });

  const coldspot = devicesWithData.reduce((prev, curr) => {
    const prevVal = zoneMode === 'temperature' ? prev.temperature! : zoneMode === 'humidity' ? prev.humidity! : prev.battery_level!;
    const currVal = zoneMode === 'temperature' ? curr.temperature! : zoneMode === 'humidity' ? curr.humidity! : curr.battery_level!;
    return currVal < prevVal ? curr : prev;
  });

  const getIcon = () => {
    if (zoneMode === 'temperature') return <Thermometer size={16} />;
    if (zoneMode === 'humidity') return <Droplets size={16} />;
    return <Battery size={16} />;
  };

  const getUnit = () => {
    if (zoneMode === 'temperature') return '°F';
    if (zoneMode === 'humidity' || zoneMode === 'battery') return '%';
    return '';
  };

  const getLabel = () => {
    if (zoneMode === 'temperature') return 'Temperature';
    if (zoneMode === 'humidity') return 'Humidity';
    return 'Battery';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        {getIcon()}
        <h4 className="font-semibold text-gray-900">{getLabel()} Zone Analytics</h4>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Average</div>
          <div className="text-lg font-bold text-gray-900">
            {avg.toFixed(1)}{getUnit()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Range</div>
          <div className="text-lg font-bold text-gray-900">
            {min.toFixed(1)} - {max.toFixed(1)}{getUnit()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Std Dev</div>
          <div className="text-lg font-bold text-gray-900">
            {stdDev.toFixed(2)}{getUnit()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Zones</div>
          <div className="text-lg font-bold text-gray-900">
            {devicesWithData.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-red-600" />
            <span className="text-xs font-medium text-red-900">
              {zoneMode === 'temperature' ? 'Hottest' : zoneMode === 'humidity' ? 'Most Humid' : 'Highest Battery'}
            </span>
          </div>
          <div className="text-sm font-semibold text-gray-900">{hotspot.device_code}</div>
          <div className="text-lg font-bold text-red-600">
            {zoneMode === 'temperature' && hotspot.temperature?.toFixed(1)}
            {zoneMode === 'humidity' && hotspot.humidity?.toFixed(0)}
            {zoneMode === 'battery' && hotspot.battery_level}
            {getUnit()}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-blue-600" />
            <span className="text-xs font-medium text-blue-900">
              {zoneMode === 'temperature' ? 'Coolest' : zoneMode === 'humidity' ? 'Least Humid' : 'Lowest Battery'}
            </span>
          </div>
          <div className="text-sm font-semibold text-gray-900">{coldspot.device_code}</div>
          <div className="text-lg font-bold text-blue-600">
            {zoneMode === 'temperature' && coldspot.temperature?.toFixed(1)}
            {zoneMode === 'humidity' && coldspot.humidity?.toFixed(0)}
            {zoneMode === 'battery' && coldspot.battery_level}
            {getUnit()}
          </div>
        </div>
      </div>

      {stdDev > (avg * 0.15) && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          <strong>High variance detected:</strong> Zone conditions vary significantly across the site.
          Consider investigating outlier zones.
        </div>
      )}
    </div>
  );
}
