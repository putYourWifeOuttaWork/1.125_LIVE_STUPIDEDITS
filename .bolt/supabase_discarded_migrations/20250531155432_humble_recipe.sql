-- Add ReadOnly to user_role_enum using ALTER TYPE in its own migration
-- This approach fixes the "unsafe use of new value" error by only adding the enum value
-- without using it in the same transaction

-- Add the ReadOnly value to the user_role_enum
DO $$
DECLARE
  enum_exists boolean;
  value_exists boolean;
BEGIN
  -- Check if the type exists
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'user_role_enum'
  ) INTO enum_exists;
  
  IF enum_exists THEN
    -- Check if the value already exists to avoid errors
    SELECT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'ReadOnly' 
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'user_role_enum'
      )
    ) INTO value_exists;
    
    IF NOT value_exists THEN
      -- Add the ReadOnly value to the enum
      EXECUTE 'ALTER TYPE user_role_enum ADD VALUE ''ReadOnly''';
    END IF;
  END IF;
END
$$;