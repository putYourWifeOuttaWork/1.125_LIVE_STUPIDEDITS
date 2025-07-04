/**
 * Custom error classes for application-specific error handling
 */

/**
 * Represents an authentication error that should trigger a logout flow
 */
export class AuthError extends Error {
  constructor(message = 'Authentication error occurred') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Represents a network error (offline, timeout, etc.)
 */
export class NetworkError extends Error {
  constructor(message = 'Network error occurred') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Represents a permission error (unauthorized access to resource)
 */
export class PermissionError extends Error {
  constructor(message = 'You do not have permission to access this resource') {
    super(message);
    this.name = 'PermissionError';
  }
}