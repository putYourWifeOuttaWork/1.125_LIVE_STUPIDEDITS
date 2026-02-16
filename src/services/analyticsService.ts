import { supabase } from '../lib/supabaseClient';
import {
  CustomReport,
  ReportSnapshot,
  ReportSnapshotSchedule,
  SnapshotCadence,
  DeviceMetricData,
  AlertStatisticsData,
  SessionPerformanceData,
  DrillDownRecord,
  ComparisonData,
  DaysSinceLastAlert,
  ReportConfiguration,
  ReportQueryParams,
  CacheEntry,
  METRIC_LABELS,
  MetricType,
} from '../types/analytics';

// Cache configuration
const CACHE_TTL_MINUTES = 5;

/**
 * Simple hash function for generating cache keys
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate a cache key from query parameters
 */
function generateCacheKey(params: any): string {
  const sortedParams = JSON.stringify(params, Object.keys(params).sort());
  return simpleHash(sortedParams);
}

/**
 * Check if cache entry exists and is valid
 */
async function getCachedData(cacheKey: string, companyId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('report_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .eq('company_id', companyId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
}

/**
 * Save data to cache
 */
async function setCachedData(
  cacheKey: string,
  companyId: string,
  data: any,
  queryTimeMs: number
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + CACHE_TTL_MINUTES);

    await supabase.from('report_cache').upsert({
      cache_key: cacheKey,
      company_id: companyId,
      data,
      query_time_ms: queryTimeMs,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error setting cached data:', error);
  }
}

/**
 * Fetch device metrics over time
 */
export async function fetchDeviceMetricsOverTime(
  params: ReportQueryParams
): Promise<DeviceMetricData[]> {
  const cacheKey = generateCacheKey({ fn: 'device_metrics', ...params });

  // Check cache first
  const cachedData = await getCachedData(cacheKey, params.companyId);
  if (cachedData) {
    return cachedData;
  }

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_device_metrics_over_time', {
      p_company_id: params.companyId,
      p_program_ids: params.programIds || null,
      p_site_ids: params.siteIds || null,
      p_device_ids: params.deviceIds || null,
      p_start_date: params.startDate?.toISOString() || null,
      p_end_date: params.endDate?.toISOString() || null,
      p_time_granularity: params.timeGranularity || 'hour',
      p_metrics: params.metrics || ['temperature', 'humidity', 'mgi_score', 'battery_voltage'],
    });

    if (error) throw error;

    const queryTimeMs = Date.now() - startTime;

    // Cache the result
    await setCachedData(cacheKey, params.companyId, data, queryTimeMs);

    return data || [];
  } catch (error) {
    console.error('Error fetching device metrics:', error);
    throw error;
  }
}

/**
 * Fetch alert statistics
 */
export async function fetchAlertStatistics(
  params: ReportQueryParams
): Promise<AlertStatisticsData[]> {
  const cacheKey = generateCacheKey({ fn: 'alert_stats', ...params });

  const cachedData = await getCachedData(cacheKey, params.companyId);
  if (cachedData) {
    return cachedData;
  }

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_alert_statistics', {
      p_company_id: params.companyId,
      p_program_ids: params.programIds || null,
      p_site_ids: params.siteIds || null,
      p_device_ids: params.deviceIds || null,
      p_start_date: params.startDate?.toISOString() || null,
      p_end_date: params.endDate?.toISOString() || null,
      p_time_granularity: params.timeGranularity || 'day',
    });

    if (error) throw error;

    const queryTimeMs = Date.now() - startTime;
    await setCachedData(cacheKey, params.companyId, data, queryTimeMs);

    return data || [];
  } catch (error) {
    console.error('Error fetching alert statistics:', error);
    throw error;
  }
}

/**
 * Fetch session performance metrics
 */
export async function fetchSessionPerformance(
  params: ReportQueryParams
): Promise<SessionPerformanceData[]> {
  const cacheKey = generateCacheKey({ fn: 'session_perf', ...params });

  const cachedData = await getCachedData(cacheKey, params.companyId);
  if (cachedData) {
    return cachedData;
  }

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_session_performance', {
      p_company_id: params.companyId,
      p_program_ids: params.programIds || null,
      p_site_ids: params.siteIds || null,
      p_device_ids: params.deviceIds || null,
      p_start_date: params.startDate?.toISOString() || null,
      p_end_date: params.endDate?.toISOString() || null,
      p_time_granularity: params.timeGranularity || 'day',
    });

    if (error) throw error;

    const queryTimeMs = Date.now() - startTime;
    await setCachedData(cacheKey, params.companyId, data, queryTimeMs);

    return data || [];
  } catch (error) {
    console.error('Error fetching session performance:', error);
    throw error;
  }
}

/**
 * Fetch drill-down records for a specific time range (used after brushing)
 */
export async function fetchDrillDownRecords(
  companyId: string,
  startTime: Date,
  endTime: Date,
  options?: {
    programIds?: string[];
    siteIds?: string[];
    deviceIds?: string[];
    limit?: number;
    offset?: number;
  }
): Promise<{ records: DrillDownRecord[]; hasMore: boolean }> {
  try {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    console.log('[DrillDown] Fetching records:', {
      companyId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      programIds: options?.programIds,
      siteIds: options?.siteIds,
      deviceIds: options?.deviceIds,
      limit,
      offset,
    });

    // Use the existing get_analytics_drill_down function
    const { data, error } = await supabase.rpc('get_analytics_drill_down', {
      p_company_id: companyId,
      p_time_start: startTime.toISOString(),
      p_time_end: endTime.toISOString(),
      p_program_ids: (options?.programIds && options.programIds.length > 0) ? options.programIds : null,
      p_site_ids: (options?.siteIds && options.siteIds.length > 0) ? options.siteIds : null,
      p_device_ids: (options?.deviceIds && options.deviceIds.length > 0) ? options.deviceIds : null,
      p_limit: limit + 1, // Fetch one extra to check if there are more
      p_offset: offset,
    });

    if (error) {
      console.error('[DrillDown] RPC error:', error);
      throw error;
    }

    console.log('[DrillDown] Raw data received:', data?.length || 0, 'records');

    const hasMore = data && data.length > limit;
    const records = hasMore ? data.slice(0, limit) : data || [];

    // Map the DrillDownImage structure to DrillDownRecord
    const mappedRecords: DrillDownRecord[] = records.map((img: any) => ({
      image_id: img.image_id,
      captured_at: img.captured_at,
      device_id: img.device_id,
      device_code: img.device_code,
      site_id: img.site_id,
      site_name: img.site_name,
      program_id: img.program_id,
      program_name: img.program_name,
      session_id: img.site_device_session_id,
      wake_payload_id: img.wake_payload_id,
      temperature: img.temperature,
      humidity: img.humidity,
      pressure: img.pressure ?? null,
      gas_resistance: img.gas_resistance ?? null,
      mgi_score: img.mgi_score,
      mgi_velocity: img.mgi_velocity ?? null,
      mgi_speed: img.mgi_speed ?? null,
      battery_voltage: img.battery_voltage ?? null,
      image_url: img.image_url,
      status: 'complete',
    }));

    console.log('[DrillDown] Mapped records:', mappedRecords.length, 'hasMore:', hasMore);

    return { records: mappedRecords, hasMore };
  } catch (error) {
    console.error('[DrillDown] Error fetching drill-down records:', error);
    throw error;
  }
}

/**
 * Compare same site across different programs
 */
export async function compareSiteAcrossPrograms(
  companyId: string,
  siteId: string,
  programIds: string[],
  metric: string = 'mgi_score',
  timeGranularity: string = 'day'
): Promise<ComparisonData[]> {
  const cacheKey = generateCacheKey({
    fn: 'compare_site',
    companyId,
    siteId,
    programIds,
    metric,
    timeGranularity,
  });

  const cachedData = await getCachedData(cacheKey, companyId);
  if (cachedData) {
    return cachedData;
  }

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('compare_site_across_programs', {
      p_company_id: companyId,
      p_site_id: siteId,
      p_program_ids: programIds,
      p_metric: metric,
      p_time_granularity: timeGranularity,
    });

    if (error) throw error;

    const queryTimeMs = Date.now() - startTime;
    await setCachedData(cacheKey, companyId, data, queryTimeMs);

    return data || [];
  } catch (error) {
    console.error('Error comparing site across programs:', error);
    throw error;
  }
}

/**
 * Get days since last critical alert per device
 */
export async function fetchDaysSinceLastCriticalAlert(
  companyId: string,
  deviceIds?: string[]
): Promise<DaysSinceLastAlert[]> {
  const cacheKey = generateCacheKey({
    fn: 'days_since_alert',
    companyId,
    deviceIds,
  });

  const cachedData = await getCachedData(cacheKey, companyId);
  if (cachedData) {
    return cachedData;
  }

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_days_since_last_critical_alert', {
      p_company_id: companyId,
      p_device_ids: deviceIds || null,
    });

    if (error) throw error;

    const queryTimeMs = Date.now() - startTime;
    await setCachedData(cacheKey, companyId, data, queryTimeMs);

    return data || [];
  } catch (error) {
    console.error('Error fetching days since last critical alert:', error);
    throw error;
  }
}

/**
 * Get all reports for a company
 */
export async function fetchReports(companyId: string): Promise<CustomReport[]> {
  try {
    const { data, error } = await supabase
      .from('custom_reports')
      .select(`
        *,
        created_by:created_by_user_id(
          id,
          email,
          full_name
        )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((report) => ({
      ...report,
      created_by_name: report.created_by
        ? report.created_by.full_name || report.created_by.email
        : 'Unknown',
      created_by_email: report.created_by?.email,
    }));
  } catch (error) {
    console.error('Error fetching reports:', error);
    throw error;
  }
}

/**
 * Get a single report by ID
 */
export async function fetchReportById(reportId: string): Promise<CustomReport | null> {
  try {
    const { data, error } = await supabase
      .from('custom_reports')
      .select(`
        *,
        created_by:created_by_user_id(
          id,
          email,
          full_name
        )
      `)
      .eq('report_id', reportId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      created_by_name: data.created_by
        ? data.created_by.full_name || data.created_by.email
        : 'Unknown',
      created_by_email: data.created_by?.email,
    };
  } catch (error) {
    console.error('Error fetching report:', error);
    throw error;
  }
}

/**
 * Create a new report
 */
export async function createReport(
  companyId: string,
  name: string,
  configuration: ReportConfiguration,
  description?: string,
  programId?: string
): Promise<CustomReport> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('custom_reports')
      .insert({
        name,
        description,
        company_id: companyId,
        program_id: programId,
        configuration,
        created_by_user_id: userData.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating report:', error);
    throw error;
  }
}

/**
 * Update an existing report
 */
export async function updateReport(
  reportId: string,
  updates: {
    name?: string;
    description?: string;
    configuration?: ReportConfiguration;
  },
  companyId?: string
): Promise<CustomReport> {
  try {
    let query = supabase
      .from('custom_reports')
      .update(updates)
      .eq('report_id', reportId);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query.select().maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Report not found or you do not have permission to update it');
    return data;
  } catch (error) {
    console.error('Error updating report:', error);
    throw error;
  }
}

/**
 * Delete a report
 */
export async function deleteReport(reportId: string, companyId?: string): Promise<void> {
  try {
    let query = supabase.from('custom_reports').delete().eq('report_id', reportId);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { error } = await query;

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting report:', error);
    throw error;
  }
}

/**
 * Clone a report (save as)
 */
export async function cloneReport(
  reportId: string,
  newName: string,
  companyId: string
): Promise<CustomReport> {
  try {
    const original = await fetchReportById(reportId);
    if (!original) throw new Error('Report not found');

    return await createReport(
      companyId,
      newName,
      original.configuration,
      original.description ? `Cloned from: ${original.name}` : undefined,
      original.program_id
    );
  } catch (error) {
    console.error('Error cloning report:', error);
    throw error;
  }
}

/**
 * Create a snapshot of a report
 */
export async function createSnapshot(
  reportId: string,
  companyId: string,
  snapshotName: string,
  data: any,
  configuration: ReportConfiguration,
  description?: string
): Promise<ReportSnapshot> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('User not authenticated');

    const { data: snapshot, error } = await supabase
      .from('report_snapshots')
      .insert({
        report_id: reportId,
        company_id: companyId,
        created_by_user_id: userData.user.id,
        snapshot_name: snapshotName,
        description,
        data_snapshot: data,
        configuration_snapshot: configuration,
      })
      .select()
      .single();

    if (error) throw error;
    return snapshot;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw error;
  }
}

/**
 * Get snapshots for a report
 */
export async function fetchSnapshotsForReport(reportId: string): Promise<ReportSnapshot[]> {
  try {
    const { data, error } = await supabase
      .from('report_snapshots')
      .select(`
        *,
        created_by:created_by_user_id(
          id,
          email,
          full_name
        )
      `)
      .eq('report_id', reportId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST200') {
        const { data: snapshots, error: fallbackError } = await supabase
          .from('report_snapshots')
          .select('*')
          .eq('report_id', reportId)
          .order('created_at', { ascending: false });

        if (fallbackError) throw fallbackError;

        const userIds = [...new Set((snapshots || []).map((s: any) => s.created_by_user_id).filter(Boolean))];
        let userMap: Record<string, { full_name: string; email: string }> = {};

        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id, email, full_name')
            .in('id', userIds);

          if (users) {
            userMap = Object.fromEntries(users.map((u: any) => [u.id, u]));
          }
        }

        return (snapshots || []).map((snapshot: any) => ({
          ...snapshot,
          created_by: snapshot.created_by_user_id ? userMap[snapshot.created_by_user_id] || null : null,
          created_by_name: snapshot.created_by_user_id && userMap[snapshot.created_by_user_id]
            ? userMap[snapshot.created_by_user_id].full_name || userMap[snapshot.created_by_user_id].email
            : 'Unknown',
        }));
      }
      throw error;
    }

    return (data || []).map((snapshot) => ({
      ...snapshot,
      created_by_name: snapshot.created_by
        ? snapshot.created_by.full_name || snapshot.created_by.email
        : 'Unknown',
    }));
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    throw error;
  }
}

/**
 * Update a snapshot's name and/or description
 */
export async function updateSnapshot(
  snapshotId: string,
  updates: { snapshot_name?: string; description?: string }
): Promise<ReportSnapshot> {
  try {
    const { data, error } = await supabase
      .from('report_snapshots')
      .update(updates)
      .eq('snapshot_id', snapshotId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating snapshot:', error);
    throw error;
  }
}

/**
 * Delete a snapshot
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  try {
    const { error } = await supabase.from('report_snapshots').delete().eq('snapshot_id', snapshotId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting snapshot:', error);
    throw error;
  }
}

// ============================================================
// SNAPSHOT SCHEDULE FUNCTIONS
// ============================================================

export async function fetchScheduleForReport(reportId: string): Promise<ReportSnapshotSchedule | null> {
  const { data, error } = await supabase
    .from('report_snapshot_schedules')
    .select('*')
    .eq('report_id', reportId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertSnapshotSchedule(params: {
  reportId: string;
  companyId: string;
  cadence: SnapshotCadence;
  snapshotTime: string;
  timezone: string;
  enabled?: boolean;
}): Promise<ReportSnapshotSchedule> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('report_snapshot_schedules')
    .upsert(
      {
        report_id: params.reportId,
        company_id: params.companyId,
        cadence: params.cadence,
        snapshot_time: params.snapshotTime,
        timezone: params.timezone,
        enabled: params.enabled ?? true,
        created_by_user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'report_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSnapshotSchedule(scheduleId: string): Promise<void> {
  const { error } = await supabase
    .from('report_snapshot_schedules')
    .delete()
    .eq('schedule_id', scheduleId);

  if (error) throw error;
}

export async function toggleSnapshotSchedule(scheduleId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('report_snapshot_schedules')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('schedule_id', scheduleId);

  if (error) throw error;
}

/**
 * Clean up expired cache entries (should be called periodically)
 */
export async function cleanupExpiredCache(): Promise<void> {
  try {
    await supabase.rpc('cleanup_expired_cache');
  } catch (error) {
    console.error('Error cleaning up expired cache:', error);
  }
}

// ============================================================
// NEW ANALYTICS FUNCTIONS (Advanced Query Interface)
// ============================================================

export interface TimeSeriesDataPoint {
  timestamp: string;
  metric_name: string;
  metric_value: number;
  device_id: string;
  device_code: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
}

export interface AggregatedDataPoint {
  group_key: string;
  group_id: string | null;
  metric_name: string;
  metric_value: number;
  record_count: number;
}

export interface ComparisonDataPoint {
  timestamp: string;
  entity_id: string;
  entity_name: string;
  metric_name: string;
  metric_value: number;
}

export interface DrillDownImage {
  image_id: string;
  device_id: string;
  device_code: string;
  site_name: string;
  program_name: string;
  captured_at: string;
  mgi_score: number | null;
  temperature: number | null;
  humidity: number | null;
  image_url: string | null;
}

/**
 * Fetch time-series data with multiple metrics (for line charts)
 */
export async function fetchTimeSeriesData(params: {
  companyId: string;
  timeStart: string;
  timeEnd: string;
  programIds?: string[];
  siteIds?: string[];
  deviceIds?: string[];
  metrics?: string[];
  interval?: string;
}): Promise<TimeSeriesDataPoint[]> {
  try {
    const { data, error } = await supabase.rpc('get_analytics_time_series', {
      p_company_id: params.companyId,
      p_time_start: params.timeStart,
      p_time_end: params.timeEnd,
      p_program_ids: params.programIds || null,
      p_site_ids: params.siteIds || null,
      p_device_ids: params.deviceIds || null,
      p_metrics: params.metrics || ['mgi_score', 'temperature', 'humidity'],
      p_interval: params.interval || '1 hour'
    });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      ...row,
      timestamp: row.timestamp_bucket ?? row.timestamp,
    }));
  } catch (error) {
    console.error('Error fetching time series data:', error);
    throw error;
  }
}

/**
 * Fetch aggregated metrics grouped by dimension (for bar charts)
 */
export async function fetchAggregatedData(params: {
  companyId: string;
  timeStart: string;
  timeEnd: string;
  programIds?: string[];
  siteIds?: string[];
  deviceIds?: string[];
  metrics?: string[];
  aggregation?: 'avg' | 'sum' | 'min' | 'max';
  groupBy?: 'device' | 'site' | 'program';
}): Promise<AggregatedDataPoint[]> {
  try {
    const { data, error } = await supabase.rpc('get_analytics_aggregated', {
      p_company_id: params.companyId,
      p_time_start: params.timeStart,
      p_time_end: params.timeEnd,
      p_program_ids: params.programIds || null,
      p_site_ids: params.siteIds || null,
      p_device_ids: params.deviceIds || null,
      p_metrics: params.metrics || ['mgi_score'],
      p_aggregation: params.aggregation || 'avg',
      p_group_by: params.groupBy || 'device'
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching aggregated data:', error);
    throw error;
  }
}

/**
 * Fetch comparison data across entities (for comparison charts)
 */
export async function fetchComparisonData(params: {
  companyId: string;
  timeStart: string;
  timeEnd: string;
  entityType: 'program' | 'site' | 'device';
  entityIds: string[];
  metrics?: string[];
  interval?: string;
}): Promise<ComparisonDataPoint[]> {
  try {
    const { data, error } = await supabase.rpc('get_analytics_comparison', {
      p_company_id: params.companyId,
      p_time_start: params.timeStart,
      p_time_end: params.timeEnd,
      p_entity_type: params.entityType,
      p_entity_ids: params.entityIds,
      p_metrics: params.metrics || ['mgi_score'],
      p_interval: params.interval || '1 day'
    });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      ...row,
      timestamp: row.timestamp_bucket ?? row.timestamp,
    }));
  } catch (error) {
    console.error('Error fetching comparison data:', error);
    throw error;
  }
}

/**
 * Fetch drill-down image details (for detailed view after brushing)
 */
export async function fetchDrillDownImages(params: {
  companyId: string;
  timeStart: string;
  timeEnd: string;
  programIds?: string[];
  siteIds?: string[];
  deviceIds?: string[];
  limit?: number;
  offset?: number;
}): Promise<DrillDownImage[]> {
  try {
    const { data, error } = await supabase.rpc('get_analytics_drill_down', {
      p_company_id: params.companyId,
      p_time_start: params.timeStart,
      p_time_end: params.timeEnd,
      p_program_ids: params.programIds || null,
      p_site_ids: params.siteIds || null,
      p_device_ids: params.deviceIds || null,
      p_limit: params.limit || 1000,
      p_offset: params.offset || 0
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching drill-down images:', error);
    throw error;
  }
}

export interface MultiMetricSeries {
  id: string;
  label: string;
  values: (number | null)[];
  metricName: string;
  color?: string;
  lineStyle?: 'solid' | 'dashed';
}

export interface MultiMetricChartData {
  timestamps: Date[];
  series: MultiMetricSeries[];
}

const DEVICE_BASE_COLORS = [
  ['#2563eb', '#93c5fd'],
  ['#059669', '#6ee7b7'],
  ['#d97706', '#fcd34d'],
  ['#dc2626', '#fca5a5'],
  ['#0891b2', '#67e8f9'],
  ['#7c3aed', '#c4b5fd'],
];

export function transformTimeSeriesForD3(
  data: TimeSeriesDataPoint[],
  metricNames: string | string[]
): MultiMetricChartData {
  const metrics = Array.isArray(metricNames) ? metricNames : [metricNames];
  const filtered = data.filter(d => metrics.includes(d.metric_name));

  const isMultiMetric = metrics.length > 1;
  const deviceCodes = Array.from(new Set(filtered.map(d => d.device_code || d.site_name || d.program_name)));

  const tsSet = new Set<string>();
  for (const d of filtered) {
    tsSet.add(String(d.timestamp));
  }
  const allTimestamps = Array.from(tsSet).sort().map(t => new Date(t));

  type GroupEntry = {
    id: string;
    label: string;
    metricName: string;
    points: Map<number, number | null>;
  };

  const grouped = new Map<string, GroupEntry>();

  for (const point of filtered) {
    const entityKey = point.device_code || point.site_name || point.program_name;
    const compoundKey = isMultiMetric ? `${entityKey}||${point.metric_name}` : entityKey;

    if (!grouped.has(compoundKey)) {
      const metricLabel = METRIC_LABELS[point.metric_name as MetricType] || point.metric_name;
      grouped.set(compoundKey, {
        id: `${point.device_id || point.site_id || point.program_id}_${point.metric_name}`,
        label: isMultiMetric ? `${entityKey} - ${metricLabel}` : entityKey,
        metricName: point.metric_name,
        points: new Map(),
      });
    }

    const ts = new Date(point.timestamp).getTime();
    grouped.get(compoundKey)!.points.set(ts, point.metric_value);
  }

  const series: MultiMetricSeries[] = [];

  for (const group of grouped.values()) {
    const deviceIdx = deviceCodes.indexOf(group.label.split(' - ')[0]);
    const metricIdx = metrics.indexOf(group.metricName);
    const colorPair = DEVICE_BASE_COLORS[deviceIdx % DEVICE_BASE_COLORS.length];

    series.push({
      id: group.id,
      label: group.label,
      metricName: group.metricName,
      color: isMultiMetric ? colorPair[metricIdx % colorPair.length] : colorPair[0],
      lineStyle: isMultiMetric && metricIdx > 0 ? 'dashed' : 'solid',
      values: allTimestamps.map(ts => {
        const val = group.points.get(ts.getTime());
        return val !== undefined ? val : null;
      }),
    });
  }

  return { timestamps: allTimestamps, series };
}

export function transformComparisonForD3(
  data: ComparisonDataPoint[],
  metricNames: string | string[]
): MultiMetricChartData {
  const metrics = Array.isArray(metricNames) ? metricNames : [metricNames];
  const filtered = data.filter((d) => metrics.includes(d.metric_name));

  const isMultiMetric = metrics.length > 1;
  const entityNames = Array.from(new Set(filtered.map(d => d.entity_name)));

  const tsSet = new Set<string>();
  for (const d of filtered) {
    tsSet.add(String(d.timestamp));
  }
  const allTimestamps = Array.from(tsSet).sort().map((t) => new Date(t));

  type GroupEntry = {
    id: string;
    label: string;
    metricName: string;
    points: Map<number, number | null>;
  };

  const grouped = new Map<string, GroupEntry>();

  for (const point of filtered) {
    const compoundKey = isMultiMetric ? `${point.entity_id}||${point.metric_name}` : point.entity_id;

    if (!grouped.has(compoundKey)) {
      const metricLabel = METRIC_LABELS[point.metric_name as MetricType] || point.metric_name;
      grouped.set(compoundKey, {
        id: `${point.entity_id}_${point.metric_name}`,
        label: isMultiMetric ? `${point.entity_name} - ${metricLabel}` : point.entity_name,
        metricName: point.metric_name,
        points: new Map(),
      });
    }

    const ts = new Date(point.timestamp).getTime();
    grouped.get(compoundKey)!.points.set(ts, point.metric_value);
  }

  const series: MultiMetricSeries[] = [];

  for (const group of grouped.values()) {
    const entityIdx = entityNames.indexOf(group.label.split(' - ')[0]);
    const metricIdx = metrics.indexOf(group.metricName);
    const colorPair = DEVICE_BASE_COLORS[entityIdx % DEVICE_BASE_COLORS.length];

    series.push({
      id: group.id,
      label: group.label,
      metricName: group.metricName,
      color: isMultiMetric ? colorPair[metricIdx % colorPair.length] : colorPair[0],
      lineStyle: isMultiMetric && metricIdx > 0 ? 'dashed' : 'solid',
      values: allTimestamps.map((ts) => {
        const val = group.points.get(ts.getTime());
        return val !== undefined ? val : null;
      }),
    });
  }

  return { timestamps: allTimestamps, series };
}

/**
 * Transform aggregated data for D3 bar chart
 */
export function transformAggregatedForD3(
  data: AggregatedDataPoint[]
): { labels: string[]; datasets: { metricName: string; values: (number | null)[] }[] } {
  const metricNames = Array.from(new Set(data.map(d => d.metric_name)));
  const labels = Array.from(new Set(data.map(d => d.group_key)));

  const datasets = metricNames.map(metric => ({
    metricName: metric,
    values: labels.map(label => {
      const point = data.find(d => d.group_key === label && d.metric_name === metric);
      return point ? point.metric_value : null;
    })
  }));

  return { labels, datasets };
}

/**
 * Export data to CSV
 */
export function exportDataToCSV(data: any[], filename: string): void {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        return typeof value === 'string' && value.includes(',')
          ? `"${value}"`
          : value;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
