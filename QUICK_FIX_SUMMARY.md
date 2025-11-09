# QUICK FIX: Matt Cannot See Programs

## The Problem
Matt cannot see any programs even though he's a super admin and 12 programs exist in the database.

## The Solution (2 Steps)

### Step 1: Apply the RLS Fix

1. **Open Supabase SQL Editor**
   - Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql

2. **Copy and Run the SQL**
   - Open the file: `APPLY_RLS_FIX_NOW.sql`
   - Copy the ENTIRE contents
   - Paste into the SQL Editor
   - Click **"Run"**

3. **Verify Success**
   - You should see: `RLS policies updated successfully!`

### Step 2: Have Matt Log Out and Back In

1. **Matt must completely log out**
2. **Clear browser cache** (important!):
   - Press F12 to open Developer Tools
   - Go to "Application" tab
   - Under Storage, click "Clear site data"
3. **Close browser completely**
4. **Reopen browser and log back in**
5. **Navigate to Programs page**

## Expected Result

Matt should now see all 12 programs.

## Still Not Working?

Check browser console (F12) for debug output starting with:
`=== PROGRAM FETCH DEBUG ===`

See `IMMEDIATE_STEPS_FOR_MATT.md` for detailed troubleshooting.
