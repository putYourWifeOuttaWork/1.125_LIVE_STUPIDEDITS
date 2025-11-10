/*
  # Edge Chunk Buffer Table
  
  1. Purpose
    - Durable storage for MQTT chunks during transmission
    - Prevents in-memory loss on edge function restart
    - Enables idempotent chunk processing across instances
  
  2. Schema
    - chunk_key: unique identifier (device_mac|image_name|chunk_index)
    - chunk_data: BYTEA or INT[] for chunk bytes
    - expires_at: TTL for automatic cleanup
*/

CREATE TABLE IF NOT EXISTS edge_chunk_buffer (
  chunk_key TEXT PRIMARY KEY,
  device_mac TEXT NOT NULL,
  image_name TEXT NOT NULL,
  chunk_index INT NOT NULL,
  chunk_data INT[] NOT NULL, -- Store as integer array
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_chunk_buffer_device_image 
  ON edge_chunk_buffer(device_mac, image_name);

CREATE INDEX IF NOT EXISTS idx_edge_chunk_buffer_expires 
  ON edge_chunk_buffer(expires_at);

COMMENT ON TABLE edge_chunk_buffer IS 'Temporary storage for MQTT image chunks during transmission. Auto-expires after 30 minutes.';
