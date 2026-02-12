import { QueryClient } from '@tanstack/react-query';
import { AuthError, NetworkError } from './errors';
import { toast } from 'react-toastify';
import { supabase } from './supabaseClient';
import { createLogger } from '../utils/logger';

const log = createLogger('QueryClient');

const authErrorHandlers: Array<() => void> = [];

export const registerAuthErrorHandler = (handler: () => void): (() => void) => {
  if (authErrorHandlers.includes(handler)) {
    log.debug('Auth error handler already registered, skipping');
    return () => {};
  }

  authErrorHandlers.push(handler);
  log.debug('Auth error handler registered, total:', authErrorHandlers.length);

  return () => {
    const index = authErrorHandlers.indexOf(handler);
    if (index > -1) {
      authErrorHandlers.splice(index, 1);
      log.debug('Auth error handler unregistered, total:', authErrorHandlers.length);
    }
  };
};

export const handleAuthError = async () => {
  log.warn('Global auth error handling triggered');

  try {
    await supabase.auth.signOut();
  } catch (err) {
    log.error('Error signing out during auth error handling:', err);
  }

  for (const handler of authErrorHandlers) {
    try {
      handler();
    } catch (error) {
      log.error('Error in auth error handler:', error);
    }
  }

  toast.error(
    'Your session has expired. Please sign in again.',
    { autoClose: 5000 }
  );

  window.location.href = '/login';
};

// Create a client with default settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 30 seconds to avoid excessive refetching
      staleTime: 30 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed queries 3 times with exponential backoff
      retry: 3,
      refetchOnWindowFocus: 'always',
      // Use our own error handling
      useErrorBoundary: false,
      // Global error handler for auth errors
      onError: (error) => {
        log.error('Query error:', error);

        if (error instanceof AuthError) {
          handleAuthError();
        } else if (error instanceof NetworkError) {
          // For network errors, just show a toast but don't log out
          toast.warning('Network connection issue detected. Some features may be limited.', {
            autoClose: false // Keep visible until dismissed
          });
        }
      },
    },
    mutations: {
      onError: (error) => {
        log.error('Mutation error:', error);

        if (error instanceof AuthError) {
          handleAuthError();
        }
      },
    }
  },
});

// Set up offline/online event listeners
// NOTE: Removed aggressive visibilitychange listener that was causing UI breaks
// React Query's refetchOnWindowFocus handles this more gracefully
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    log.info('Connection restored. Invalidating stale queries...');
    queryClient.invalidateQueries({
      refetchType: 'active',
      stale: true
    });
  });
}