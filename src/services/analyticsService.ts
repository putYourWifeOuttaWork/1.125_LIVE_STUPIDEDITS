import { supabase } from '../lib/supabaseClient';
import {
  CustomReport,
  ReportSnapshot,
  DeviceMetricData,
  AlertStatisticsData,
  SessionPerformanceData,
  DrillDownRecord,
  ComparisonData,
  DaysSinceLastAlert,
  ReportConfiguration,
  ReportQueryParams,
  CacheEntry,
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

    const { data, error } = await supabase.rpc('get_drill_down_records', {
      p_company_id: companyId,
      p_program_ids: options?.programIds || null,
      p_site_ids: options?.siteIds || null,
      p_device_ids: options?.deviceIds || null,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_limit: limit + 1, // Fetch one extra to check if there are more
      p_offset: offset,
    });

    if (error) throw error;

    const hasMore = data && data.length > limit;
    const records = hasMore ? data.slice(0, limit) : data || [];

    return { records, hasMore };
  } catch (error) {
    console.error('Error fetching drill-down records:', error);
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
          first_name,
          last_name
        )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((report) => ({
      ...report,
      created_by_name: report.created_by
        ? `${report.created_by.first_name || ''} ${report.created_by.last_name || ''}`.trim() ||
          report.created_by.email
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
          first_name,
          last_name
        )
      `)
      .eq('report_id', reportId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      created_by_name: data.created_by
        ? `${data.created_by.first_name || ''} ${data.created_by.last_name || ''}`.trim() ||
          data.created_by.email
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
  }
): Promise<CustomReport> {
  try {
    const { data, error } = await supabase
      .from('custom_reports')
      .update(updates)
      .eq('report_id', reportId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating report:', error);
    throw error;
  }
}

/**
 * Delete a report
 */
export async function deleteReport(reportId: string): Promise<void> {
  try {
    const { error } = await supabase.from('custom_reports').delete().eq('report_id', reportId);

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
          first_name,
          last_name
        )
      `)
      .eq('report_id', reportId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((snapshot) => ({
      ...snapshot,
      created_by_name: snapshot.created_by
        ? `${snapshot.created_by.first_name || ''} ${snapshot.created_by.last_name || ''}`.trim() ||
          snapshot.created_by.email
        : 'Unknown',
    }));
  } catch (error) {
    console.error('Error fetching snapshots:', error);
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
