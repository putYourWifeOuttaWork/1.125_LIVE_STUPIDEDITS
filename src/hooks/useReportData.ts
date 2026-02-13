import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ReportConfiguration,
  TimeRange,
  HeatmapCell,
} from '../types/analytics';
import { useActiveCompany } from './useActiveCompany';
import {
  fetchTimeSeriesData,
  fetchAggregatedData,
  fetchDrillDownRecords,
  transformTimeSeriesForD3,
  transformAggregatedForD3,
  TimeSeriesDataPoint as TSPoint,
  AggregatedDataPoint,
} from '../services/analyticsService';

function resolveDateRange(
  timeRange: TimeRange,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  const now = new Date();
  let start: Date;

  switch (timeRange) {
    case 'last_24h':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'last_7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last_30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'this_program':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'custom':
      return {
        start: customStart || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: customEnd || now.toISOString(),
      };
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start: start.toISOString(), end: now.toISOString() };
}

function granularityToInterval(gran: string): string {
  switch (gran) {
    case 'hour':
      return '1 hour';
    case 'day':
      return '1 day';
    case 'week':
      return '1 week';
    default:
      return '1 day';
  }
}

export function useReportData(config: ReportConfiguration, enabled = true) {
  const { activeCompanyId } = useActiveCompany();

  const dateRange = useMemo(
    () =>
      resolveDateRange(
        config.timeRange,
        config.customStartDate,
        config.customEndDate
      ),
    [config.timeRange, config.customStartDate, config.customEndDate]
  );

  const metrics = config.metrics || [];
  const programIds = config.programIds || [];
  const siteIds = config.siteIds || [];
  const deviceIds = config.deviceIds || [];

  const metricNames = useMemo(
    () => metrics.map((m) => m.type),
    [metrics]
  );

  const interval = granularityToInterval(config.timeGranularity);

  const isTimeSeries =
    config.reportType === 'line' || config.reportType === 'dot';
  const isAggregated = config.reportType === 'bar';
  const isHeatmap = config.reportType === 'heatmap_temporal';

  const timeSeriesQuery = useQuery({
    queryKey: [
      'report-timeseries',
      activeCompanyId,
      programIds,
      siteIds,
      deviceIds,
      metricNames,
      dateRange,
      interval,
    ],
    queryFn: () =>
      fetchTimeSeriesData({
        companyId: activeCompanyId!,
        timeStart: dateRange.start,
        timeEnd: dateRange.end,
        programIds: programIds.length > 0 ? programIds : undefined,
        siteIds: siteIds.length > 0 ? siteIds : undefined,
        deviceIds: deviceIds.length > 0 ? deviceIds : undefined,
        metrics: metricNames,
        interval,
      }),
    enabled: enabled && !!activeCompanyId && (isTimeSeries || isHeatmap),
    staleTime: 60_000,
  });

  const aggregatedQuery = useQuery({
    queryKey: [
      'report-aggregated',
      activeCompanyId,
      programIds,
      siteIds,
      deviceIds,
      metricNames,
      dateRange,
      config.groupBy,
      metrics[0]?.aggregation,
    ],
    queryFn: () =>
      fetchAggregatedData({
        companyId: activeCompanyId!,
        timeStart: dateRange.start,
        timeEnd: dateRange.end,
        programIds: programIds.length > 0 ? programIds : undefined,
        siteIds: siteIds.length > 0 ? siteIds : undefined,
        deviceIds: deviceIds.length > 0 ? deviceIds : undefined,
        metrics: metricNames,
        aggregation: metrics[0]?.aggregation || 'avg',
        groupBy: config.groupBy || 'device',
      }),
    enabled: enabled && !!activeCompanyId && isAggregated,
    staleTime: 60_000,
  });

  const lineChartData = useMemo(() => {
    if (!timeSeriesQuery.data || timeSeriesQuery.data.length === 0)
      return null;
    const primaryMetric = metricNames[0] || 'mgi_score';
    return transformTimeSeriesForD3(timeSeriesQuery.data, primaryMetric);
  }, [timeSeriesQuery.data, metricNames]);

  const barChartData = useMemo(() => {
    if (!aggregatedQuery.data || aggregatedQuery.data.length === 0)
      return null;
    return transformAggregatedForD3(aggregatedQuery.data);
  }, [aggregatedQuery.data]);

  const heatmapData = useMemo((): HeatmapCell[] => {
    if (!timeSeriesQuery.data || timeSeriesQuery.data.length === 0) return [];

    const primaryMetric = metricNames[0] || 'mgi_score';
    const filtered = timeSeriesQuery.data.filter(
      (d: TSPoint) => d.metric_name === primaryMetric
    );

    return filtered.map((d: TSPoint) => {
      const rowKey = d.device_id || d.site_id || d.program_id;
      const rowLabel = d.device_code || d.site_name || d.program_name;

      let colLabel: string;
      try {
        const ts = new Date(d.timestamp);
        colLabel =
          config.timeGranularity === 'hour'
            ? `${ts.getMonth() + 1}/${ts.getDate()} ${ts.getHours()}:00`
            : config.timeGranularity === 'week'
              ? `Wk ${Math.ceil(ts.getDate() / 7)} ${ts.toLocaleString('default', { month: 'short' })}`
              : `${ts.getMonth() + 1}/${ts.getDate()}`;
      } catch {
        colLabel = d.timestamp;
      }

      return {
        rowKey,
        rowLabel,
        colKey: d.timestamp,
        colLabel,
        value: d.metric_value,
      };
    });
  }, [timeSeriesQuery.data, metricNames, config.timeGranularity]);

  return {
    lineChartData,
    barChartData,
    heatmapData,
    isLoading:
      timeSeriesQuery.isLoading || aggregatedQuery.isLoading,
    error: timeSeriesQuery.error || aggregatedQuery.error,
    rawTimeSeries: timeSeriesQuery.data || [],
    rawAggregated: aggregatedQuery.data || [],
    dateRange,
  };
}

export function useDrillDown(
  companyId: string | null,
  startTime: Date | null,
  endTime: Date | null,
  options?: {
    programIds?: string[];
    siteIds?: string[];
    deviceIds?: string[];
    offset?: number;
  }
) {
  return useQuery({
    queryKey: [
      'drill-down',
      companyId,
      startTime?.toISOString(),
      endTime?.toISOString(),
      options?.programIds,
      options?.siteIds,
      options?.deviceIds,
      options?.offset,
    ],
    queryFn: () =>
      fetchDrillDownRecords(companyId!, startTime!, endTime!, {
        programIds: options?.programIds,
        siteIds: options?.siteIds,
        deviceIds: options?.deviceIds,
        limit: 50,
        offset: options?.offset || 0,
      }),
    enabled: !!companyId && !!startTime && !!endTime,
    staleTime: 30_000,
  });
}
