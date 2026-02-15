/*
  # Fix pilot_program_history INSERT RLS violation

  1. Problem
    - The `log_pilot_program_history` trigger function inserts into `pilot_program_history`
      after a program is created/updated/deleted
    - The function runs as the authenticated user (not SECURITY DEFINER)
    - The `pilot_program_history` table has RLS enabled but only a SELECT policy
    - No INSERT policy exists, so the trigger fails with an RLS violation

  2. Fix
    - Recreate the `log_pilot_program_history` function with SECURITY DEFINER
    - This allows the audit trigger to bypass RLS when inserting history records
    - This is the standard pattern for audit/history triggers since they are
      system-managed and should not be restricted by user-level policies

  3. Security Notes
    - The function is a trigger function, not directly callable by users
    - It only inserts into the history table with data from the triggering operation
    - SECURITY DEFINER is appropriate here because audit logs must always succeed
*/

CREATE OR REPLACE FUNCTION public.log_pilot_program_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    history_type := 'ProgramCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'ProgramUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'ProgramDeletion';
  END IF;

  SELECT * FROM get_user_audit_details(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END
  ) INTO user_details;

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
    new_data,
    company_id
  )
  VALUES (
    history_type,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END,
    'pilot_program',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END
  );

  RETURN NULL;
END;
$function$;