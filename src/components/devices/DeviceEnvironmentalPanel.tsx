import { useState, useEffect, useMemo } from 'react';
import { Download, Filter, RefreshCw, Thermometer, Droplets, Gauge, Wind } from 'lucide-react';
import { format } from 'date-fns';
import Button from '../common/Button';
import LoadingScreen from '../common/LoadingScreen';
import DateRangePicker from '../common/DateRangePicker';
import EnvironmentalTrendsChart from '../charts/EnvironmentalTrendsChart';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';

interface DeviceEnvironmentalPanelProps {
  deviceId: string;
}

interface TelemetryReading {
  telemetry_id: string;
  captured_at: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  gas_resistance: number | null;
  battery_voltage: number | null;
  wifi_rssi: number | null;
  program_id: string | null;
  site_id: string | null;
  site_device_session_id: string | null;
}

const DeviceEnvironmentalPanel = ({ deviceId }: DeviceEnvironmentalPanelProps) => {
  const [telemetry, setTelemetry] = useState<TelemetryReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  );
  const [endDate, setEndDate] = useState(new Date().toISOString());

  const fetchTelemetry = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('device_telemetry')
        .select('*')
        .eq('device_id', deviceId)
        .gte('captured_at', startDate)
        .lte('captured_at', endDate)
        .order('captured_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTelemetry(data || []);
    } catch (error) {
      console.error('Error fetching telemetry:', error);
      toast.error('Failed to load environmental data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [deviceId, startDate, endDate]);

  const handleExport = () => {
    setExporting(true);
    try {
      const headers = [
        'Timestamp',
        'Temperature (°F)',
        'Humidity (%)',
        'Pressure (hPa)',
        'Gas Resistance (Ω)',
        'Battery Voltage (V)',
        'WiFi RSSI (dBm)',
        'Program ID',
        'Site ID'
      ].join(',');

      const rows = telemetry.map(reading =>
        [
          format(new Date(reading.captured_at), 'yyyy-MM-dd HH:mm:ss'),
          reading.temperature ?? '',
          reading.humidity ?? '',
          reading.pressure ?? '',
          reading.gas_resistance ?? '',
          reading.battery_voltage ?? '',
          reading.wifi_rssi ?? '',
          reading.program_id ?? '',
          reading.site_id ?? ''
        ].join(',')
      );

      const csv = [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `device-environmental-${deviceId}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Environmental data exported successfully');
    } catch (err) {
      toast.error('Failed to export environmental data');
    } finally {
      setExporting(false);
    }
  };

  // Transform data for D3 chart - MUST be before any early returns (hooks rule)
  const chartData = useMemo(() => {
    return telemetry
      .map(reading => ({
        timestamp: new Date(reading.captured_at),
        temperature: reading.temperature,
        humidity: reading.humidity,
        pressure: reading.pressure,
        gasResistance: reading.gas_resistance
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [telemetry]);

  // Early return AFTER all hooks
  if (loading && telemetry.length === 0) {
    return <LoadingScreen />;
  }

  const avgTemperature = telemetry.length > 0
    ? (telemetry.reduce((sum, r) => sum + (r.temperature || 0), 0) / telemetry.filter(r => r.temperature).length).toFixed(1)
    : 'N/A';

  const avgHumidity = telemetry.length > 0
    ? (telemetry.reduce((sum, r) => sum + (r.humidity || 0), 0) / telemetry.filter(r => r.humidity).length).toFixed(1)
    : 'N/A';

  const avgPressure = telemetry.length > 0
    ? (telemetry.reduce((sum, r) => sum + (r.pressure || 0), 0) / telemetry.filter(r => r.pressure).length).toFixed(0)
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Temperature</p>
              <p className="text-2xl font-bold text-gray-900">{avgTemperature}°F</p>
            </div>
            <Thermometer className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Humidity</p>
              <p className="text-2xl font-bold text-gray-900">{avgHumidity}%</p>
            </div>
            <Droplets className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Pressure</p>
              <p className="text-2xl font-bold text-gray-900">{avgPressure} hPa</p>
            </div>
            <Gauge className="h-8 w-8 text-purple-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Readings</p>
              <p className="text-2xl font-bold text-gray-900">{telemetry.length}</p>
            </div>
            <Wind className="h-8 w-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Environmental Trends Chart */}
      {telemetry.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Environmental Trends</h3>
          <EnvironmentalTrendsChart
            data={chartData}
            width={Math.min(window.innerWidth - 100, 1000)}
            height={400}
            showLegend={true}
          />
          <p className="text-xs text-gray-500 mt-4">
            Click legend items to toggle metrics. Hover over chart to see detailed values.
          </p>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Environmental Readings</h3>
          <p className="text-sm text-gray-500 mt-1">
            Showing {telemetry.length} readings
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Filter size={14} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExport}
            isLoading={exporting}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={fetchTelemetry}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-4 animate-fade-in">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onDateRangeChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
        </div>
      )}

      {/* Telemetry Data Table */}
      {telemetry.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg">
          <Thermometer className="mx-auto h-12 w-12 text-gray-300 mb-2" />
          <p className="text-gray-500">No environmental readings found</p>
          <p className="text-sm text-gray-400 mt-1">
            Readings will appear here as the device wakes and sends telemetry data
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Temperature
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Humidity
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pressure
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gas Resistance
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Battery
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WiFi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {telemetry.map((reading) => (
                  <tr key={reading.telemetry_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(reading.captured_at), 'MMM d, yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reading.temperature !== null ? (
                        <span className="flex items-center">
                          <Thermometer size={14} className="mr-1 text-red-500" />
                          {reading.temperature}°F
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reading.humidity !== null ? (
                        <span className="flex items-center">
                          <Droplets size={14} className="mr-1 text-blue-500" />
                          {reading.humidity}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reading.pressure !== null ? (
                        <span className="flex items-center">
                          <Gauge size={14} className="mr-1 text-purple-500" />
                          {reading.pressure} hPa
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reading.gas_resistance !== null ? (
                        <span className="flex items-center">
                          <Wind size={14} className="mr-1 text-green-500" />
                          {reading.gas_resistance.toLocaleString()} Ω
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reading.battery_voltage !== null ? (
                        `${reading.battery_voltage}V`
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reading.wifi_rssi !== null ? (
                        `${reading.wifi_rssi} dBm`
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceEnvironmentalPanel;
