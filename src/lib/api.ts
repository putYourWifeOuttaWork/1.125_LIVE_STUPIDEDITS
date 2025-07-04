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