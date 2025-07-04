import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/queryClient';
import App from './App';
import './index.css';
import 'react-toastify/dist/ReactToastify.css';
import ErrorBoundary from './components/common/ErrorBoundary';
import { configureLogger, LogLevel, setLogLevel } from './utils/logger';

// Configure logger based on environment
if (import.meta.env.PROD) {
  // In production, only show warnings and errors
  configureLogger({
    minLevel: LogLevel.WARN,
    showTimestamps: false
  });
  console.log('Logger configured for production: showing warnings and errors only');
} else {
  // In development, show all logs with timestamps
  configureLogger({
    minLevel: LogLevel.DEBUG,
    showTimestamps: true
  });
  console.log('Logger configured for development: showing all log levels');
  
  // Expose logger configuration to window for debugging
  (window as any).setLogLevel = setLogLevel;
  console.log('Logger API available in console: window.setLogLevel(level)');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <ToastContainer 
            position="top-center"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            className="toast-container-custom"
          />
        </BrowserRouter>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);