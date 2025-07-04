-- Fix authentication triggers to handle edge cases properly
-- This migration addresses the "Database error granting user" issue

-- 1. Update the handle_new_user function to be more robust
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the user already exists in the public.users table
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    -- User already exists, just return
    RETURN NEW;
  END IF;

  -- Insert with proper error handling for NULL values
  INSERT INTO public.users (
    id, 
    email, 
    full_name, 
    company
  )
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', '')
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update the handle_user_update function to be more robust
CREATE OR REPLACE FUNCTION handle_user_update() 
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the user exists in the public.users table
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    -- User doesn't exist, create it
    INSERT INTO public.users (
      id, 
      email, 
      full_name, 
      company
    )
    VALUES (
      NEW.id, 
      NEW.email, 
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'company', '')
    );
  ELSE
    -- Update existing user
    UPDATE public.users
    SET 
      email = NEW.email,
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', users.full_name),
      company = COALESCE(NEW.raw_user_meta_data->>'company', users.company)
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE NOTICE 'Error in handle_user_update: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the handle_user_company function to be more robust
CREATE OR REPLACE FUNCTION handle_user_company()
RETURNS TRIGGER AS $$
DECLARE
  company_name_val TEXT;
  company_id_val UUID;
BEGIN
  -- Get company name from user metadata
  company_name_val := NEW.raw_user_meta_data->>'company';
  
  IF company_name_val IS NOT NULL AND company_name_val != '' THEN
    BEGIN
      -- Check if company exists
      SELECT company_id INTO company_id_val FROM companies WHERE name = company_name_val;
      
      -- If company doesn't exist, create it
      IF company_id_val IS NULL THEN
        INSERT INTO companies (name) VALUES (company_name_val)
        RETURNING company_id INTO company_id_val;
      END IF;
      
      -- Update the user's company_id in our users table
      IF TG_OP = 'INSERT' THEN
        UPDATE users SET company_id = company_id_val WHERE id = NEW.id;
      ELSIF TG_OP = 'UPDATE' THEN
        -- Only update if the company has changed
        IF (SELECT company_id FROM users WHERE id = NEW.id) IS DISTINCT FROM company_id_val THEN
          UPDATE users SET company_id = company_id_val WHERE id = NEW.id;
        END IF;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE NOTICE 'Error in handle_user_company: %', SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;