/*
  # Fix Pilot Programs Insert Policy

  1. Changes
    - Drop the existing pilot_programs_insert policy
    - Create a new properly configured insert policy for pilot_programs table
    
  2. Reason for Change
    - The current policy is not allowing authenticated users to create new pilot programs
    - This results in 403 errors when attempting to insert new records
*/

-- Drop the existing insert policy if it exists
DROP POLICY IF EXISTS "pilot_programs_insert" ON "public"."pilot_programs";

-- Create a new insert policy that properly allows authenticated users to create programs
CREATE POLICY "pilot_programs_insert" 
ON "public"."pilot_programs"
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- This policy allows any authenticated user to create a new pilot program