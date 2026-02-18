import type { DeviceAlert } from '../types/alerts';
import type { ReportConfiguration, MetricType } from '../types/analytics';
import type { ChartAnnotation } from '../components/analytics/LineChartWithBrush';
import { METRIC_LABELS, METRIC_UNITS, METRIC_DISPLAY_SCALE } from '../types/analytics';

export interface AlertInvestigationConfig {
  reportConfig: ReportConfiguration;
  annotations: ChartAnnotation[];
  chartTitle: string;
  yAxisLabel: string;
  secondaryYAxisLabel?: string;
}

function getAlertMetricType(alert: DeviceAlert): MetricType | null {
  const t = alert.alert_type;
  if (t.startsWith('temp_')) return 'temperature';
  if (t.startsWith('rh_')) return 'humidity';
  if (t.startsWith('mgi_max') || t === 'mgi_velocity_warning' || t === 'mgi_velocity_critical') return 'mgi_score';
  if (t === 'mgi_speed_warning' || t === 'mgi_speed_critical') return 'mgi_speed';
  if (t.startsWith('combo_zone')) return 'temperature';
  if (t === 'low_battery') return 'battery_voltage';
  return null;
}

function scaleValue(metric: MetricType, rawValue: number): number {
  const scale = METRIC_DISPLAY_SCALE[metric] ?? 1;
  return rawValue * scale;
}

function buildAbsoluteConfig(alert: DeviceAlert): AlertInvestigationConfig {
  const primaryMetric = getAlertMetricType(alert) || 'temperature';
  const complementary: MetricType[] = [];

  if (primaryMetric === 'temperature') complementary.push('humidity');
  else if (primaryMetric === 'humidity') complementary.push('temperature');
  else if (primaryMetric === 'mgi_score') {
    complementary.push('temperature');
    complementary.push('humidity');
  }

  const allMetrics: MetricType[] = [primaryMetric, ...complementary];
  const hasSecondary = complementary.length > 0;

  const annotations: ChartAnnotation[] = [];
  if (alert.threshold_value !== null) {
    const displayThreshold = scaleValue(primaryMetric, alert.threshold_value);
    annotations.push({
      type: 'threshold_line',
      value: displayThreshold,
      label: `Threshold: ${displayThreshold.toFixed(1)}${METRIC_UNITS[primaryMetric]}`,
      color: alert.severity === 'critical' ? '#dc2626' : '#d97706',
      metricName: primaryMetric,
    });
  }

  if (alert.measurement_timestamp && alert.actual_value !== null) {
    const displayActual = scaleValue(primaryMetric, alert.actual_value);
    annotations.push({
      type: 'highlight_point',
      timestamp: new Date(alert.measurement_timestamp),
      value: displayActual,
      color: '#dc2626',
      metricName: primaryMetric,
    });
    annotations.push({
      type: 'vertical_marker',
      timestamp: new Date(alert.measurement_timestamp),
      label: 'Alert',
      color: '#dc2626',
    });
  }

  return {
    reportConfig: {
      reportType: 'line',
      name: `Alert Investigation: ${alert.message}`,
      timeRange: 'last_30d',
      timeGranularity: 'day',
      programIds: alert.program_id ? [alert.program_id] : [],
      siteIds: alert.site_id ? [alert.site_id] : [],
      deviceIds: [alert.device_id],
      metrics: allMetrics.map((m, i) => ({
        type: m,
        aggregation: 'avg' as const,
        yAxis: (i === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
      })),
      enableComparison: false,
    },
    annotations,
    chartTitle: `${METRIC_LABELS[primaryMetric]} - ${alert.metadata?.device_code || 'Device'} at ${alert.site_name || 'Site'}`,
    yAxisLabel: `${METRIC_LABELS[primaryMetric]} (${METRIC_UNITS[primaryMetric]})`,
    secondaryYAxisLabel: hasSecondary
      ? complementary.map(m => `${METRIC_LABELS[m]} (${METRIC_UNITS[m]})`).join(' / ')
      : undefined,
  };
}

function buildShiftConfig(alert: DeviceAlert): AlertInvestigationConfig {
  const primaryMetric = getAlertMetricType(alert) || 'temperature';

  const annotations: ChartAnnotation[] = [];

  if (alert.threshold_context) {
    const ctx = alert.threshold_context;
    const sessionMin = ctx.session_min ?? ctx.min_value;
    const sessionMax = ctx.session_max ?? ctx.max_value;
    if (sessionMin !== undefined && sessionMax !== undefined) {
      annotations.push({
        type: 'shaded_region',
        y1: scaleValue(primaryMetric, sessionMin),
        y2: scaleValue(primaryMetric, sessionMax),
        color: '#d97706',
        metricName: primaryMetric,
      });
    }
  }

  if (alert.threshold_value !== null) {
    annotations.push({
      type: 'threshold_line',
      value: scaleValue(primaryMetric, alert.threshold_value),
      label: `Max Shift: ${scaleValue(primaryMetric, alert.threshold_value).toFixed(1)}${METRIC_UNITS[primaryMetric]}`,
      color: '#d97706',
      metricName: primaryMetric,
    });
  }

  if (alert.measurement_timestamp && alert.actual_value !== null) {
    annotations.push({
      type: 'highlight_point',
      timestamp: new Date(alert.measurement_timestamp),
      value: scaleValue(primaryMetric, alert.actual_value),
      color: '#dc2626',
      metricName: primaryMetric,
    });
    annotations.push({
      type: 'vertical_marker',
      timestamp: new Date(alert.measurement_timestamp),
      label: 'Shift Detected',
      color: '#dc2626',
    });
  }

  return {
    reportConfig: {
      reportType: 'line',
      name: `Shift Investigation: ${alert.message}`,
      timeRange: 'last_7d',
      timeGranularity: 'hour',
      programIds: alert.program_id ? [alert.program_id] : [],
      siteIds: alert.site_id ? [alert.site_id] : [],
      deviceIds: [alert.device_id],
      metrics: [
        { type: primaryMetric, aggregation: 'avg' as const },
      ],
      enableComparison: false,
    },
    annotations,
    chartTitle: `Intra-Session ${METRIC_LABELS[primaryMetric]} Shift - ${alert.metadata?.device_code || 'Device'}`,
    yAxisLabel: `${METRIC_LABELS[primaryMetric]} (${METRIC_UNITS[primaryMetric]})`,
  };
}

function buildVelocityConfig(alert: DeviceAlert): AlertInvestigationConfig {
  const annotations: ChartAnnotation[] = [];

  if (alert.threshold_value !== null) {
    annotations.push({
      type: 'threshold_line',
      value: scaleValue('mgi_velocity', alert.threshold_value),
      label: `Velocity Threshold: ${scaleValue('mgi_velocity', alert.threshold_value).toFixed(1)}%`,
      color: alert.severity === 'critical' ? '#dc2626' : '#d97706',
      metricName: 'mgi_score',
    });
  }

  if (alert.measurement_timestamp && alert.actual_value !== null) {
    annotations.push({
      type: 'highlight_point',
      timestamp: new Date(alert.measurement_timestamp),
      value: scaleValue('mgi_score', alert.actual_value),
      color: '#dc2626',
      metricName: 'mgi_score',
    });
    annotations.push({
      type: 'vertical_marker',
      timestamp: new Date(alert.measurement_timestamp),
      label: 'Alert',
      color: '#dc2626',
    });
  }

  return {
    reportConfig: {
      reportType: 'line',
      name: `MGI Velocity Investigation: ${alert.message}`,
      timeRange: 'last_30d',
      timeGranularity: 'day',
      programIds: alert.program_id ? [alert.program_id] : [],
      siteIds: alert.site_id ? [alert.site_id] : [],
      deviceIds: [alert.device_id],
      metrics: [
        { type: 'mgi_score', aggregation: 'avg' as const, yAxis: 'primary' as const },
        { type: 'temperature', aggregation: 'avg' as const, yAxis: 'secondary' as const },
        { type: 'humidity', aggregation: 'avg' as const, yAxis: 'secondary' as const },
      ],
      enableComparison: false,
    },
    annotations,
    chartTitle: `MGI Velocity - ${alert.metadata?.device_code || 'Device'} at ${alert.site_name || 'Site'}`,
    yAxisLabel: 'MGI Score (%)',
    secondaryYAxisLabel: 'Temperature / Humidity',
  };
}

function buildSpeedConfig(alert: DeviceAlert): AlertInvestigationConfig {
  const annotations: ChartAnnotation[] = [];

  if (alert.threshold_value !== null) {
    annotations.push({
      type: 'threshold_line',
      value: scaleValue('mgi_speed', alert.threshold_value),
      label: `Speed Threshold: ${scaleValue('mgi_speed', alert.threshold_value).toFixed(1)}%/day`,
      color: alert.severity === 'critical' ? '#dc2626' : '#d97706',
      metricName: 'mgi_score',
    });
  }

  if (alert.measurement_timestamp && alert.actual_value !== null) {
    annotations.push({
      type: 'highlight_point',
      timestamp: new Date(alert.measurement_timestamp),
      value: scaleValue('mgi_score', alert.actual_value),
      color: '#dc2626',
      metricName: 'mgi_score',
    });
    annotations.push({
      type: 'vertical_marker',
      timestamp: new Date(alert.measurement_timestamp),
      label: 'Alert',
      color: '#dc2626',
    });
  }

  return {
    reportConfig: {
      reportType: 'line',
      name: `MGI Speed Investigation: ${alert.message}`,
      timeRange: 'this_program',
      timeGranularity: 'day',
      programIds: alert.program_id ? [alert.program_id] : [],
      siteIds: alert.site_id ? [alert.site_id] : [],
      deviceIds: [alert.device_id],
      metrics: [
        { type: 'mgi_score', aggregation: 'avg' as const },
      ],
      enableComparison: false,
    },
    annotations,
    chartTitle: `MGI Program Speed - ${alert.metadata?.device_code || 'Device'}`,
    yAxisLabel: 'MGI Score (%)',
  };
}

function buildCombinationConfig(alert: DeviceAlert): AlertInvestigationConfig {
  const annotations: ChartAnnotation[] = [];

  if (alert.threshold_context) {
    const ctx = alert.threshold_context;
    if (ctx.temp_threshold !== undefined) {
      annotations.push({
        type: 'threshold_line',
        value: ctx.temp_threshold,
        label: `Temp Threshold: ${ctx.temp_threshold}°C`,
        color: '#dc2626',
        metricName: 'temperature',
      });
    }
    if (ctx.rh_threshold !== undefined) {
      annotations.push({
        type: 'threshold_line',
        value: ctx.rh_threshold,
        label: `RH Threshold: ${ctx.rh_threshold}%`,
        color: '#d97706',
        metricName: 'humidity',
      });
    }
  }

  if (alert.measurement_timestamp) {
    annotations.push({
      type: 'vertical_marker',
      timestamp: new Date(alert.measurement_timestamp),
      label: 'Danger Zone',
      color: '#dc2626',
    });
  }

  return {
    reportConfig: {
      reportType: 'line',
      name: `Danger Zone Investigation: ${alert.message}`,
      timeRange: 'last_30d',
      timeGranularity: 'day',
      programIds: alert.program_id ? [alert.program_id] : [],
      siteIds: alert.site_id ? [alert.site_id] : [],
      deviceIds: [alert.device_id],
      metrics: [
        { type: 'temperature', aggregation: 'avg' as const, yAxis: 'primary' as const },
        { type: 'humidity', aggregation: 'avg' as const, yAxis: 'secondary' as const },
      ],
      enableComparison: false,
    },
    annotations,
    chartTitle: `Danger Zone (Temp + RH) - ${alert.metadata?.device_code || 'Device'}`,
    yAxisLabel: 'Temperature (°C)',
    secondaryYAxisLabel: 'Humidity (%)',
  };
}

export function buildAlertInvestigationConfig(alert: DeviceAlert): AlertInvestigationConfig | null {
  switch (alert.alert_category) {
    case 'absolute':
      return buildAbsoluteConfig(alert);
    case 'shift':
      return buildShiftConfig(alert);
    case 'velocity':
      return buildVelocityConfig(alert);
    case 'speed':
      return buildSpeedConfig(alert);
    case 'combination':
      return buildCombinationConfig(alert);
    case 'system':
      return null;
    default:
      return buildAbsoluteConfig(alert);
  }
}

export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'absolute': return 'Absolute Threshold';
    case 'shift': return 'Intra-Session Shift';
    case 'velocity': return 'MGI Velocity';
    case 'speed': return 'MGI Program Speed';
    case 'combination': return 'Danger Zone';
    case 'system': return 'System Alert';
    default: return category;
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#dc2626';
    case 'error': return '#ea580c';
    case 'warning': return '#d97706';
    default: return '#2563eb';
  }
}
