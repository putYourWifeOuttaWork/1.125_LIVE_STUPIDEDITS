import { Thermometer, Droplets, Battery, TrendingUp, TrendingDown, Wind, Gauge } from 'lucide-react';
import type { ZoneMode } from './SiteMapAnalyticsViewer';
import type { DevicePosition } from './SiteMapAnalyticsViewer';

interface ZoneAnalyticsProps {
  devices: DevicePosition[];
  zoneMode: ZoneMode;
}

export default function ZoneAnalytics({ devices, zoneMode }: ZoneAnalyticsProps) {
  if (zoneMode === 'none') return null;

  const devicesWithData = devices.filter(d => {
    if (zoneMode === 'temperature') return d.temperature !== null;
    if (zoneMode === 'humidity') return d.humidity !== null;
    if (zoneMode === 'battery') return d.battery_level !== null;
    if (zoneMode === 'pressure') return d.pressure !== null;
    if (zoneMode === 'gas_resistance') return d.gas_resistance !== null;
    return false;
  });

  if (devicesWithData.length === 0) {
    return null;
  }

  const getValue = (d: DevicePosition): number => {
    if (zoneMode === 'temperature') return d.temperature!;
    if (zoneMode === 'humidity') return d.humidity!;
    if (zoneMode === 'pressure') return d.pressure!;
    if (zoneMode === 'gas_resistance') return d.gas_resistance!;
    return d.battery_level!;
  };

  const values = devicesWithData.map(getValue);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const hotspot = devicesWithData.reduce((prev, curr) =>
    getValue(curr) > getValue(prev) ? curr : prev
  );

  const coldspot = devicesWithData.reduce((prev, curr) =>
    getValue(curr) < getValue(prev) ? curr : prev
  );

  const getIcon = () => {
    if (zoneMode === 'temperature') return <Thermometer size={16} />;
    if (zoneMode === 'humidity') return <Droplets size={16} />;
    if (zoneMode === 'pressure') return <Gauge size={16} />;
    if (zoneMode === 'gas_resistance') return <Wind size={16} />;
    return <Battery size={16} />;
  };

  const getUnit = () => {
    if (zoneMode === 'temperature') return '\u00B0F';
    if (zoneMode === 'humidity' || zoneMode === 'battery') return '%';
    if (zoneMode === 'pressure') return ' hPa';
    if (zoneMode === 'gas_resistance') return ' k\u2126';
    return '';
  };

  const getLabel = () => {
    if (zoneMode === 'temperature') return 'Temperature';
    if (zoneMode === 'humidity') return 'Humidity';
    if (zoneMode === 'pressure') return 'Air Pressure';
    if (zoneMode === 'gas_resistance') return 'Gas Resistance';
    return 'Battery';
  };

  const formatValue = (val: number) => {
    if (zoneMode === 'gas_resistance') return (val / 1000).toFixed(1);
    if (zoneMode === 'pressure') return val.toFixed(0);
    if (zoneMode === 'temperature') return val.toFixed(1);
    if (zoneMode === 'humidity') return val.toFixed(0);
    return val.toFixed(0);
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
            {formatValue(avg)}{getUnit()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Range</div>
          <div className="text-lg font-bold text-gray-900">
            {formatValue(min)} - {formatValue(max)}{getUnit()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Std Dev</div>
          <div className="text-lg font-bold text-gray-900">
            {formatValue(stdDev)}{getUnit()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Sensors</div>
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
              {zoneMode === 'temperature' ? 'Hottest' : zoneMode === 'humidity' ? 'Most Humid' : zoneMode === 'pressure' ? 'Highest Pressure' : zoneMode === 'gas_resistance' ? 'Highest VOC' : 'Highest Battery'}
            </span>
          </div>
          <div className="text-sm font-semibold text-gray-900">{hotspot.device_code}</div>
          <div className="text-lg font-bold text-red-600">
            {formatValue(getValue(hotspot))}{getUnit()}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-blue-600" />
            <span className="text-xs font-medium text-blue-900">
              {zoneMode === 'temperature' ? 'Coolest' : zoneMode === 'humidity' ? 'Least Humid' : zoneMode === 'pressure' ? 'Lowest Pressure' : zoneMode === 'gas_resistance' ? 'Lowest VOC' : 'Lowest Battery'}
            </span>
          </div>
          <div className="text-sm font-semibold text-gray-900">{coldspot.device_code}</div>
          <div className="text-lg font-bold text-blue-600">
            {formatValue(getValue(coldspot))}{getUnit()}
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
