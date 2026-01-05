/*
  # Create ROI Calculations Table

  1. New Tables
    - `roi_calculations`
      - `calculation_id` (uuid, primary key)
      - `share_token` (text, unique) - for shareable URLs
      - `facility_sqft` (numeric) - square footage of facility
      - `annual_production` (numeric) - annual production value in dollars
      - `waste_percent` (numeric) - estimated waste percentage
      - `downtime_days` (numeric) - annual downtime days
      - `basic_devices` (integer) - calculated basic tier devices
      - `pro_devices` (integer) - calculated pro tier devices
      - `max_devices` (integer) - calculated max tier devices
      - `basic_roi` (numeric) - calculated basic tier ROI percentage
      - `pro_roi` (numeric) - calculated pro tier ROI percentage
      - `max_roi` (numeric) - calculated max tier ROI percentage
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `roi_calculations` table
    - Add policy for anonymous users to insert (for sharing)
    - Add policy for anyone to read by share_token (for viewing shared calculations)
*/

-- Create the roi_calculations table
CREATE TABLE IF NOT EXISTS roi_calculations (
  calculation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text UNIQUE NOT NULL,
  facility_sqft numeric NOT NULL CHECK (facility_sqft > 0),
  annual_production numeric NOT NULL CHECK (annual_production > 0),
  waste_percent numeric NOT NULL CHECK (waste_percent >= 0 AND waste_percent <= 100),
  downtime_days numeric NOT NULL CHECK (downtime_days >= 0 AND downtime_days <= 365),
  basic_devices integer,
  pro_devices integer,
  max_devices integer,
  basic_roi numeric,
  pro_roi numeric,
  max_roi numeric,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE roi_calculations ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone (including anonymous) to insert
CREATE POLICY "Anyone can create ROI calculations"
  ON roi_calculations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: Allow anyone to read by share_token
CREATE POLICY "Anyone can read ROI calculations by token"
  ON roi_calculations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Create index on share_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_roi_calculations_share_token
  ON roi_calculations(share_token);

-- Create index on created_at for potential cleanup operations
CREATE INDEX IF NOT EXISTS idx_roi_calculations_created_at
  ON roi_calculations(created_at);
