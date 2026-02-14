export type ReportType = 'line' | 'bar' | 'dot' | 'heatmap' | 'heatmap_temporal';

export type GroupByDimension = 'device' | 'site' | 'program' | 'time';

export type TimeRange = 'last_24h' | 'last_7d' | 'last_30d' | 'this_program' | 'custom';

export type TimeGranularity = '15min' | '30min' | 'hour' | 'day' | 'week';

export type AggregationFunction = 'avg' | 'min' | 'max' | 'sum' | 'count' | 'p50' | 'p90' | 'p95' | 'stddev';

export type MetricType =
  | 'temperature'
  | 'humidity'
  | 'mgi_score'
  | 'mgi_velocity'
  | 'mgi_speed'
  | 'battery_voltage'
  | 'alert_count'
  | 'wake_reliability'
  | 'image_success_rate';

export interface ReportConfiguration {
  reportType: ReportType;
  name: string;
  description?: string;

  // Time settings
  timeRange: TimeRange;
  customStartDate?: string;
  customEndDate?: string;
  timeGranularity: TimeGranularity;
  programId?: string; // For "this_program" time range

  // Data scope
  programIds: string[];
  siteIds: string[];
  deviceIds: string[];
  zoneIds?: string[];

  // Metrics
  metrics: ReportMetric[];

  // Grouping
  groupBy?: GroupByDimension;

  // Comparison settings
  enableComparison: boolean;
  comparisonType?: 'program' | 'device' | 'site';
  comparisonEntities?: string[];

  // Visualization settings
  colorScheme?: string;
  showGrid?: boolean;
  legendPosition?: 'top' | 'right' | 'bottom' | 'left';

  // Advanced
  filters?: ReportFilter[];
}

export interface ReportMetric {
  type: MetricType;
  aggregation: AggregationFunction;
  label?: string;
  color?: string;
  yAxis?: 'primary' | 'secondary'; // For dual-axis charts
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: string | number | string[];
}

export interface CustomReport {
  report_id: string;
  name: string;
  description?: string;
  created_by_user_id: string;
  company_id: string;
  program_id?: string;
  configuration: ReportConfiguration;
  created_at: string;
  updated_at: string;
  created_by_name?: string; // Joined from users table
  created_by_email?: string;
}

export interface ReportSnapshot {
  snapshot_id: string;
  report_id: string;
  company_id: string;
  created_by_user_id: string;
  snapshot_name: string;
  description?: string;
  data_snapshot: any; // The frozen data
  configuration_snapshot: ReportConfiguration;
  created_at: string;
  created_by_name?: string;
}

export interface DeviceMetricData {
  timestamp_bucket: string;
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  avg_temperature: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  avg_humidity: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  avg_mgi_score: number | null;
  min_mgi_score: number | null;
  max_mgi_score: number | null;
  mgi_velocity: number | null;
  mgi_speed: number | null;
  avg_battery_voltage: number | null;
  min_battery_voltage: number | null;
  max_battery_voltage: number | null;
  image_count: number;
  wake_count: number;
}

export interface AlertStatisticsData {
  timestamp_bucket: string;
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  alert_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  avg_resolution_time_hours: number | null;
  resolved_count: number;
  unresolved_count: number;
}

export interface SessionPerformanceData {
  timestamp_bucket: string;
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  session_id: string;
  total_wakes: number;
  completed_wakes: number;
  failed_wakes: number;
  pending_wakes: number;
  image_success_rate: number;
  wake_reliability: number | null;
}

export interface DrillDownRecord {
  image_id: string;
  captured_at: string;
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  session_id: string | null;
  wake_payload_id: string | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  gas_resistance: number | null;
  mgi_score: number | null;
  mgi_velocity: number | null;
  mgi_speed: number | null;
  battery_voltage: number | null;
  image_url: string | null;
  status: string;
}

export interface ComparisonData {
  timestamp_bucket: string;
  program_id: string;
  program_name: string;
  site_id: string;
  site_name: string;
  avg_metric_value: number;
  min_metric_value: number;
  max_metric_value: number;
  data_point_count: number;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number | null;
  label: string;
  metadata?: {
    device_id?: string;
    device_code?: string;
    site_id?: string;
    site_name?: string;
    program_id?: string;
    program_name?: string;
  };
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: (number | null)[];
  borderColor?: string;
  backgroundColor?: string;
  yAxisID?: string;
  metadata?: any;
}

export interface BrushSelection {
  startTime: Date;
  endTime: Date;
  startIndex?: number;
  endIndex?: number;
}

export interface ExportFormat {
  format: 'csv' | 'excel' | 'json' | 'pdf';
  includeRawData: boolean;
  includeAggregatedData: boolean;
  includeVisualization?: boolean; // For PDF
}

export interface CacheEntry {
  cache_id: string;
  cache_key: string;
  company_id: string;
  data: any;
  query_time_ms: number;
  created_at: string;
  expires_at: string;
}

export interface ReportQueryParams {
  companyId: string;
  programIds?: string[];
  siteIds?: string[];
  deviceIds?: string[];
  startDate?: Date;
  endDate?: Date;
  timeGranularity?: TimeGranularity;
  metrics?: MetricType[];
}

export interface DaysSinceLastAlert {
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  last_critical_alert_at: string | null;
  days_since_last_critical: number | null;
}

export interface HeatmapCell {
  rowKey: string;
  rowLabel: string;
  colKey: string;
  colLabel: string;
  value: number | null;
}

export const METRIC_LABELS: Record<MetricType, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  mgi_score: 'MGI Score',
  mgi_velocity: 'MGI Velocity',
  mgi_speed: 'MGI Speed',
  battery_voltage: 'Battery Voltage',
  alert_count: 'Alert Count',
  wake_reliability: 'Wake Reliability',
  image_success_rate: 'Image Success Rate',
};

export const METRIC_UNITS: Record<MetricType, string> = {
  temperature: '\u00B0C',
  humidity: '%',
  mgi_score: 'pts',
  mgi_velocity: 'pts/day',
  mgi_speed: 'pts/hr',
  battery_voltage: 'V',
  alert_count: '',
  wake_reliability: '%',
  image_success_rate: '%',
};

export type MetricScaleGroup = 'percent' | 'ambient' | 'voltage' | 'rate' | 'count' | 'score_rate';

export const METRIC_SCALE_HINTS: Record<MetricType, MetricScaleGroup> = {
  humidity: 'percent',
  mgi_score: 'percent',
  image_success_rate: 'percent',
  wake_reliability: 'percent',
  temperature: 'ambient',
  battery_voltage: 'voltage',
  alert_count: 'count',
  mgi_velocity: 'score_rate',
  mgi_speed: 'score_rate',
};

export function groupMetricsByScale(metricTypes: MetricType[]): {
  primary: MetricType[];
  secondary: MetricType[];
} {
  if (metricTypes.length <= 1) {
    return { primary: metricTypes, secondary: [] };
  }

  const groups = new Map<MetricScaleGroup, MetricType[]>();
  for (const m of metricTypes) {
    const scale = METRIC_SCALE_HINTS[m];
    if (!groups.has(scale)) groups.set(scale, []);
    groups.get(scale)!.push(m);
  }

  const distinctGroups = Array.from(groups.entries());

  if (distinctGroups.length === 1) {
    return { primary: metricTypes, secondary: [] };
  }

  const primary = distinctGroups[0][1];
  const secondary = distinctGroups.slice(1).flatMap(([, metrics]) => metrics);
  return { primary, secondary };
}

export const AGGREGATION_LABELS: Record<AggregationFunction, string> = {
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  sum: 'Sum',
  count: 'Count',
  p50: 'Median (P50)',
  p90: '90th Percentile',
  p95: '95th Percentile',
  stddev: 'Std Deviation',
};

export const DEFAULT_REPORT_CONFIG: ReportConfiguration = {
  reportType: 'line',
  name: '',
  timeRange: 'last_30d',
  timeGranularity: 'day',
  programIds: [],
  siteIds: [],
  deviceIds: [],
  metrics: [{ type: 'mgi_score', aggregation: 'avg' }],
  groupBy: 'device',
  enableComparison: false,
};
