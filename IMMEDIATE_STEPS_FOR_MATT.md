# Immediate Steps for Matt to See Programs

## What We Know

✅ Matt is configured as super admin in the database
✅ 12 programs exist in Matt's company
✅ Database and queries work correctly
❌ Matt cannot see programs in the frontend (shows empty state)

## Most Likely Cause

The frontend is not properly applying RLS policies, OR Matt's browser session is not authenticated correctly.

## STEP-BY-STEP SOLUTION

### Step 1: Have Matt Log Out and Clear Everything

1. **Log out** of the application completely
2. Open **Browser Developer Tools** (Press F12)
3. Go to the **Application** tab
4. Under **Storage**, clear:
   - **Local Storage** → Click "Clear All"
   - **Session Storage** → Click "Clear All"
   - **Cookies** → Delete all cookies for the site
5. **Close the browser completely**
6. **Reopen the browser**

### Step 2: Log Back In and Check Console

1. Open **Browser Developer Tools** (F12) BEFORE logging in
2. Go to the **Console** tab
3. Log in as matt@grmtek.com
4. Navigate to the Programs page
5. Look for output that says `=== PROGRAM FETCH DEBUG ===`

You should see something like this:

```
=== PROGRAM FETCH DEBUG ===
User from store: {id: "e0e9d5ba-6437-4625-aad1-4c23e5d77234", email: "matt@grmtek.com", ...}
Session user: {id: "e0e9d5ba-6437-4625-aad1-4c23e5d77234", email: "matt@grmtek.com", ...}
Session exists: true
Auth UID should be: e0e9d5ba-6437-4625-aad1-4c23e5d77234
Query result: {dataCount: 12, error: null, hasData: true}
First program: Alternate Garage
=== END DEBUG ===
```

### Step 3: Interpret the Debug Output

#### Scenario A: "Session exists: false"
**Problem:** Matt is not logged in
**Solution:**
- Log out completely
- Clear browser cache/storage again
- Try logging in with a different browser
- Check if password is correct

#### Scenario B: "Session exists: true" but "dataCount: 0"
**Problem:** RLS is blocking access
**Solution:** Apply the RLS migration (see Step 4 below)

#### Scenario C: "error: [some error message]"
**Problem:** Database or query error
**Solution:** Check the error message and report it

#### Scenario D: "dataCount: 12" but still no programs showing
**Problem:** Frontend rendering issue
**Solution:**
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Check for JavaScript errors in console
- Try a different browser

### Step 4: Apply the RLS Migration (If Not Done)

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql

2. **Copy this entire SQL block** and paste into the SQL Editor:

```sql
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Super admins can view all programs" ON pilot_programs;
DROP POLICY IF EXISTS "Company admins can view company programs" ON pilot_programs;
DROP POLICY IF EXISTS "Users can view programs with explicit access" ON pilot_programs;

-- Recreate with direct subqueries
CREATE POLICY "Super admins can view all programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_super_admin = true
  )
);

CREATE POLICY "Company admins can view company programs"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND users.is_company_admin = true
      AND users.company_id IS NOT NULL
      AND pilot_programs.company_id = users.company_id
  )
);

CREATE POLICY "Users can view programs with explicit access"
ON pilot_programs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    JOIN pilot_program_users ppu ON ppu.user_id = users.id
    WHERE users.id = auth.uid()
      AND ppu.program_id = pilot_programs.program_id
      AND pilot_programs.company_id = users.company_id
  )
);

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_users_auth_lookup
ON users(id, company_id, is_company_admin, is_super_admin);

CREATE INDEX IF NOT EXISTS idx_pilot_program_users_lookup
ON pilot_program_users(user_id, program_id);
```

3. Click **"Run"**

4. Verify no errors appear

5. Have Matt **log out and log back in**

### Step 5: Verify Database Directly

Run this query in Supabase SQL Editor to confirm programs exist:

```sql
SELECT
  pp.program_id,
  pp.name,
  pp.company_id,
  u.email as matt_email,
  u.is_super_admin
FROM pilot_programs pp
CROSS JOIN users u
WHERE u.email = 'matt@grmtek.com'
  AND (
    u.is_super_admin = true
    OR pp.company_id = u.company_id
  )
ORDER BY pp.name;
```

**Expected Result:** Should return 12 rows

**If 0 rows:** Something is wrong with the data or query

### Step 6: Nuclear Option - Temporarily Disable RLS

**⚠️ WARNING: ONLY FOR TESTING - NOT FOR PRODUCTION USE**

If nothing else works, temporarily disable RLS to confirm that's the issue:

```sql
ALTER TABLE pilot_programs DISABLE ROW LEVEL SECURITY;
```

Have Matt check if he can see programs now.

**If YES:** The issue is definitely with RLS policies.

**Don't forget to re-enable RLS:**

```sql
ALTER TABLE pilot_programs ENABLE ROW LEVEL SECURITY;
```

Then properly apply the RLS migration from Step 4.

## What to Send Back

When reporting results, please provide:

1. **Screenshot of browser console** showing the debug output
2. **Screenshot of the Programs page** (showing empty state or programs)
3. **Result of the database query** from Step 5
4. **Any error messages** from the console or network tab

## Quick Reference: Browser Console Commands

Open console (F12) and run these to get info:

```javascript
// Check if logged in
const session = await supabase.auth.getSession();
console.log('Logged in:', !!session.data.session);
console.log('User:', session.data.session?.user?.email);

// Try to fetch programs directly
const { data, error } = await supabase
  .from('pilot_programs_with_progress')
  .select('*')
  .order('name');
console.log('Programs:', data?.length);
console.log('Error:', error);
console.log('Data:', data);
```

## Expected Final Outcome

After following all steps, Matt should:
- ✅ See 12 programs on the Programs page
- ✅ Be able to click into any program
- ✅ Be able to create new programs
- ✅ Be able to view sites, submissions, etc.

## If Still Not Working

Contact the development team with:
- All screenshots from above
- Browser and version (e.g., Chrome 120)
- Operating system
- Any error messages
- Results of the debug console output
