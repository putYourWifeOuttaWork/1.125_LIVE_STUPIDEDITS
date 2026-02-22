/*
  # Clean up device notes with "Unassigned:" prefix

  1. Changes
    - Removes the "Unassigned: {reason}\n\n" prefix that was erroneously
      prepended to device notes by the old unassignment code
    - Only affects devices whose notes start with "Unassigned:"
    - Extracts and preserves the original note text after the prefix

  2. Affected Devices
    - 98A316F8189C: "Unassigned: Device repair/maintenance required\n\nOn-Site at Sandhill"
      -> "On-Site at Sandhill"

  3. Notes
    - The unassignment reason is already stored in the device_site_assignments
      junction table, so no data is lost
    - Going forward, the application code no longer concatenates reasons into
      the notes field
*/

UPDATE devices
SET notes = regexp_replace(notes, '^Unassigned:\s*[^\n]*\n*', '')
WHERE notes LIKE 'Unassigned:%';
