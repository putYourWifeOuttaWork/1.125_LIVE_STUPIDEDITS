/*
  # Fix all audit trigger functions - add SECURITY DEFINER

  1. Problem
    - 5 audit trigger functions insert into `pilot_program_history` table
    - That table has RLS enabled with only a SELECT policy (no INSERT policy)
    - These functions run as the authenticated user, so the INSERT is blocked by RLS
    - Result: program creation fails (via log_program_user_history chain),
      site operations fail (via log_site_history), and submission/observation
      audit records are silently lost (swallowed by try/catch)

  2. Functions Fixed (all changed to SECURITY DEFINER)
    - `log_site_history` - fires on sites INSERT/UPDATE/DELETE
    - `log_program_user_history` - fires on pilot_program_users INSERT/UPDATE/DELETE
    - `log_submission_history` - fires on submissions INSERT/UPDATE/DELETE
    - `log_petri_observation_history` - fires on petri_observations INSERT/UPDATE/DELETE
    - `log_gasifier_observation_history` - fires on gasifier_observations INSERT/UPDATE/DELETE

  3. Security Notes
    - SECURITY DEFINER is the standard pattern for audit/history trigger functions
    - These functions are only invoked by triggers, not directly by users
    - They only write to the audit table with data from the triggering operation
    - This ensures audit records are always written regardless of user RLS
*/

-- 1. Fix log_site_history
CREATE OR REPLACE FUNCTION public.log_site_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;

  IF TG_OP = 'INSERT' THEN
    history_type := 'SiteCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'SiteUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'SiteDeletion';
  END IF;

  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;

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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.site_id ELSE NEW.site_id END,
    'site',
    program_id_val,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN NULL;
END;
$function$;


-- 2. Fix log_program_user_history
CREATE OR REPLACE FUNCTION public.log_program_user_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
  target_user_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;

  IF TG_OP = 'DELETE' THEN
    SELECT email INTO target_user_email FROM users WHERE id = OLD.user_id;
  ELSE
    SELECT email INTO target_user_email FROM users WHERE id = NEW.user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    history_type := 'UserAdded';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role != NEW.role THEN
      history_type := 'UserRoleChanged';
    ELSE
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'UserRemoved';
  END IF;

  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;

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
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    'program_user',
    program_id_val,
    user_details.user_id,
    user_details.user_email,
    user_details.user_company,
    user_details.user_role,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE'
      THEN jsonb_build_object(
        'id', OLD.id,
        'program_id', OLD.program_id,
        'user_id', OLD.user_id,
        'role', OLD.role,
        'user_email', target_user_email
      )
      ELSE NULL
    END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE'
      THEN jsonb_build_object(
        'id', NEW.id,
        'program_id', NEW.program_id,
        'user_id', NEW.user_id,
        'role', NEW.role,
        'user_email', target_user_email
      )
      ELSE NULL
    END
  );

  RETURN NULL;
END;
$function$;


-- 3. Fix log_submission_history
CREATE OR REPLACE FUNCTION public.log_submission_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;

  IF TG_OP = 'INSERT' THEN
    history_type := 'SubmissionCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'SubmissionUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'SubmissionDeletion';
  END IF;

  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;

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
      RAISE WARNING 'Failed to log submission history: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;


-- 4. Fix log_petri_observation_history
CREATE OR REPLACE FUNCTION public.log_petri_observation_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = OLD.submission_id;
  ELSE
    SELECT program_id INTO program_id_val FROM submissions WHERE submission_id = NEW.submission_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    history_type := 'PetriCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'PetriUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'PetriDeletion';
  END IF;

  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;

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
      RAISE WARNING 'Failed to log petri observation history: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;


-- 5. Fix log_gasifier_observation_history
CREATE OR REPLACE FUNCTION public.log_gasifier_observation_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  history_type history_event_type_enum;
  user_details RECORD;
  program_id_val UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  program_id_val := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;

  IF TG_OP = 'INSERT' THEN
    history_type := 'GasifierCreation';
  ELSIF TG_OP = 'UPDATE' THEN
    history_type := 'GasifierUpdate';
  ELSIF TG_OP = 'DELETE' THEN
    history_type := 'GasifierDeletion';
  END IF;

  SELECT * FROM get_user_audit_details(program_id_val) INTO user_details;

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
      'gasifier_observation',
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
      RAISE WARNING 'Failed to log gasifier observation history: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;