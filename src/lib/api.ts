import { supabase } from './supabaseClient';
import { toast } from 'react-toastify';
import { AuthError, NetworkError } from './errors';
import { createLogger } from '../utils/logger';

// Create a logger for API operations
const logger = createLogger('API');

// Constants for retry logic
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 300; // milliseconds

/**
 * Wrapper for Supabase API calls with retry logic and auth error detection
 * @param apiCall Function that makes the actual Supabase call
 * @param callName Optional name to identify this API call in logs
 * @param retryCount Current retry count
 * @param maxRetries Maximum number of retries
 * @returns Promise with the API result
 */
export async function withRetry<T>(
  apiCall: () => Promise<{ data: T | null; error: any }>,
  callName: string = 'unnamed-call',
  retryCount = 0,
  maxRetries = MAX_RETRIES
): Promise<{ data: T | null; error: any }> {
  try {
    logger.debug(`Making API call: [${callName}] (attempt ${retryCount + 1}/${maxRetries + 1})`);
    const startTime = performance.now();
    const result = await apiCall();
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    
    if (result.error) {
      logger.error(`API call [${callName}] returned an error after ${duration}ms:`, result.error);
      
      // Check for specific auth error codes and messages
      const isAuthError = 
        // PostgreSQL auth errors
        result.error.code === 'PGRST301' || // Unauthorized
        result.error.code === '42501' ||    // Insufficient privilege
        result.error.code === '3D000' ||    // Invalid schema
        // HTTP status-based auth errors
        result.error.status === 401 ||      // Unauthorized
        result.error.status === 403 ||      // Forbidden
        // Message-based detection as fallback
        result.error.message?.toLowerCase().includes('jwt') ||
        result.error.message?.toLowerCase().includes('auth') ||
        result.error.message?.toLowerCase().includes('token') ||
        result.error.message?.toLowerCase().includes('unauthorized') ||
        result.error.message?.toLowerCase().includes('permission') ||
        result.error.message?.toLowerCase().includes('forbidden');

      if (isAuthError) {
        logger.error(`Authentication error detected in [${callName}]:`, result.error);
        throw new AuthError(result.error.message || 'Authentication failed');
      }
      
      // Network/connectivity errors
      const isNetworkError = 
        result.error.code === 'PGRST100' || // Internal server error
        result.error.message?.toLowerCase().includes('network') ||
        result.error.message?.toLowerCase().includes('timeout') ||
        result.error.message?.toLowerCase().includes('connection');
        
      if (isNetworkError) {
        logger.error(`Network error detected in [${callName}]:`, result.error);
        if (!navigator.onLine) {
          throw new NetworkError('You are currently offline');
        }
      }

      // If we have an error that might be resolved by retrying (network errors, timeouts, etc.)
      if (retryCount < maxRetries) {
        // These error codes generally indicate transient errors that may resolve with a retry
        const isRetryableError = 
          result.error.code === 'PGRST116' || // Postgres REST timeout
          result.error.code === '23505' ||    // Unique violation (might resolve with retry after conflict resolves)
          result.error.code === '503' ||      // Service unavailable
          isNetworkError;
          
        if (isRetryableError) {
          logger.warn(`API call [${callName}] failed (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`, result.error);
          
          // Calculate delay with exponential backoff
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry with incremented counter
          return withRetry(apiCall, callName, retryCount + 1, maxRetries);
        }
      }
    } else {
      logger.debug(`API call [${callName}] succeeded in ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    // If error is already an AuthError, just rethrow it
    if (error instanceof AuthError) {
      throw error;
    }
    
    // Handle unexpected errors (non-Supabase errors)
    logger.error(`Unexpected error in API call [${callName}]:`, error);
    
    // If we haven't exceeded max retries, try again
    if (retryCount < maxRetries) {
      logger.warn(`API call [${callName}] failed with unexpected error (attempt ${retryCount + 1}/${maxRetries + 1}), retrying...`);
      
      // Calculate delay with exponential backoff
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry with incremented counter
      return withRetry(apiCall, callName, retryCount + 1, maxRetries);
    }
    
    // If we've exhausted retries, return a formatted error
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        originalError: error
      }
    };
  }
}

/**
 * Enhanced version of fetchSitesByProgramId with retry logic
 */
export const fetchSitesByProgramId = async (programId: string) => {
  if (!programId) return { data: [], error: null };
  
  logger.debug(`Fetching sites for program ${programId}`);
  return withRetry(() => 
    supabase
      .from('sites')
      .select('*')
      .eq('program_id', programId)
      .order('name', { ascending: true })
  , `fetchSitesByProgramId(${programId})`);
};

/**
 * Enhanced version of fetchSubmissionsBySiteId with retry logic
 */
export const fetchSubmissionsBySiteId = async (siteId: string) => {
  if (!siteId) return { data: [], error: null };
  
  logger.debug(`Fetching submissions for site ${siteId}`);
  return withRetry(() => 
    supabase
      .rpc('fetch_submissions_for_site', { p_site_id: siteId })
  , `fetchSubmissionsBySiteId(${siteId})`);
};

/**
 * Enhanced version of fetchSiteById with retry logic
 */
export const fetchSiteById = async (siteId: string) => {
  if (!siteId) return { data: null, error: null };

  logger.debug(`Fetching site ${siteId}`);
  return withRetry(() =>
    supabase
      .from('sites')
      .select('*')
      .eq('site_id', siteId)
      .single()
  , `fetchSiteById(${siteId})`);
};

// ==========================================
// PILOT PROGRAMS API
// ==========================================

/**
 * Fetch all pilot programs accessible to the current user
 */
export const fetchPilotPrograms = async () => {
  logger.debug('Fetching all pilot programs');
  return withRetry(() =>
    supabase
      .from('pilot_programs')
      .select('*')
      .order('created_at', { ascending: false })
  , 'fetchPilotPrograms');
};

/**
 * Fetch a single pilot program by ID
 */
export const fetchPilotProgramById = async (programId: string) => {
  if (!programId) return { data: null, error: null };

  logger.debug(`Fetching pilot program ${programId}`);
  return withRetry(() =>
    supabase
      .from('pilot_programs')
      .select('*')
      .eq('program_id', programId)
      .maybeSingle()
  , `fetchPilotProgramById(${programId})`);
};

/**
 * Fetch pilot programs for a specific company
 */
export const fetchPilotProgramsByCompanyId = async (companyId: string) => {
  if (!companyId) return { data: [], error: null };

  logger.debug(`Fetching pilot programs for company ${companyId}`);
  return withRetry(() =>
    supabase
      .from('pilot_programs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
  , `fetchPilotProgramsByCompanyId(${companyId})`);
};

/**
 * Fetch pilot programs with progress metrics (uses view)
 */
export const fetchPilotProgramsWithProgress = async () => {
  logger.debug('Fetching pilot programs with progress');
  return withRetry(() =>
    supabase
      .from('pilot_programs_with_progress')
      .select('*')
      .order('created_at', { ascending: false })
  , 'fetchPilotProgramsWithProgress');
};

// ==========================================
// COMPANIES API
// ==========================================

/**
 * Fetch all companies
 */
export const fetchCompanies = async () => {
  logger.debug('Fetching all companies');
  return withRetry(() =>
    supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true })
  , 'fetchCompanies');
};

/**
 * Fetch a single company by ID
 */
export const fetchCompanyById = async (companyId: string) => {
  if (!companyId) return { data: null, error: null };

  logger.debug(`Fetching company ${companyId}`);
  return withRetry(() =>
    supabase
      .from('companies')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()
  , `fetchCompanyById(${companyId})`);
};

// ==========================================
// USERS API
// ==========================================

/**
 * Fetch user profile by ID
 */
export const fetchUserById = async (userId: string) => {
  if (!userId) return { data: null, error: null };

  logger.debug(`Fetching user ${userId}`);
  return withRetry(() =>
    supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
  , `fetchUserById(${userId})`);
};

/**
 * Fetch users by company ID
 */
export const fetchUsersByCompanyId = async (companyId: string) => {
  if (!companyId) return { data: [], error: null };

  logger.debug(`Fetching users for company ${companyId}`);
  return withRetry(() =>
    supabase
      .from('users')
      .select('*')
      .eq('company_id', companyId)
      .order('full_name', { ascending: true })
  , `fetchUsersByCompanyId(${companyId})`);
};

/**
 * Fetch users with access to a specific program
 */
export const fetchUsersByProgramId = async (programId: string) => {
  if (!programId) return { data: [], error: null };

  logger.debug(`Fetching users for program ${programId}`);
  return withRetry(() =>
    supabase
      .from('program_access')
      .select('user_id, access_level, users(*)')
      .eq('program_id', programId)
  , `fetchUsersByProgramId(${programId})`);
};

// ==========================================
// SUBMISSIONS API
// ==========================================

/**
 * Fetch a single submission by ID
 */
export const fetchSubmissionById = async (submissionId: string) => {
  if (!submissionId) return { data: null, error: null };

  logger.debug(`Fetching submission ${submissionId}`);
  return withRetry(() =>
    supabase
      .from('submissions')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle()
  , `fetchSubmissionById(${submissionId})`);
};

/**
 * Fetch submissions by program ID
 */
export const fetchSubmissionsByProgramId = async (programId: string) => {
  if (!programId) return { data: [], error: null };

  logger.debug(`Fetching submissions for program ${programId}`);
  return withRetry(() =>
    supabase
      .from('submissions')
      .select('*')
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
  , `fetchSubmissionsByProgramId(${programId})`);
};

// ==========================================
// PETRI OBSERVATIONS API (Device Data)
// ==========================================

/**
 * Fetch petri observations by submission ID
 */
export const fetchPetriObservationsBySubmissionId = async (submissionId: string) => {
  if (!submissionId) return { data: [], error: null };

  logger.debug(`Fetching petri observations for submission ${submissionId}`);
  return withRetry(() =>
    supabase
      .from('petri_observations')
      .select('*')
      .eq('submission_id', submissionId)
      .order('order_index', { ascending: true })
  , `fetchPetriObservationsBySubmissionId(${submissionId})`);
};

/**
 * Fetch petri observations by site ID
 */
export const fetchPetriObservationsBySiteId = async (siteId: string) => {
  if (!siteId) return { data: [], error: null };

  logger.debug(`Fetching petri observations for site ${siteId}`);
  return withRetry(() =>
    supabase
      .from('petri_observations')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
  , `fetchPetriObservationsBySiteId(${siteId})`);
};

/**
 * Fetch a single petri observation by ID
 */
export const fetchPetriObservationById = async (observationId: string) => {
  if (!observationId) return { data: null, error: null };

  logger.debug(`Fetching petri observation ${observationId}`);
  return withRetry(() =>
    supabase
      .from('petri_observations')
      .select('*')
      .eq('observation_id', observationId)
      .maybeSingle()
  , `fetchPetriObservationById(${observationId})`);
};

// ==========================================
// GASIFIER OBSERVATIONS API (Device Data)
// ==========================================

/**
 * Fetch gasifier observations by submission ID
 */
export const fetchGasifierObservationsBySubmissionId = async (submissionId: string) => {
  if (!submissionId) return { data: [], error: null };

  logger.debug(`Fetching gasifier observations for submission ${submissionId}`);
  return withRetry(() =>
    supabase
      .from('gasifier_observations')
      .select('*')
      .eq('submission_id', submissionId)
      .order('order_index', { ascending: true })
  , `fetchGasifierObservationsBySubmissionId(${submissionId})`);
};

/**
 * Fetch gasifier observations by site ID
 */
export const fetchGasifierObservationsBySiteId = async (siteId: string) => {
  if (!siteId) return { data: [], error: null };

  logger.debug(`Fetching gasifier observations for site ${siteId}`);
  return withRetry(() =>
    supabase
      .from('gasifier_observations')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
  , `fetchGasifierObservationsBySiteId(${siteId})`);
};

/**
 * Fetch a single gasifier observation by ID
 */
export const fetchGasifierObservationById = async (observationId: string) => {
  if (!observationId) return { data: null, error: null };

  logger.debug(`Fetching gasifier observation ${observationId}`);
  return withRetry(() =>
    supabase
      .from('gasifier_observations')
      .select('*')
      .eq('observation_id', observationId)
      .maybeSingle()
  , `fetchGasifierObservationById(${observationId})`);
};

// ==========================================
// SUBMISSION SESSIONS API
// ==========================================

/**
 * Fetch active sessions for current user
 */
export const fetchActiveSessions = async () => {
  logger.debug('Fetching active sessions');
  return withRetry(() =>
    supabase
      .rpc('get_active_sessions_with_details')
  , 'fetchActiveSessions');
};

/**
 * Fetch session by submission ID
 */
export const fetchSessionBySubmissionId = async (submissionId: string) => {
  if (!submissionId) return { data: null, error: null };

  logger.debug(`Fetching session for submission ${submissionId}`);
  return withRetry(() =>
    supabase
      .from('submission_sessions')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle()
  , `fetchSessionBySubmissionId(${submissionId})`);
};

// ==========================================
// AUDIT LOG API
// ==========================================

/**
 * Fetch audit log entries for a program
 */
export const fetchAuditLogByProgramId = async (programId: string) => {
  if (!programId) return { data: [], error: null };

  logger.debug(`Fetching audit log for program ${programId}`);
  return withRetry(() =>
    supabase
      .from('pilot_program_history_staging')
      .select('*')
      .eq('program_id', programId)
      .order('changed_at', { ascending: false })
  , `fetchAuditLogByProgramId(${programId})`);
};

/**
 * Fetch audit log entries for a site
 */
export const fetchAuditLogBySiteId = async (siteId: string) => {
  if (!siteId) return { data: [], error: null };

  logger.debug(`Fetching audit log for site ${siteId}`);
  return withRetry(() =>
    supabase
      .from('pilot_program_history_staging')
      .select('*')
      .eq('site_id', siteId)
      .order('changed_at', { ascending: false })
  , `fetchAuditLogBySiteId(${siteId})`);
};

/**
 * Fetch audit log entries for a user
 */
export const fetchAuditLogByUserId = async (userId: string) => {
  if (!userId) return { data: [], error: null };

  logger.debug(`Fetching audit log for user ${userId}`);
  return withRetry(() =>
    supabase
      .from('pilot_program_history_staging')
      .select('*')
      .eq('changed_by_user_id', userId)
      .order('changed_at', { ascending: false })
  , `fetchAuditLogByUserId(${userId})`);
};

// ==========================================
// PROGRAM ACCESS API
// ==========================================

/**
 * Fetch user's access level for a program
 */
export const fetchUserAccessForProgram = async (programId: string, userId: string) => {
  if (!programId || !userId) return { data: null, error: null };

  logger.debug(`Fetching access level for user ${userId} in program ${programId}`);
  return withRetry(() =>
    supabase
      .from('program_access')
      .select('*')
      .eq('program_id', programId)
      .eq('user_id', userId)
      .maybeSingle()
  , `fetchUserAccessForProgram(${programId}, ${userId})`);
};

// ==========================================
// CUSTOM REPORTS API
// ==========================================

/**
 * Fetch custom reports for a company
 */
export const fetchCustomReportsByCompanyId = async (companyId: string) => {
  if (!companyId) return { data: [], error: null };

  logger.debug(`Fetching custom reports for company ${companyId}`);
  return withRetry(() =>
    supabase
      .from('custom_reports')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
  , `fetchCustomReportsByCompanyId(${companyId})`);
};

/**
 * Fetch custom reports for a program
 */
export const fetchCustomReportsByProgramId = async (programId: string) => {
  if (!programId) return { data: [], error: null };

  logger.debug(`Fetching custom reports for program ${programId}`);
  return withRetry(() =>
    supabase
      .from('custom_reports')
      .select('*')
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
  , `fetchCustomReportsByProgramId(${programId})`);
};

/**
 * Get available report metadata (entities and fields)
 */
export const getReportMetadata = async () => {
  logger.debug('Fetching report metadata');
  return withRetry(() =>
    supabase
      .rpc('get_available_report_metadata')
  , 'getReportMetadata');
};

/**
 * Execute a custom report query
 */
export const executeCustomReport = async (
  reportConfiguration: any,
  limit: number = 1000,
  offset: number = 0
) => {
  logger.debug('Executing custom report');
  return withRetry(() =>
    supabase
      .rpc('execute_custom_report_query', {
        p_report_configuration: reportConfiguration,
        p_limit: limit,
        p_offset: offset
      })
  , 'executeCustomReport');
};

// ==========================================
// DEVICES API
// ==========================================

/**
 * Fetch all devices with optional filters
 */
export const fetchDevices = async (filters?: {
  programId?: string;
  siteId?: string;
  provisioningStatus?: string;
}) => {
  logger.debug('Fetching devices', filters);

  let query = supabase
    .from('devices')
    .select(`
      *,
      sites:site_id (
        site_id,
        name,
        type
      ),
      pilot_programs:program_id (
        program_id,
        name
      )
    `)
    .order('created_at', { ascending: false });

  if (filters?.programId) {
    query = query.eq('program_id', filters.programId);
  }

  if (filters?.siteId) {
    query = query.eq('site_id', filters.siteId);
  }

  if (filters?.provisioningStatus) {
    query = query.eq('provisioning_status', filters.provisioningStatus);
  }

  return withRetry(() => query, 'fetchDevices');
};

/**
 * Fetch a single device by ID
 */
export const fetchDeviceById = async (deviceId: string) => {
  if (!deviceId) return { data: null, error: null };

  logger.debug(`Fetching device ${deviceId}`);
  return withRetry(() =>
    supabase
      .from('devices')
      .select(`
        *,
        sites:site_id (
          site_id,
          name,
          type,
          program_id
        ),
        pilot_programs:program_id (
          program_id,
          name,
          company_id
        )
      `)
      .eq('device_id', deviceId)
      .maybeSingle()
  , `fetchDeviceById(${deviceId})`);
};

/**
 * Fetch device telemetry data
 */
export const fetchDeviceTelemetry = async (
  deviceId: string,
  limit: number = 100
) => {
  if (!deviceId) return { data: [], error: null };

  logger.debug(`Fetching telemetry for device ${deviceId}`);
  return withRetry(() =>
    supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .order('captured_at', { ascending: false })
      .limit(limit)
  , `fetchDeviceTelemetry(${deviceId})`);
};

/**
 * Fetch device images
 */
export const fetchDeviceImages = async (
  deviceId: string,
  status?: 'pending' | 'receiving' | 'complete' | 'failed'
) => {
  if (!deviceId) return { data: [], error: null };

  logger.debug(`Fetching images for device ${deviceId}`);

  let query = supabase
    .from('device_images')
    .select('*')
    .eq('device_id', deviceId)
    .order('captured_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  return withRetry(() => query, `fetchDeviceImages(${deviceId})`);
};

/**
 * Fetch device alerts
 */
export const fetchDeviceAlerts = async (
  deviceId: string,
  includeResolved: boolean = false
) => {
  if (!deviceId) return { data: [], error: null };

  logger.debug(`Fetching alerts for device ${deviceId}`);

  let query = supabase
    .from('device_alerts')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false });

  if (!includeResolved) {
    query = query.is('resolved_at', null);
  }

  return withRetry(() => query, `fetchDeviceAlerts(${deviceId})`);
};