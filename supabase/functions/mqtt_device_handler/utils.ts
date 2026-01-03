/**
 * Utility functions for MQTT Device Handler
 */

/**
 * Normalizes MAC address to standard format: uppercase 12-character string without separators
 *
 * Examples:
 *   "98:A3:16:F8:29:28" -> "98A316F82928"
 *   "98-a3-16-f8-29-28" -> "98A316F82928"
 *   "98A316F82928"      -> "98A316F82928"
 *
 * @param mac - MAC address in any common format
 * @returns Normalized MAC address (12 uppercase hex chars) or null if invalid
 */
export function normalizeMacAddress(mac: string | null | undefined): string | null {
  if (!mac) {
    return null;
  }

  // Remove all common separators (colons, hyphens, spaces)
  const cleaned = mac.replace(/[:\-\s]/g, '').toUpperCase();

  // Validate: must be exactly 12 hexadecimal characters
  const hexPattern = /^[0-9A-F]{12}$/;
  if (!hexPattern.test(cleaned)) {
    console.warn(`Invalid MAC address format: "${mac}" (cleaned: "${cleaned}")`);
    return null;
  }

  return cleaned;
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
