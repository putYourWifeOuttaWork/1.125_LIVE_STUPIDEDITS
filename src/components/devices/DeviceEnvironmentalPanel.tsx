import { useState, useEffect, useMemo } from 'react';
import { Download, Filter, RefreshCw, Thermometer, Droplets, Gauge, Wind, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, subHours, subDays } from 'date-fns';
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
  image_id: string;
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
  wake_payload_id: string | null;
  status: string;
}

type TimeFramePreset = '1h' | '6h' | '24h' | '7d' | '30d' | 'session' | 'custom';
type AggregationLevel = 'raw' | '5min' | '15min' | 'hourly' | 'daily';

interface StatisticalSummary {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendValue: number;
}

const DeviceEnvironmentalPanel = ({ deviceId }: DeviceEnvironmentalPanelProps) => {
  const [telemetry, setTelemetry] = useState<TelemetryReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFramePreset>('7d');
  const [aggregation, setAggregation] = useState<AggregationLevel>('raw');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  );
  const [endDate, setEndDate] = useState(new Date().toISOString());

  // Fetch current session for session-scoped filtering
  useEffect(() => {
    const fetchCurrentSession = async () => {
      try {
        const { data } = await supabase
          .from('devices')
          .select('site_id')
          .eq('device_id', deviceId)
          .single();

        if (data?.site_id) {
          const { data: sessionData } = await supabase
            .from('site_device_sessions')
            .select('session_id, session_date, session_start_time, session_end_time')
            .eq('site_id', data.site_id)
            .eq('status', 'in_progress')
            .order('session_date', { ascending: false })
            .limit(1)
            .single();

          if (sessionData) {
            setCurrentSessionId(sessionData.session_id);
          }
        }
      } catch (error) {
        console.error('Error fetching current session:', error);
      }
    };

    fetchCurrentSession();
  }, [deviceId]);

  const fetchTelemetry = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('device_images')
        .select(`
          image_id,
          captured_at,
          temperature,
          humidity,
          pressure,
          gas_resistance,
          metadata,
          program_id,
          site_id,
          site_device_session_id,
          wake_payload_id,
          status
        `)
        .eq('device_id', deviceId)
        .eq('status', 'complete');  // Only use complete images with valid data

      // Apply time-frame filter
      if (timeFrame === 'session' && currentSessionId) {
        query = query.eq('site_device_session_id', currentSessionId);
      } else {
        query = query
          .gte('captured_at', startDate)
          .lte('captured_at', endDate);
      }

      query = query.order('captured_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to extract wifi_rssi and battery_voltage from metadata
      const transformedData = (data || []).map(row => ({
        ...row,
        wifi_rssi: row.metadata?.wifi_rssi || null,
        battery_voltage: row.metadata?.battery_voltage || null
      }));

      setTelemetry(transformedData);
    } catch (error) {
      console.error('Error fetching telemetry:', error);
      toast.error('Failed to load environmental data');
    } finally {
      setLoading(false);
    }
  };

  // Handle time-frame preset changes
  const handleTimeFrameChange = (preset: TimeFramePreset) => {
    setTimeFrame(preset);
    const now = new Date();

    switch (preset) {
      case '1h':
        setStartDate(subHours(now, 1).toISOString());
        setEndDate(now.toISOString());
        break;
      case '6h':
        setStartDate(subHours(now, 6).toISOString());
        setEndDate(now.toISOString());
        break;
      case '24h':
        setStartDate(subHours(now, 24).toISOString());
        setEndDate(now.toISOString());
        break;
      case '7d':
        setStartDate(subDays(now, 7).toISOString());
        setEndDate(now.toISOString());
        break;
      case '30d':
        setStartDate(subDays(now, 30).toISOString());
        setEndDate(now.toISOString());
        break;
      case 'session':
        // Will be filtered by session_id in query
        break;
      case 'custom':
        setShowFilters(true);
        break;
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [deviceId, startDate, endDate, timeFrame, currentSessionId]);

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

  // Aggregate data based on aggregation level
  const aggregatedData = useMemo(() => {
    if (aggregation === 'raw' || telemetry.length === 0) {
      return telemetry
        .map(reading => ({
          timestamp: new Date(reading.captured_at),
          temperature: reading.temperature,
          humidity: reading.humidity,
          pressure: reading.pressure,
          gasResistance: reading.gas_resistance,
          batteryVoltage: reading.battery_voltage
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    // Determine bucket size in milliseconds
    const bucketSizes: Record<AggregationLevel, number> = {
      'raw': 0,
      '5min': 5 * 60 * 1000,
      '15min': 15 * 60 * 1000,
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000
    };

    const bucketSize = bucketSizes[aggregation];
    const buckets = new Map<number, TelemetryReading[]>();

    // Group readings into time buckets
    telemetry.forEach(reading => {
      const timestamp = new Date(reading.captured_at).getTime();
      const bucketKey = Math.floor(timestamp / bucketSize) * bucketSize;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(reading);
    });

    // Calculate averages for each bucket
    return Array.from(buckets.entries())
      .map(([bucketKey, readings]) => {
        const validTemp = readings.filter(r => r.temperature !== null);
        const validHumidity = readings.filter(r => r.humidity !== null);
        const validPressure = readings.filter(r => r.pressure !== null);
        const validGas = readings.filter(r => r.gas_resistance !== null);
        const validBattery = readings.filter(r => r.battery_voltage !== null);

        return {
          timestamp: new Date(bucketKey),
          temperature: validTemp.length > 0
            ? validTemp.reduce((sum, r) => sum + r.temperature!, 0) / validTemp.length
            : null,
          humidity: validHumidity.length > 0
            ? validHumidity.reduce((sum, r) => sum + r.humidity!, 0) / validHumidity.length
            : null,
          pressure: validPressure.length > 0
            ? validPressure.reduce((sum, r) => sum + r.pressure!, 0) / validPressure.length
            : null,
          gasResistance: validGas.length > 0
            ? validGas.reduce((sum, r) => sum + r.gas_resistance!, 0) / validGas.length
            : null,
          batteryVoltage: validBattery.length > 0
            ? validBattery.reduce((sum, r) => sum + r.battery_voltage!, 0) / validBattery.length
            : null
        };
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [telemetry, aggregation]);

  // Calculate statistical summaries
  const calculateStats = (values: (number | null)[]): StatisticalSummary => {
    const validValues = values.filter((v): v is number => v !== null);

    if (validValues.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        trend: 'stable',
        trendValue: 0
      };
    }

    const sorted = [...validValues].sort((a, b) => a - b);
    const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
    const stdDev = Math.sqrt(variance);

    // Calculate linear trend (simple slope)
    const n = validValues.length;
    const xMean = (n - 1) / 2;
    const slope = validValues.reduce((sum, y, x) => sum + (x - xMean) * (y - mean), 0) /
      validValues.reduce((sum, _, x) => sum + Math.pow(x - xMean, 2), 0);

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(slope) > stdDev * 0.1) {
      trend = slope > 0 ? 'increasing' : 'decreasing';
    }

    return {
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      trend,
      trendValue: slope
    };
  };

  const tempStats = useMemo(() =>
    calculateStats(telemetry.map(r => r.temperature)),
    [telemetry]
  );

  const humidityStats = useMemo(() =>
    calculateStats(telemetry.map(r => r.humidity)),
    [telemetry]
  );

  const pressureStats = useMemo(() =>
    calculateStats(telemetry.map(r => r.pressure)),
    [telemetry]
  );

  // Transform data for D3 chart - MUST be before any early returns (hooks rule)
  const chartData = useMemo(() => aggregatedData, [aggregatedData]);

  // Early return AFTER all hooks
  if (loading && telemetry.length === 0) {
    return <LoadingScreen />;
  }

  const getTrendIcon = (trend: 'increasing' | 'decreasing' | 'stable') => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'decreasing':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Time Frame and Aggregation Controls */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Frame</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: '1h', label: '1 Hour' },
                { value: '6h', label: '6 Hours' },
                { value: '24h', label: '24 Hours' },
                { value: '7d', label: '7 Days' },
                { value: '30d', label: '30 Days' },
                { value: 'session', label: 'Current Session', disabled: !currentSessionId },
                { value: 'custom', label: 'Custom' }
              ].map(({ value, label, disabled }) => (
                <Button
                  key={value}
                  variant={timeFrame === value ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => handleTimeFrameChange(value as TimeFramePreset)}
                  disabled={disabled}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Aggregation</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'raw', label: 'Raw Data' },
                { value: '5min', label: '5-Min Avg' },
                { value: '15min', label: '15-Min Avg' },
                { value: 'hourly', label: 'Hourly Avg' },
                { value: 'daily', label: 'Daily Avg' }
              ].map(({ value, label }) => (
                <Button
                  key={value}
                  variant={aggregation === value ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setAggregation(value as AggregationLevel)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Summary Cards with Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Thermometer className="h-6 w-6 text-red-500" />
              <p className="text-sm font-medium text-gray-700">Temperature</p>
            </div>
            {getTrendIcon(tempStats.trend)}
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline space-x-2">
              <p className="text-2xl font-bold text-gray-900">{tempStats.mean.toFixed(1)}°F</p>
              <p className="text-xs text-gray-500">mean</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-500">σ</p>
                <p className="font-medium text-gray-900">±{tempStats.stdDev.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-500">min</p>
                <p className="font-medium text-gray-900">{tempStats.min.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-500">max</p>
                <p className="font-medium text-gray-900">{tempStats.max.toFixed(1)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Droplets className="h-6 w-6 text-blue-500" />
              <p className="text-sm font-medium text-gray-700">Humidity</p>
            </div>
            {getTrendIcon(humidityStats.trend)}
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline space-x-2">
              <p className="text-2xl font-bold text-gray-900">{humidityStats.mean.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">mean</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-500">σ</p>
                <p className="font-medium text-gray-900">±{humidityStats.stdDev.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-500">min</p>
                <p className="font-medium text-gray-900">{humidityStats.min.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-500">max</p>
                <p className="font-medium text-gray-900">{humidityStats.max.toFixed(1)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Gauge className="h-6 w-6 text-purple-500" />
              <p className="text-sm font-medium text-gray-700">Pressure</p>
            </div>
            {getTrendIcon(pressureStats.trend)}
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline space-x-2">
              <p className="text-2xl font-bold text-gray-900">{pressureStats.mean.toFixed(0)}</p>
              <p className="text-xs text-gray-500">hPa mean</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-500">σ</p>
                <p className="font-medium text-gray-900">±{pressureStats.stdDev.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-gray-500">min</p>
                <p className="font-medium text-gray-900">{pressureStats.min.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-gray-500">max</p>
                <p className="font-medium text-gray-900">{pressureStats.max.toFixed(0)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Quality Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <Wind className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-900">
              {telemetry.length} readings collected
            </span>
          </div>
          <div className="flex items-center space-x-4 text-xs text-blue-700">
            <span>Aggregated: {aggregatedData.length} points</span>
            <span>Time Range: {timeFrame === 'custom' ? 'Custom' : timeFrame.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Environmental Trends Chart */}
      {telemetry.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Environmental Trends</h3>
            <div className="text-xs text-gray-600">
              {aggregation !== 'raw' && (
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Showing {aggregation.toUpperCase()} averages
                </span>
              )}
            </div>
          </div>
          <EnvironmentalTrendsChart
            data={chartData}
            width={Math.min(window.innerWidth - 100, 1000)}
            height={400}
            showLegend={true}
          />
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500">
              <strong>Interaction:</strong> Click legend items to toggle metrics. Hover over chart to see detailed values.
            </p>
            <p className="text-xs text-gray-500">
              <strong>Note:</strong> Trend indicators (↗↘⟷) show statistical direction over the selected time period.
              Standard deviation (σ) measures data variability.
            </p>
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Raw Data Table</h3>
          <p className="text-sm text-gray-500 mt-1">
            {telemetry.length} readings • Last updated: {telemetry.length > 0 ? format(new Date(telemetry[0].captured_at), 'MMM d, HH:mm') : 'N/A'}
          </p>
        </div>
        <div className="flex gap-2">
          {timeFrame === 'custom' && (
            <Button
              variant="outline"
              size="sm"
              icon={<Filter size={14} />}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide' : 'Custom'} Date Range
            </Button>
          )}
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

      {/* Date Range Filter (only for custom timeframe) */}
      {timeFrame === 'custom' && showFilters && (
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
                  <tr key={reading.image_id} className="hover:bg-gray-50">
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
