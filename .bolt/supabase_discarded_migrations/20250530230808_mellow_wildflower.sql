-- GRMTek Sporeless Pilot Program - Additional Auth and Profile RLS

-- Create users table for profiles
CREATE TABLE users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  company TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT email_unique UNIQUE (email)
);

-- Add column update trigger for users table
CREATE TRIGGER set_updated_at_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- Create function to handle new user profiles
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, company)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'company');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Update function to handle user updates
CREATE OR REPLACE FUNCTION handle_user_update() 
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET email = NEW.email,
      company = COALESCE(NEW.raw_user_meta_data->>'company', users.company)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update profile on user update
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_user_update();

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own profile
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Policy for users to update their own profile
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Policy for users to view other profiles in shared pilot programs
CREATE POLICY "Users can view profiles in shared programs" ON users
  FOR SELECT USING (
    id IN (
      SELECT pu.user_id FROM pilot_program_users pu
      WHERE pu.program_id IN (
        SELECT program_id FROM pilot_program_users
        WHERE user_id = auth.uid()
      )
    )
  );

-- Create storage bucket for profile avatars
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, FALSE, 5242880, '{image/jpeg,image/png,image/gif}');

-- Policy for users to upload their own avatar
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy for users to view avatars
CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars'
  );

-- Update auth.users triggers to handle deletions
CREATE OR REPLACE FUNCTION handle_deleted_user()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_deleted_user();

-- Add comment for documentation
COMMENT ON TABLE users IS 'Stores user profile information linked to auth.users.';