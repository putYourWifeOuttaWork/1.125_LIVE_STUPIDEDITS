#!/usr/bin/env node

/**
 * Apply Auth Trigger and Permissions Migration
 *
 * This script applies the auth trigger that automatically creates user records
 * when new users sign up, and adds RPC functions for managing user permissions.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const migrationSQL = `
/*
  # Auth Trigger and Permissions System

  1. Purpose
    - Automatically create user records when auth.users are created
    - Provide RPC functions for user permission management
    - Support staged access control (demo → company member → privileged)

  2. New Functions
    - handle_new_auth_user() - Trigger function to auto-create user records
    - grant_super_admin(uuid) - Super admin only - grant super admin status
    - revoke_super_admin(uuid) - Super admin only - revoke super admin status
    - update_user_permissions(uuid, user_role, export_rights) - Admin function for managing user permissions

  3. Security
    - Trigger runs with SECURITY DEFINER to bypass RLS
    - Permission functions check caller has appropriate admin rights
    - All functions include proper error handling

  4. Notes
    - New users default to: is_active=true, user_role='observer', export_rights='None', company_id=NULL
    - Users remain in "demo" state until assigned to a company
*/

-- =====================================================
-- TRIGGER FUNCTION: Auto-create user records on signup
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  -- Extract full_name from metadata if available
  v_full_name := NEW.raw_user_meta_data->>'full_name';

  -- Create user record in public.users
  INSERT INTO public.users (
    id,
    email,
    full_name,
    company_id,
    is_active,
    is_company_admin,
    is_super_admin,
    user_role,
    export_rights,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    NULL,  -- No company assignment on signup
    true,  -- Active by default
    false, -- Not an admin
    false, -- Not a super admin
    'observer', -- Default role
    'None', -- Default export rights
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Avoid errors if user already exists

  RETURN NEW;
END;
$$;

-- =====================================================
-- CREATE TRIGGER: Run on auth.users insert
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- =====================================================
-- RPC: Grant super admin status
-- =====================================================

CREATE OR REPLACE FUNCTION public.grant_super_admin(p_user_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_is_super_admin BOOLEAN;
  v_target_user_exists BOOLEAN;
BEGIN
  -- Check if caller is a super admin
  SELECT is_super_admin INTO v_caller_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT COALESCE(v_caller_is_super_admin, false) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Only super admins can grant super admin status'
    );
  END IF;

  -- Check if target user exists
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = p_user_id
  ) INTO v_target_user_exists;

  IF NOT v_target_user_exists THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Grant super admin status
  UPDATE users
  SET is_super_admin = true,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Super admin status granted successfully'
  );
END;
$$;

-- =====================================================
-- RPC: Revoke super admin status
-- =====================================================

CREATE OR REPLACE FUNCTION public.revoke_super_admin(p_user_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_is_super_admin BOOLEAN;
  v_target_user_exists BOOLEAN;
  v_super_admin_count INTEGER;
BEGIN
  -- Check if caller is a super admin
  SELECT is_super_admin INTO v_caller_is_super_admin
  FROM users
  WHERE id = auth.uid();

  IF NOT COALESCE(v_caller_is_super_admin, false) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Only super admins can revoke super admin status'
    );
  END IF;

  -- Prevent removing last super admin
  SELECT COUNT(*) INTO v_super_admin_count
  FROM users
  WHERE is_super_admin = true AND is_active = true;

  IF v_super_admin_count <= 1 THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cannot revoke the last super admin'
    );
  END IF;

  -- Check if target user exists
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = p_user_id
  ) INTO v_target_user_exists;

  IF NOT v_target_user_exists THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Prevent self-revocation
  IF p_user_id = auth.uid() THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cannot revoke your own super admin status'
    );
  END IF;

  -- Revoke super admin status
  UPDATE users
  SET is_super_admin = false,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Super admin status revoked successfully'
  );
END;
$$;

-- =====================================================
-- RPC: Update user permissions (role and export rights)
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_user_permissions(
  p_user_id UUID,
  p_user_role TEXT DEFAULT NULL,
  p_export_rights TEXT DEFAULT NULL
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_caller_company_id UUID;
  v_target_company_id UUID;
  v_target_user_exists BOOLEAN;
BEGIN
  -- Check if caller has admin rights
  SELECT
    COALESCE(is_super_admin, false) OR COALESCE(is_company_admin, false),
    company_id
  INTO v_caller_is_admin, v_caller_company_id
  FROM users
  WHERE id = auth.uid();

  IF NOT v_caller_is_admin THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Only admins can update user permissions'
    );
  END IF;

  -- Check if target user exists and get their company
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = p_user_id
  ), company_id
  INTO v_target_user_exists, v_target_company_id
  FROM users
  WHERE id = p_user_id;

  IF NOT v_target_user_exists THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Company admins can only manage users in their company
  IF v_caller_company_id IS NOT NULL AND v_target_company_id != v_caller_company_id THEN
    RETURN json_build_object(
      'success', false,
      'message', 'You can only manage users in your own company'
    );
  END IF;

  -- Validate user_role if provided
  IF p_user_role IS NOT NULL AND p_user_role NOT IN ('observer', 'analyst', 'maintenance', 'sysAdmin') THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid user role. Must be: observer, analyst, maintenance, or sysAdmin'
    );
  END IF;

  -- Validate export_rights if provided
  IF p_export_rights IS NOT NULL AND p_export_rights NOT IN ('None', 'history', 'history_and_analytics', 'all') THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid export rights. Must be: None, history, history_and_analytics, or all'
    );
  END IF;

  -- Update permissions
  UPDATE users
  SET
    user_role = COALESCE(p_user_role::user_role, user_role),
    export_rights = COALESCE(p_export_rights::export_rights, export_rights),
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'User permissions updated successfully'
  );
END;
$$;

-- =====================================================
-- RPC: Get user permission status (for UI)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_permission_status()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_record RECORD;
BEGIN
  SELECT
    id,
    company_id,
    is_super_admin,
    is_company_admin,
    is_active,
    user_role,
    export_rights
  INTO v_user_record
  FROM users
  WHERE id = auth.uid();

  IF v_user_record.id IS NULL THEN
    RETURN json_build_object(
      'has_company', false,
      'is_super_admin', false,
      'is_company_admin', false,
      'is_active', false,
      'in_demo_mode', true,
      'user_role', 'observer',
      'export_rights', 'None'
    );
  END IF;

  RETURN json_build_object(
    'has_company', v_user_record.company_id IS NOT NULL,
    'is_super_admin', COALESCE(v_user_record.is_super_admin, false),
    'is_company_admin', COALESCE(v_user_record.is_company_admin, false),
    'is_active', COALESCE(v_user_record.is_active, false),
    'in_demo_mode', v_user_record.company_id IS NULL,
    'user_role', COALESCE(v_user_record.user_role, 'observer'),
    'export_rights', COALESCE(v_user_record.export_rights, 'None'),
    'company_id', v_user_record.company_id
  );
END;
$$;

-- =====================================================
-- Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_permissions(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_permission_status() TO authenticated;
`;

async function applyMigration() {
  console.log('Applying auth trigger and permissions migration...\n');

  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });

    if (error) {
      // Try direct execution if exec_sql doesn't exist
      console.log('exec_sql RPC not found, trying direct execution...\n');

      // Split into individual statements and execute
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          const { error: execError } = await supabase.rpc('exec', { sql: statement + ';' });
          if (execError) {
            console.error('Error executing statement:', execError);
            throw execError;
          }
        }
      }
    }

    console.log('✅ Migration applied successfully!\n');
    console.log('Created:');
    console.log('  - handle_new_auth_user() trigger function');
    console.log('  - on_auth_user_created trigger on auth.users');
    console.log('  - grant_super_admin() RPC function');
    console.log('  - revoke_super_admin() RPC function');
    console.log('  - update_user_permissions() RPC function');
    console.log('  - get_user_permission_status() RPC function');
    console.log('\nNew users will now automatically be created in demo mode!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n📋 SQL to apply manually:\n');
    console.log(migrationSQL);
    process.exit(1);
  }
}

applyMigration();
