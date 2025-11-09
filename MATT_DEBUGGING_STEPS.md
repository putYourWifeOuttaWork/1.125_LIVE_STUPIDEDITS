# Debugging Steps for Matt's Program Visibility Issue

## Current Status

- ✅ Matt is configured as super admin in database
- ✅ 12 programs exist in Matt's company
- ✅ Database queries work with service role
- ✅ View `pilot_programs_with_progress` returns data correctly
- ❌ Matt cannot see programs in the frontend

## Critical Next Steps

### Step 1: Check Matt's Browser Session

Have Matt open the browser console (F12) and run:

```javascript
// Check if user is authenticated
const session = await supabase.auth.getSession();
console.log('Session:', session);
console.log('User ID:', session.data.session?.user?.id);
console.log('Email:', session.data.session?.user?.email);
```

**Expected Result:** Should show Matt's user ID: `e0e9d5ba-6437-4625-aad1-4c23e5d77234`

**If NULL or different:** Matt is not logged in or has wrong session

### Step 2: Check What the Frontend Query Returns

In browser console:

```javascript
// Import supabase client
import { supabase } from './src/lib/supabaseClient';

// Run the exact query the frontend uses
const { data, error } = await supabase
  .from('pilot_programs_with_progress')
  .select('*, phases')
  .order('name');

console.log('Programs returned:', data?.length);
console.log('Error:', error);
console.log('Data:', data);
```

**Expected Result:** Should return 12 programs

**If 0 programs:** RLS is blocking the query

**If error:** Check the error message

### Step 3: Check RLS Policies Are Applied

Run this in Supabase SQL Editor:

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  CASE
    WHEN cmd = 'SELECT' THEN 'Read'
    WHEN cmd = 'INSERT' THEN 'Create'
    WHEN cmd = 'UPDATE' THEN 'Update'
    WHEN cmd = 'DELETE' THEN 'Delete'
  END as operation
FROM pg_policies
WHERE tablename = 'pilot_programs'
  AND schemaname = 'public'
ORDER BY policyname, cmd;
```

**Expected Policies:**
- "Super admins can view all programs" (SELECT)
- "Company admins can view company programs" (SELECT)
- "Users can view programs with explicit access" (SELECT)

**If missing:** The migration wasn't applied

### Step 4: Test RLS with Matt's User ID

Run this in Supabase SQL Editor:

```sql
-- Set the user context to Matt
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "e0e9d5ba-6437-4625-aad1-4c23e5d77234"}';

-- Test the query
SELECT
  program_id,
  name,
  company_id
FROM pilot_programs
ORDER BY name;

-- Reset
RESET ROLE;
```

**Expected Result:** Should return 12 programs

**If 0:** RLS policies are incorrectly configured

### Step 5: Apply the RLS Migration

If not yet applied, run this in Supabase SQL Editor:

1. Go to: `https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql`
2. Copy entire contents of: `supabase/migrations/20251109000012_fix_rls_policies_direct_queries.sql`
3. Paste and click "Run"
4. Verify no errors

### Step 6: Clear Frontend State

Have Matt:

1. Open Developer Tools (F12)
2. Go to Application tab
3. Clear all:
   - Local Storage
   - Session Storage
   - Cookies
4. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
5. Log out completely
6. Log back in

### Step 7: Check Network Requests

With browser DevTools open (Network tab):

1. Filter by "Fetch/XHR"
2. Navigate to Programs page
3. Look for request to `/rest/v1/pilot_programs_with_progress`
4. Check the response

**What to look for:**
- Status code (should be 200)
- Response body (should have programs array)
- Request headers (should have Authorization token)

### Step 8: Add Debugging to Frontend

Temporarily add this to `src/hooks/usePilotPrograms.ts` at line 60:

```typescript
queryFn: async () => {
  if (!user) return [];

  logger.debug('Fetching programs for user:', user.id);

  // ADD THIS DEBUG CODE
  const session = await supabase.auth.getSession();
  console.log('=== PROGRAM FETCH DEBUG ===');
  console.log('User from store:', user);
  console.log('Session:', session.data.session?.user);
  console.log('Session exists:', !!session.data.session);
  // END DEBUG CODE

  const { data, error } = await withRetry(() =>
    supabase
      .from('pilot_programs_with_progress')
      .select('*, phases')
      .order('name')
  , 'fetchPilotPrograms');

  // ADD THIS DEBUG CODE
  console.log('Query result:', { dataCount: data?.length, error });
  console.log('Programs:', data);
  // END DEBUG CODE

  if (error) {
    logger.error('Error fetching programs:', error);
    throw error;
  }

  logger.debug(`Successfully fetched ${data?.length || 0} programs`);

  return sortProgramsByPhase(data || []);
},
```

Then check the browser console for the debug output.

## Common Issues & Solutions

### Issue 1: Session is null/undefined
**Cause:** Matt is not logged in or session expired
**Solution:**
- Log out completely
- Clear browser storage
- Log back in

### Issue 2: RLS returns 0 programs
**Cause:** RLS policies are blocking access
**Solution:**
- Apply the migration file
- Verify Matt's `is_super_admin = true`
- Check if `auth.uid()` resolves correctly

### Issue 3: Error: "relation does not exist"
**Cause:** View is not created or wrong schema
**Solution:**
- Check if `pilot_programs_with_progress` view exists
- Apply view creation migration

### Issue 4: Error: "JWT expired"
**Cause:** Auth token expired
**Solution:**
- Refresh the page
- Log out and back in

### Issue 5: Programs array is empty but no error
**Cause:** RLS silently filters out all results
**Solution:**
- This is the most likely issue
- Apply the RLS fix migration
- Verify policies allow super admins to see all

## Quick Fix: Temporarily Disable RLS

**WARNING: ONLY FOR TESTING - NOT FOR PRODUCTION**

To test if RLS is the issue, temporarily disable it:

```sql
ALTER TABLE pilot_programs DISABLE ROW LEVEL SECURITY;
```

Then check if Matt can see programs. If yes, the issue is definitely RLS.

**Don't forget to re-enable:**

```sql
ALTER TABLE pilot_programs ENABLE ROW LEVEL SECURITY;
```

## Next Steps Based on Findings

### If Matt's session is invalid:
1. Fix authentication flow
2. Check token refresh logic
3. Verify Supabase auth configuration

### If RLS is blocking:
1. Apply the RLS migration
2. Verify policies exist
3. Test policies with Matt's user ID

### If view is broken:
1. Check view definition
2. Verify SECURITY INVOKER is set
3. Grant proper permissions on view

### If none of the above:
1. Check Supabase project health
2. Review Supabase logs for errors
3. Test with a different browser/incognito mode

## Contact Points

When reporting issues, provide:
- Browser console errors (screenshot)
- Network tab showing the request/response
- Result of session check
- Result of direct SQL query test
