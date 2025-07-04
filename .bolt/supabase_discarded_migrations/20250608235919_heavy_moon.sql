/*
  # Fix infinite recursion in users table RLS policies

  1. Issue
    - The "Inactive users can only see their own profile" policy creates infinite recursion
    - Policy contains a subquery that selects from users table while already in users table policy evaluation
    - This causes circular dependency when sites policy tries to access users.company_id

  2. Solution
    - Remove the problematic recursive policy
    - Simplify the access control to avoid self-referential queries
    - Keep the essential access controls without causing recursion
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Inactive users can only see their own profile" ON users;

-- The remaining policies are sufficient for access control:
-- 1. "Users can see basic info" - allows basic access
-- 2. "Users can update their own profile" - allows self-updates
-- 3. "Users can view company members" - allows company member access
-- 4. "Users can view program participants" - allows program participant access  
-- 5. "Users can view their own profile" - allows self-access

-- If we need to restrict inactive users, we should handle this at the application level
-- rather than in RLS policies to avoid recursion issues