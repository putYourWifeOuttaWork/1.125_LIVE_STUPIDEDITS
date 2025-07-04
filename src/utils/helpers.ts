/**
 * Debounce function that limits how often a function can be called
 * @param func The function to debounce
 * @param wait The wait time in milliseconds
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format file size into human-readable format
 * @param bytes Size in bytes
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param retryDelay Initial delay in ms
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  retryDelay: number = 300
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempt ${i + 1} for operation...`);
      return await fn();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this is the last attempt, don't wait, just throw
      if (i === maxRetries - 1) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = retryDelay * Math.pow(2, i);
      console.log(`Retry attempt ${i + 1} for operation, waiting ${delay}ms...`);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Export withRetry to be used throughout the app
export { withRetry } from '../lib/api';