import { useMemo } from 'react';
import { Thermometer, Droplets, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';

interface DeviceData {
  device_id: string;
  device_code: string;
  zone_label?: string;
  temperature?: number;
  humidity?: number;
  mgi_score?: number;
  x_position?: number;
  y_position?: number;
}

interface ZoneAnalyticsProps {
  devices: DeviceData[];
  zoneMode: 'none' | 'temperature' | 'humidity' | 'mgi';
  className?: string;
}

interface ZoneStats {
  zoneName: string;
  deviceCount: number;
  avgValue: number;
  minValue: number;
  maxValue: number;
  trend: 'up' | 'down' | 'stable';
}

export default function ZoneAnalytics({ devices, zoneMode, className = '' }: ZoneAnalyticsProps) {
  const zoneStats = useMemo(() => {
    if (zoneMode === 'none') return [];

    // Group devices by zone
    const zoneGroups = devices.reduce((acc, device) => {
      const zone = device.zone_label || 'Unassigned';
      if (!acc[zone]) {
        acc[zone] = [];
      }
      acc[zone].push(device);
      return acc;
    }, {} as Record<string, DeviceData[]>);

    // Calculate stats for each zone
    const stats: ZoneStats[] = [];

    Object.entries(zoneGroups).forEach(([zoneName, zoneDevices]) => {
      let values: number[] = [];

      if (zoneMode === 'temperature') {
        values = zoneDevices
          .map(d => d.temperature)
          .filter((v): v is number => v != null);
      } else if (zoneMode === 'humidity') {
        values = zoneDevices
          .map(d => d.humidity)
          .filter((v): v is number => v != null);
      } else if (zoneMode === 'mgi') {
        values = zoneDevices
          .map(d => d.mgi_score)
          .filter((v): v is number => v != null);
      }

      if (values.length > 0) {
        const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);

        // Simple trend based on variance
        const variance = maxValue - minValue;
        const trend: 'up' | 'down' | 'stable' =
          variance > (zoneMode === 'mgi' ? 20 : 5) ? 'up' : 'stable';

        stats.push({
          zoneName,
          deviceCount: zoneDevices.length,
          avgValue,
          minValue,
          maxValue,
          trend,
        });
      }
    });

    // Sort by average value
    return stats.sort((a, b) => b.avgValue - a.avgValue);
  }, [devices, zoneMode]);

  const getIcon = () => {
    switch (zoneMode) {
      case 'temperature':
        return <Thermometer className="w-5 h-5 text-orange-600" />;
      case 'humidity':
        return <Droplets className="w-5 h-5 text-blue-600" />;
      case 'mgi':
        return <Activity className="w-5 h-5 text-purple-600" />;
      default:
        return null;
    }
  };

  const getUnit = () => {
    switch (zoneMode) {
      case 'temperature':
        return '°C';
      case 'humidity':
        return '%';
      case 'mgi':
        return '';
      default:
        return '';
    }
  };

  const getValueColor = (value: number) => {
    if (zoneMode === 'temperature') {
      if (value < 15) return 'text-blue-600';
      if (value < 20) return 'text-green-600';
      if (value < 25) return 'text-yellow-600';
      return 'text-red-600';
    }
    if (zoneMode === 'humidity') {
      if (value < 30) return 'text-red-600';
      if (value < 50) return 'text-yellow-600';
      if (value < 70) return 'text-green-600';
      return 'text-blue-600';
    }
    if (zoneMode === 'mgi') {
      if (value < 25) return 'text-green-600';
      if (value < 50) return 'text-yellow-600';
      if (value < 75) return 'text-orange-600';
      return 'text-red-600';
    }
    return 'text-gray-600';
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  if (zoneMode === 'none' || zoneStats.length === 0) {
    return null;
  }

  const modeLabel =
    zoneMode === 'temperature'
      ? 'Temperature'
      : zoneMode === 'humidity'
      ? 'Humidity'
      : 'MGI Score';

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {getIcon()}
          <h3 className="text-lg font-semibold text-gray-900">Zone Analytics - {modeLabel}</h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zoneStats.map((zone) => (
            <div
              key={zone.zoneName}
              className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-gray-900">{zone.zoneName}</h4>
                  <p className="text-xs text-gray-500">
                    {zone.deviceCount} device{zone.deviceCount !== 1 ? 's' : ''}
                  </p>
                </div>
                {getTrendIcon(zone.trend)}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Average</p>
                  <p className={`text-2xl font-bold ${getValueColor(zone.avgValue)}`}>
                    {zone.avgValue.toFixed(1)}
                    {getUnit()}
                  </p>
                </div>

                <div className="flex justify-between text-sm">
                  <div>
                    <p className="text-xs text-gray-600">Min</p>
                    <p className="font-medium text-gray-700">
                      {zone.minValue.toFixed(1)}
                      {getUnit()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Max</p>
                    <p className="font-medium text-gray-700">
                      {zone.maxValue.toFixed(1)}
                      {getUnit()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Range</p>
                    <p className="font-medium text-gray-700">
                      {(zone.maxValue - zone.minValue).toFixed(1)}
                      {getUnit()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary stats */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-600 mb-1">Overall Average</p>
              <p className={`text-lg font-bold ${getValueColor(
                zoneStats.reduce((sum, z) => sum + z.avgValue, 0) / zoneStats.length
              )}`}>
                {(zoneStats.reduce((sum, z) => sum + z.avgValue, 0) / zoneStats.length).toFixed(1)}
                {getUnit()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Total Zones</p>
              <p className="text-lg font-bold text-gray-900">{zoneStats.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Total Devices</p>
              <p className="text-lg font-bold text-gray-900">
                {zoneStats.reduce((sum, z) => sum + z.deviceCount, 0)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
