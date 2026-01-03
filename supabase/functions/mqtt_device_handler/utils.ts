/**
 * Utility functions for MQTT Device Handler
 */

/**
 * Checks if the input is a valid MAC address pattern
 *
 * @param input - String to check
 * @returns True if input matches MAC address pattern
 */
function isValidMacAddress(input: string): boolean {
  // Remove common separators and check if result is 12 hex characters
  const cleaned = input.replace(/[:\-\s]/g, '');
  return /^[0-9A-Fa-f]{12}$/.test(cleaned);
}

/**
 * Normalizes device identifier to standard format
 *
 * Handles both MAC addresses and special device identifiers:
 * - MAC addresses: Converts to uppercase 12-character string without separators
 * - Special identifiers: Preserves TEST-, SYSTEM:, VIRTUAL: prefixes
 *
 * Examples:
 *   "98:A3:16:F8:29:28"      -> "98A316F82928"
 *   "98-a3-16-f8-29-28"      -> "98A316F82928"
 *   "98A316F82928"           -> "98A316F82928"
 *   "TEST-ESP32-002"         -> "TEST-ESP32-002"
 *   "SYSTEM:AUTO:GENERATED"  -> "SYSTEM:AUTO:GENERATED"
 *   "VIRTUAL:SIMULATOR:001"  -> "VIRTUAL:SIMULATOR:001"
 *
 * @param identifier - Device identifier (MAC or special identifier)
 * @returns Normalized identifier or null if invalid
 */
export function normalizeMacAddress(identifier: string | null | undefined): string | null {
  if (!identifier) {
    return null;
  }

  const upper = identifier.toUpperCase();

  // Check for special identifier prefixes - preserve as-is
  if (upper.startsWith('TEST-') || upper.startsWith('SYSTEM:') || upper.startsWith('VIRTUAL:')) {
    return upper;
  }

  // Check if it looks like a MAC address
  if (!isValidMacAddress(identifier)) {
    console.warn(`Invalid device identifier format: "${identifier}"`);
    return null;
  }

  // Normalize MAC address: remove separators and uppercase
  return identifier.replace(/[:\-\s]/g, '').toUpperCase();
}

/**
 * Formats MAC address for display with colons
 *
 * @param mac - Normalized MAC address (12 chars)
 * @returns Formatted MAC for display (XX:XX:XX:XX:XX:XX)
 */
export function formatMacForDisplay(mac: string): string {
  if (!mac || mac.length !== 12) {
    return mac;
  }

  return mac.match(/.{2}/g)?.join(':') || mac;
}
