/*
  # Rollback: Auth Trigger and Permissions System

  1. Purpose
    - Remove auto-create auth trigger
    - Remove permission management RPC functions
    - Clean up functions that were causing re-render issues

  2. Functions Removed
    - handle_new_auth_user() - Auto-create trigger function
    - grant_super_admin(uuid) - Super admin management
    - revoke_super_admin(uuid) - Super admin revocation
    - update_user_permissions(uuid, user_role, export_rights) - Permission management
    - get_user_permission_status() - Permission status (causing re-renders)

  3. Triggers Removed
    - on_auth_user_created - Auth user insert trigger

  4. Notes
    - This rollback removes functionality added in 20260105030000
    - User management will revert to direct database queries
    - No data loss - only removes helper functions
*/

-- =====================================================
-- DROP TRIGGER: Remove auth user creation trigger
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- =====================================================
-- DROP FUNCTIONS: Remove all permission functions
-- =====================================================

DROP FUNCTION IF EXISTS public.get_user_permission_status();
DROP FUNCTION IF EXISTS public.update_user_permissions(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.revoke_super_admin(UUID);
DROP FUNCTION IF EXISTS public.grant_super_admin(UUID);
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
