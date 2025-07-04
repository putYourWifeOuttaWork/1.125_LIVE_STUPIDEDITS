-- Add new migration to remove the watering_schedule column from petri_observations
-- This migration should run after the existing migrations

-- First, alter the table to remove the column
ALTER TABLE petri_observations DROP COLUMN IF EXISTS watering_schedule;

-- Update any existing triggers or functions that might reference this column
-- None to update as there are no specific triggers for watering_schedule