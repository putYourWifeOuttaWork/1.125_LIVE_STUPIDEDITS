-- Add Company Object and RLS Changes
-- This migration adds a company entity and enhances RLS policies to support company-based read access

-- 1. Create companies table
CREATE TABLE companies (
  company_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  website VARCHAR(255),
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add trigger for updated_at
CREATE TRIGGER set_updated_at_companies
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- 2. Add company_id to users table
ALTER TABLE users ADD COLUMN company_id UUID REFERENCES companies(company_id);
ALTER TABLE users ADD COLUMN is_company_admin BOOLEAN DEFAULT FALSE;

-- 3. Add company_id to pilot_programs table
ALTER TABLE pilot_programs ADD COLUMN company_id UUID REFERENCES companies(company_id);

-- 4. Create a function to handle company assignment during user registration/update
CREATE OR REPLACE FUNCTION handle_user_company()
RETURNS TRIGGER AS $$
DECLARE
  company_name_val TEXT;
  company_id_val UUID;
BEGIN
  -- Get company name from user metadata
  company_name_val := NEW.raw_user_meta_data->>'company';
  
  IF company_name_val IS NOT NULL AND company_name_val != '' THEN
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
      IF (SELECT company_id FROM users WHERE id = NEW.id) != company_id_val THEN
        UPDATE users SET company_id = company_id_val WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update or create triggers for user company management
DROP TRIGGER IF EXISTS on_auth_user_created_company ON auth.users;
CREATE TRIGGER on_auth_user_created_company
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_user_company();

DROP TRIGGER IF EXISTS on_auth_user_updated_company ON auth.users;
CREATE TRIGGER on_auth_user_updated_company
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_user_company();

-- 6. Update the handle_new_pilot_program function to set company_id
CREATE OR REPLACE FUNCTION handle_new_pilot_program() 
RETURNS TRIGGER AS $$
DECLARE
  user_company_id UUID;
BEGIN
  -- Insert the creator as an Admin
  INSERT INTO public.pilot_program_users (program_id, user_id, role)
  VALUES (NEW.program_id, auth.uid(), 'Admin');
  
  -- Set the company_id based on the creator's company
  SELECT company_id INTO user_company_id FROM users WHERE id = auth.uid();
  
  IF user_company_id IS NOT NULL THEN
    UPDATE pilot_programs SET company_id = user_company_id WHERE program_id = NEW.program_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to check if user is a company admin
CREATE OR REPLACE FUNCTION is_company_admin(target_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() 
    AND company_id = target_company_id
    AND is_company_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies for companies table

-- Policy for viewing companies
CREATE POLICY "Users can view their own company" ON companies
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND company_id IS NOT NULL
    )
  );

-- Policy for updating companies (only company admins)
CREATE POLICY "Company admins can update their company" ON companies
  FOR UPDATE
  USING (
    is_company_admin(company_id)
  );

-- 10. Add comments for documentation
COMMENT ON TABLE companies IS 'Stores company information.';
COMMENT ON COLUMN users.company_id IS 'Foreign key to companies.company_id.';
COMMENT ON COLUMN users.is_company_admin IS 'Flag indicating if user is an admin for their company.';
COMMENT ON COLUMN pilot_programs.company_id IS 'Foreign key to companies.company_id.';

-- 11. Populate existing company_id for pilot programs based on creator
-- This is a best-effort update for existing data
DO $$
DECLARE
  program_rec RECORD;
  creator_company UUID;
BEGIN
  FOR program_rec IN 
    SELECT pp.program_id, ppu.user_id
    FROM pilot_programs pp
    JOIN pilot_program_users ppu ON pp.program_id = ppu.program_id
    WHERE ppu.role = 'Admin'
    AND pp.company_id IS NULL
  LOOP
    -- Get the company of the admin user
    SELECT company_id INTO creator_company
    FROM users
    WHERE id = program_rec.user_id
    LIMIT 1;
    
    -- Update the program if we found a company
    IF creator_company IS NOT NULL THEN
      UPDATE pilot_programs
      SET company_id = creator_company
      WHERE program_id = program_rec.program_id;
    END IF;
  END LOOP;
END $$;