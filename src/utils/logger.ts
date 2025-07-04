/**
 * Logger utility for consistent, environment-aware logging
 * 
 * Features:
 * - Environment-based control (verbose in dev, minimal in prod)
 * - Consistent formatting with prefixes
 * - Log levels (debug, info, warn, error)
 * - Component tagging for easier filtering
 */

// Log levels in order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4  // Use to completely disable logging
}

// Default configuration
const DEFAULT_CONFIG = {
  // In production, only show warnings and errors
  // In development, show all logs
  minLevel: import.meta.env.PROD ? LogLevel.WARN : LogLevel.DEBUG,
  // Whether to include timestamps in log messages
  showTimestamps: true
};

// Logger configuration that can be updated at runtime
let config = { ...DEFAULT_CONFIG };

/**
 * Configure the logger
 */
export const configureLogger = (options: Partial<typeof DEFAULT_CONFIG>) => {
  config = { ...config, ...options };
};

// Formats and styles for different log levels
const LOG_FORMATS = {
  [LogLevel.DEBUG]: {
    prefix: '🔍 DEBUG',
    style: 'color: #6b7280;', // gray
    method: 'debug'
  },
  [LogLevel.INFO]: {
    prefix: 'ℹ️ INFO',
    style: 'color: #3b82f6;', // blue
    method: 'info'
  },
  [LogLevel.WARN]: {
    prefix: '⚠️ WARN',
    style: 'color: #f59e0b; font-weight: bold;', // amber
    method: 'warn'
  },
  [LogLevel.ERROR]: {
    prefix: '🔴 ERROR',
    style: 'color: #ef4444; font-weight: bold;', // red
    method: 'error'
  }
};

/**
 * Create a logger instance for a specific component
 */
export const createLogger = (component: string) => {
  const formatMessage = (level: LogLevel, message: string) => {
    const { prefix, style } = LOG_FORMATS[level];
    const timestamp = config.showTimestamps ? `[${new Date().toISOString().split('T')[1].slice(0, -1)}] ` : '';
    return {
      formattedMessage: `${prefix} ${timestamp}[${component}] ${message}`,
      style
    };
  };

  const log = (level: LogLevel, message: string, ...args: any[]) => {
    // Skip logging if the level is below the configured minimum
    if (level < config.minLevel) return;

    const { formattedMessage, style } = formatMessage(level, message);
    const method = LOG_FORMATS[level].method as keyof Console;

    // Use appropriate console method with styling
    if (args.length > 0) {
      console[method](`%c${formattedMessage}`, style, ...args);
    } else {
      console[method](`%c${formattedMessage}`, style);
    }
  };

  return {
    debug: (message: string, ...args: any[]) => log(LogLevel.DEBUG, message, ...args),
    info: (message: string, ...args: any[]) => log(LogLevel.INFO, message, ...args),
    warn: (message: string, ...args: any[]) => log(LogLevel.WARN, message, ...args),
    error: (message: string, ...args: any[]) => log(LogLevel.ERROR, message, ...args),
    
    // For logging objects/data with a label
    debugData: (label: string, data: any) => {
      if (config.minLevel <= LogLevel.DEBUG) {
        const { formattedMessage, style } = formatMessage(LogLevel.DEBUG, label);
        console.groupCollapsed(`%c${formattedMessage}`, style);
        console.debug(data);
        console.groupEnd();
      }
    },
    
    // Create a child logger with additional context
    child: (subComponent: string) => createLogger(`${component}:${subComponent}`)
  };
};

/**
 * Set global minimum log level
 */
export const setLogLevel = (level: LogLevel) => {
  config.minLevel = level;
};

// Create a root logger for general application logs
export const logger = createLogger('App');

// Export default object for easy importing
export default {
  createLogger,
  configureLogger,
  setLogLevel,
  LogLevel,
  logger
};