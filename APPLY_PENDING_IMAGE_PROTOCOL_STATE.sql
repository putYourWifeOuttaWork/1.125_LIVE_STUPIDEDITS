/*
  # Add Protocol State for Pending Image Resume

  Apply this migration via Supabase Dashboard SQL Editor

  1. New Protocol State
    - ack_pending_sent: Server sent ACK to resume pending image transfer

  2. Changes
    - Update CHECK constraint to include new state
    - This allows tracking when server ACKs an existing incomplete image
*/

-- Drop existing constraint
ALTER TABLE device_wake_payloads
DROP CONSTRAINT IF EXISTS device_wake_payloads_protocol_state_check;

-- Add updated constraint with new state
ALTER TABLE device_wake_payloads
ADD CONSTRAINT device_wake_payloads_protocol_state_check
CHECK (protocol_state IN (
  'hello_received',
  'ack_sent',
  'ack_pending_sent',  -- NEW: ACK sent for pending image resume
  'snap_sent',
  'metadata_received',
  'complete',
  'failed',
  'sleep_only'
));

-- Add comment for new state
COMMENT ON COLUMN device_wake_payloads.protocol_state IS 'Current state in device wake protocol flow. States: hello_received, ack_sent, ack_pending_sent (resume), snap_sent, metadata_received, complete, failed, sleep_only';
