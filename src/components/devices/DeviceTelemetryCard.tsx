import { Thermometer, Droplets, Gauge, Wind, Battery } from 'lucide-react';

interface DeviceTelemetryCardProps {
  telemetryData: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
    gas_resistance?: number;
    battery_voltage?: number;
    battery_health_percent?: number;
    wifi_rssi?: number;
  };
  compact?: boolean;
}

const DeviceTelemetryCard = ({ telemetryData, compact = false }: DeviceTelemetryCardProps) => {
  const metrics = [
    {
      label: 'Temperature',
      value: telemetryData.temperature,
      unit: '°F',
      icon: Thermometer,
      color: 'text-orange-600'
    },
    {
      label: 'Humidity',
      value: telemetryData.humidity,
      unit: '%',
      icon: Droplets,
      color: 'text-blue-600'
    },
    {
      label: 'Pressure',
      value: telemetryData.pressure,
      unit: ' hPa',
      icon: Gauge,
      color: 'text-purple-600'
    },
    {
      label: 'Gas Resistance',
      value: telemetryData.gas_resistance,
      unit: ' kΩ',
      icon: Wind,
      color: 'text-green-600'
    },
    {
      label: 'Battery',
      value: telemetryData.battery_health_percent,
      unit: '%',
      icon: Battery,
      color: 'text-yellow-600'
    }
  ];

  const visibleMetrics = metrics.filter(m => m.value !== undefined && m.value !== null);

  if (visibleMetrics.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No telemetry data available
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3">
        {visibleMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="flex items-center text-sm">
              <Icon size={14} className={`mr-1 ${metric.color}`} />
              <span className="font-medium">{metric.value}{metric.unit}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {visibleMetrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="flex items-start">
            <div className={`p-2 rounded-lg bg-gray-50 mr-3 ${metric.color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{metric.label}</p>
              <p className="text-lg font-semibold">
                {metric.value}{metric.unit}
              </p>
            </div>
          </div>
        );
      })}
      {telemetryData.wifi_rssi && (
        <div className="flex items-start">
          <div className="p-2 rounded-lg bg-gray-50 mr-3 text-cyan-600">
            <Wind size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">WiFi Signal</p>
            <p className="text-lg font-semibold">
              {telemetryData.wifi_rssi} dBm
            </p>
          </div>
        </div>
      )}
      {telemetryData.battery_voltage && (
        <div className="flex items-start">
          <div className="p-2 rounded-lg bg-gray-50 mr-3 text-yellow-600">
            <Battery size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Battery Voltage</p>
            <p className="text-lg font-semibold">
              {telemetryData.battery_voltage}V
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceTelemetryCard;
