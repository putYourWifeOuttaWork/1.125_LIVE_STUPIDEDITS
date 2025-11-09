# 🚨 QUICK FIX: Missing get_recent_submissions_v3 Function

## The Error You're Seeing

```
POST https://jycxolmevsvrxmeinxff.supabase.co/rest/v1/rpc/get_recent_submissions_v3 404 (Not Found)
Error: relation "pilot_program_users" does not exist
```

## What Happened

The `pilot_program_users` table was removed in a recent RLS rebuild (migration `20251109130003_remove_pilot_program_users.sql`), but the `get_recent_submissions_v3` function that your HomePage depends on was never created to work with the new company-based architecture.

## The Fix (3 Options)

### ⚡ Option 1: Interactive Web Guide (Easiest)

1. Open `apply-migration-web.html` in your browser
2. Follow the step-by-step guide with copy-paste buttons
3. Each step includes a "Copy SQL" button for easy application

### 📝 Option 2: Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Open the migration file: `supabase/migrations/20251109140000_create_get_recent_submissions_v3.sql`
3. Copy the entire contents
4. Paste into the SQL Editor
5. Click "Run" (or Cmd/Ctrl + Enter)
6. Wait for "Success" confirmation

### 📖 Option 3: Read the Detailed Guide

Open `APPLY_RECENT_SUBMISSIONS_FIX.md` for comprehensive instructions including:
- Problem explanation
- Solution details
- Multiple application methods
- Verification steps
- Testing procedures
- Rollback instructions if needed

## What Gets Created

1. **superadmin_impersonations** table
   - Tracks when super admins impersonate companies
   - Required for future company switching feature
   - Fully secured with RLS policies

2. **get_impersonated_company_id()** function
   - Helper function to extract impersonation context from JWT
   - Returns NULL if not impersonating

3. **get_recent_submissions_v3()** function
   - Main RPC function your HomePage needs
   - Respects company scoping and role-based access
   - Supports super admin impersonation
   - Works with the new architecture (no pilot_program_users)

## Access Control

The new function implements your complete access control contract:

- **Super Admins**: See all companies (or scoped if impersonating)
- **Company Admins**: See all their company's data
- **All Users**: Strictly company-scoped
- **Inactive Users**: Blocked immediately

## After Applying

1. Refresh your browser
2. The error should disappear
3. HomePage should load normally
4. Recent submissions will display correctly

## Need Help?

If you encounter any issues:

1. Check the Supabase Dashboard logs
2. Run the verification query (in the detailed guide)
3. Make sure you're logged in as an active user with a company assigned

## Files Created

- ✅ `supabase/migrations/20251109140000_create_get_recent_submissions_v3.sql` - The migration
- ✅ `APPLY_RECENT_SUBMISSIONS_FIX.md` - Detailed documentation
- ✅ `apply-migration-web.html` - Interactive web guide
- ✅ `QUICK_FIX_README.md` - This file

---

**Ready to fix?** Choose your preferred option above and follow the steps!
