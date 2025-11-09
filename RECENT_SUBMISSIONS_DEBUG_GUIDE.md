# Recent Submissions Debug Guide

## Current Status
The Recent Submissions component is not displaying any data despite:
- ✅ RPC function returning 200 OK status
- ✅ Migration has been applied
- ✅ Submissions exist in the database for the selected site
- ✅ User has SuperAdmin and SysAdmin roles

## Debug Changes Applied

### 1. Frontend Debug Logging (HomePage.tsx)
Enhanced the `fetchRecentSubmissions` function with comprehensive logging:
- Logs parameters being sent to RPC
- Logs raw response data structure
- Logs array length and first item
- Provides detailed warnings when no data is returned

**What to Look For:**
Open your browser console (F12) and refresh the page. You should see logs like:
```
🔍 [Recent Submissions Debug] Starting fetch with params: {...}
📦 [Recent Submissions Debug] Raw response: {...}
✅ [Recent Submissions Debug] Setting submissions: [...]
```
or
```
⚠️ [Recent Submissions Debug] No submissions returned, checking: {...}
```

### 2. UI Debug Info
Added a debug info panel in the "No recent submissions found" message showing:
- Selected Program ID
- Selected Site ID
- Submissions Array Length

This appears directly in the UI so you can quickly verify the component state.

### 3. SQL Diagnostic Script
Created `diagnose-recent-submissions.sql` with 9 diagnostic steps:

**How to Use:**
1. Open Supabase Dashboard: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql
2. Create a new query
3. Copy and paste the contents of `diagnose-recent-submissions.sql`
4. Run the query
5. Review each step's output

**What Each Step Checks:**
1. Verifies the `get_recent_submissions_v3` function exists
2. Shows your current user context (company_id, roles, etc.)
3. Lists active programs in your company
4. Shows sites in the first active program
5. Queries submissions directly from the table (bypass RPC)
6. Provides program/site IDs for manual RPC testing
7. Checks for orphaned data (broken relationships)
8. Checks for database warnings
9. Tests the RPC with NULL filters

## Next Steps to Diagnose

### Step 1: Check Browser Console Logs
1. Open the application in your browser
2. Open Developer Console (F12 or Cmd+Option+I)
3. Navigate to the Console tab
4. Clear the console
5. Select a program and site on the HomePage
6. Look for the debug logs with emoji icons (🔍, 📦, ✅, ⚠️, ❌)

**Key Questions:**
- What are the values of `program_id_param` and `site_id_param`?
- Is `data` an array? What is its length?
- Is there an error object?
- What does `firstItem` contain?

### Step 2: Run SQL Diagnostic Script
1. Go to Supabase SQL Editor
2. Run `diagnose-recent-submissions.sql`
3. Compare Step 5 (direct query) with your expectations
4. In Step 6, copy the program_id and site_id
5. Run the manual RPC test:
   ```sql
   SELECT * FROM get_recent_submissions_v3(
     10,
     'PASTE_PROGRAM_ID'::uuid,
     'PASTE_SITE_ID'::uuid
   );
   ```

**Key Questions:**
- Does Step 5 show submissions directly from the table?
- Does the manual RPC test in Step 6 return data?
- Are there any orphaned records in Step 7?
- Does Step 9 (NULL filters) return any data?

### Step 3: Check Supabase Logs
1. Go to Supabase Dashboard
2. Navigate to Logs Explorer
3. Filter for warnings or errors
4. Look for messages containing "get_recent_submissions_v3"

The function has an exception handler that raises warnings:
```sql
RAISE WARNING 'Error in get_recent_submissions_v3: %', SQLERRM;
```

### Step 4: Verify Data Relationships
Check for potential issues:

**Program Status:**
```sql
SELECT program_id, name, status
FROM pilot_programs
WHERE name = 'Sandhill Period 2';
```
Must be `status = 'active'` for the function to return data.

**Company Scoping:**
```sql
SELECT
  pp.company_id as program_company,
  u.company_id as user_company,
  u.is_super_admin
FROM pilot_programs pp
CROSS JOIN users u
WHERE pp.name = 'Sandhill Period 2'
  AND u.email = 'matt@grmtek.com';
```
Must match unless user is super admin.

**Submission Counts:**
```sql
SELECT
  s.site_id,
  s.name as site_name,
  COUNT(sub.submission_id) as submission_count
FROM sites s
LEFT JOIN submissions sub ON s.site_id = sub.site_id
WHERE s.name = 'Greenhouse #1'
GROUP BY s.site_id, s.name;
```

## Common Issues and Solutions

### Issue 1: Empty Array Returned (No Error)
**Symptoms:**
- 200 OK response
- `data` is `[]` (empty array)
- No error message

**Possible Causes:**
1. **Program not active** - Function filters by `pp.status = 'active'`
2. **Company mismatch** - User's company doesn't match program's company
3. **Wrong parameters** - program_id or site_id don't match actual data
4. **Silent exception** - Function caught an error and returned empty

**Solution:**
Run the SQL diagnostic script to identify which filter is excluding data.

### Issue 2: Function Returns Data but UI Doesn't Display
**Symptoms:**
- Console shows data in response
- `recentSubmissions` state is empty
- No error in catch block

**Possible Causes:**
1. **State update issue** - `setRecentSubmissions(data || [])` not working
2. **Re-render issue** - Component not re-rendering after state update
3. **Conditional rendering** - Card not showing due to condition check

**Solution:**
Check the debug info panel in UI - if it shows 0 length but console shows data, there's a state management issue.

### Issue 3: Data Type Mismatch
**Symptoms:**
- RPC returns data
- Table doesn't render
- No console errors

**Possible Causes:**
1. **Date format issue** - `format(new Date(submission.created_at))` fails
2. **NULL fields** - Missing required fields like `global_submission_id`
3. **Type mismatch** - Response doesn't match `RecentSubmission` interface

**Solution:**
Check `firstItem` in console logs - verify all fields match the TypeScript interface.

## Expected Working Flow

When everything works correctly, you should see:

1. **Console Logs:**
   ```
   🔍 [Recent Submissions Debug] Starting fetch with params: {
     limit_param: 10,
     program_id_param: "abc-123...",
     site_id_param: "def-456..."
   }
   📦 [Recent Submissions Debug] Raw response: {
     data: [{...}, {...}],
     error: null,
     dataLength: 5,
     dataType: "object",
     isArray: true,
     firstItem: {submission_id: "...", ...}
   }
   ✅ [Recent Submissions Debug] Setting submissions: [...]
   ```

2. **UI Display:**
   - Table with 5 rows showing submissions
   - Each row with ID, Date, Program, Site, Temperature, Humidity, Samples
   - "View" button on each row

3. **SQL Query Results:**
   - Step 5 and Step 6 return the same submissions
   - No orphaned records in Step 7
   - Step 9 returns all company submissions

## Files Modified

1. **src/pages/HomePage.tsx**
   - Added debug logging to `fetchRecentSubmissions`
   - Added debug info panel in UI

2. **diagnose-recent-submissions.sql** (NEW)
   - Complete SQL diagnostic script

3. **test-recent-submissions-debug.mjs** (NEW)
   - Node.js diagnostic script (requires auth)

4. **RECENT_SUBMISSIONS_DEBUG_GUIDE.md** (THIS FILE)
   - Complete debugging guide

## Cleanup After Fixing

Once the issue is resolved, remove debug code:

1. **Remove console.log statements** from HomePage.tsx (lines ~190-226)
2. **Remove debug info panel** from UI (lines ~594-601)
3. **Delete diagnostic files** if no longer needed

## Support

If you're still stuck after running diagnostics:

1. Share the console log output (🔍 and 📦 logs)
2. Share the SQL diagnostic results (especially Steps 5, 6, 9)
3. Check Supabase logs for any warnings
4. Verify your user has correct company_id assigned

---

**Status:** Debug tools deployed and ready for testing
**Next Action:** Refresh your application and check browser console for debug logs
