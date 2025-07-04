-- Drop the existing insert policy if it exists
DROP POLICY IF EXISTS "pilot_programs_insert" ON "public"."pilot_programs";

-- Create a new insert policy that properly allows authenticated users to create programs
CREATE POLICY "pilot_programs_insert" 
ON "public"."pilot_programs"
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- This policy allows any authenticated user to create a new pilot program