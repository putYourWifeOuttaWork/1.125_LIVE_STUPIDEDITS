-- Fix issues with petri_observations and RLS policies

-- Step 1: Ensure plant_type column exists with proper default
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'petri_observations'
        AND column_name = 'plant_type'
    ) THEN
        -- Column exists, make sure it has a default value
        ALTER TABLE public.petri_observations 
        ALTER COLUMN plant_type SET DEFAULT 'Other Fresh Perishable'::plant_type_enum;
    ELSE
        -- Column doesn't exist, add it
        ALTER TABLE public.petri_observations 
        ADD COLUMN plant_type plant_type_enum DEFAULT 'Other Fresh Perishable'::plant_type_enum;
    END IF;
END $$;

-- Step 2: Ensure program_id column exists with proper relation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'petri_observations'
        AND column_name = 'program_id'
    ) THEN
        -- Column doesn't exist, add it
        ALTER TABLE public.petri_observations 
        ADD COLUMN program_id uuid;
        
        -- Add foreign key constraint if it doesn't exist
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_name = 'petri_observations_program_id_fkey'
            AND table_schema = 'public' AND table_name = 'petri_observations'
        ) THEN
            ALTER TABLE public.petri_observations
            ADD CONSTRAINT petri_observations_program_id_fkey
            FOREIGN KEY (program_id) REFERENCES public.pilot_programs(program_id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Step 3: Create function to set program_id automatically
CREATE OR REPLACE FUNCTION public.set_petri_program_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.program_id := (SELECT program_id FROM public.submissions WHERE submission_id = NEW.submission_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Add trigger to set program_id if it doesn't exist
DROP TRIGGER IF EXISTS set_petri_program_id_trigger ON public.petri_observations;
CREATE TRIGGER set_petri_program_id_trigger
BEFORE INSERT ON public.petri_observations
FOR EACH ROW EXECUTE FUNCTION public.set_petri_program_id();

-- Step 5: Update existing petri_observations with program_id where missing
UPDATE public.petri_observations po
SET program_id = s.program_id
FROM public.submissions s
WHERE po.submission_id = s.submission_id
AND po.program_id IS NULL;

-- Step 6: Fix RLS policies for the pilot_program_history table
DO $$
BEGIN
    -- Drop the policy if it exists
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public' 
        AND tablename = 'pilot_program_history'
        AND policyname = 'Users can insert history records'
    ) THEN
        DROP POLICY "Users can insert history records" ON public.pilot_program_history;
    END IF;
END $$;

-- Create a policy allowing any authenticated user to insert history records
CREATE POLICY "Users can insert history records"
ON public.pilot_program_history
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Step 7: Fix history event trigger functions to handle missing auth context
CREATE OR REPLACE FUNCTION log_submission_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Handle the case when the operation is performed by the system or during migration
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- Skip logging if there's no authenticated user (like during migrations)
  END IF;
  
  -- Determine program ID based on operation
  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'SubmissionCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'SubmissionUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'SubmissionDeletion';
  END IF;
  
  -- Get user details
  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;
  
  -- Insert history record - with try/catch to prevent failures from propagating
  BEGIN
    INSERT INTO pilot_program_history (
      update_type, 
      object_id, 
      object_type,
      program_id,
      user_id,
      user_email,
      user_company,
      user_role,
      old_data, 
      new_data
    )
    VALUES (
      history_type,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.submission_id ELSE NEW.submission_id END,
      'submission',
      program_id_val,
      user_details.user_id,
      user_details.user_email,
      user_details.user_company,
      user_details.user_role,
      CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
    );
  EXCEPTION 
    WHEN OTHERS THEN
      -- Log the error but don't fail the transaction
      RAISE WARNING 'Failed to log submission history: %', SQLERRM;
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Similar fix for petri observations history function
CREATE OR REPLACE FUNCTION log_petri_observation_history()
RETURNS TRIGGER AS $$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  -- Handle the case when the operation is performed by the system or during migration
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- Skip logging if there's no authenticated user (like during migrations)
  END IF;

  -- We need to get the program_id from the submission
  IF TG_OP = 'DELETE' THEN
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = OLD.submission_id;
  ELSE
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = NEW.submission_id;
  END IF;
  
  -- Determine the history event type
  IF TG_OP = 'INSERT' THEN
    history_type := 'PetriCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'PetriUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'PetriDeletion';
  END IF;
  
  -- Get user details
  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;
  
  -- Insert history record with try/catch to prevent failures from propagating
  BEGIN
    INSERT INTO pilot_program_history (
      update_type, 
      object_id, 
      object_type,
      program_id,
      user_id,
      user_email,
      user_company,
      user_role,
      old_data, 
      new_data
    )
    VALUES (
      history_type,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.observation_id ELSE NEW.observation_id END,
      'petri_observation',
      program_id_val,
      user_details.user_id,
      user_details.user_email,
      user_details.user_company,
      user_details.user_role,
      CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
    );
  EXCEPTION 
    WHEN OTHERS THEN
      -- Log the error but don't fail the transaction
      RAISE WARNING 'Failed to log petri observation history: %', SQLERRM;
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;