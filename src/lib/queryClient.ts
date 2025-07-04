import { QueryClient } from '@tanstack/react-query';
import { AuthError, NetworkError } from './errors';
import { toast } from 'react-toastify';
import { supabase } from './supabaseClient';

// Store for global auth error handlers
const authErrorHandlers: Array<() => void> = [];

// Register a global auth error handler
export const registerAuthErrorHandler = (handler: () => void) => {
  authErrorHandlers.push(handler);
  console.log('Auth error handler registered, total handlers:', authErrorHandlers.length);
};

// Trigger all registered auth error handlers
export const handleAuthError = async () => {
  console.log('Global auth error handling triggered');
  
  // Attempt to sign out from Supabase
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Error signing out during auth error handling:', err);
  }
  
  // Call all registered handlers
  for (const handler of authErrorHandlers) {
    try {
      handler();
    } catch (error) {
      console.error('Error in auth error handler:', error);
    }
  }
  
  // Show toast message
  toast.error(
    'Your session has expired. Please sign in again.',
    { autoClose: 5000 }
  );
  
  // Redirect to login
  window.location.href = '/login';
};

// Create a client with default settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data will be considered stale immediately on window focus
      staleTime: 0,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed queries 3 times with exponential backoff
      retry: 3,
      // Always refetch when window regains focus (critical for our issue)
      refetchOnWindowFocus: true,
      // Use our own error handling
      useErrorBoundary: false,
      // Global error handler for auth errors
      onError: (error) => {
        console.error('Query error:', error);
        
        // If this is an auth error, trigger the global auth error handling
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
      // Global error handler for mutations
      onError: (error) => {
        console.error('Mutation error:', error);
        
        // If this is an auth error, trigger the global auth error handling
        if (error instanceof AuthError) {
          handleAuthError();
        }
      },
    }
  },
});

// Set up listener for focus events to invalidate queries
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('Document became visible, invalidating queries...');
      // Force refetch active queries when tab becomes visible
      queryClient.invalidateQueries();
    }
  });

  // Set up offline/online event listeners
  window.addEventListener('online', () => {
    console.log('Connection restored. Invalidating queries...');
    queryClient.invalidateQueries();
  });
}