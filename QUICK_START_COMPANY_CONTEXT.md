# Quick Start: Company Context System

**TL;DR:** Apply 3 migrations, deploy frontend, and you're done!

---

## The Problem We Solved

You were logged in as a GasX user but seeing Sandhill programs. This happened because the old system allowed cross-company access through the `pilot_program_users` table.

**Now:** Users only see data from ONE company at a time. Super admins can switch companies, but still see only one company's data at a time.

---

## Quick Apply (5 Minutes)

### Step 1: Apply Migrations

```bash
cd /path/to/project
npx supabase db push
```

This applies 3 migrations:
1. Creates active company context system
2. Updates RLS policies for strict company isolation
3. Adds data integrity constraints

### Step 2: Deploy Frontend

```bash
npm run build
# Deploy to your hosting (Netlify/Vercel/etc.)
```

### Step 3: Test It

```bash
# Run automated test
node test-company-isolation.mjs
```

**Expected output:**
```
✓ Active Company Context: PASSED
✓ Program Visibility: PASSED
✓ Site Visibility: PASSED
✓ Submission Visibility: PASSED
✓ Company Switching: PASSED

All 5 tests passed! ✓
```

---

## What Changed

### For You (GasX User)

**Before:**
- Saw Sandhill programs even though you're at GasX
- Confusing cross-company data

**After:**
- See ONLY GasX programs
- Clean, isolated view
- No cross-company data ever

### For Super Admins

**New Feature:** Company dropdown in header

1. Click the company dropdown (top of page)
2. Select "Sandhill Growers"
3. App reloads
4. Now see only Sandhill data
5. Switch back to "GasX"
6. Now see only GasX data

**One company at a time - always!**

---

## How It Works

```
User Query
  ↓
RLS Policy checks: get_active_company_id()
  ↓
  ├─ Regular user? → Returns assigned company
  ├─ Company admin? → Returns assigned company
  └─ Super admin? → Returns selected company from dropdown
  ↓
Database filters: WHERE company_id = active_company_id
  ↓
User sees only that company's data
```

---

## Verification Checklist

After applying migrations:

- [ ] Log in as GasX user
- [ ] Verify you see ONLY GasX programs (no Sandhill)
- [ ] Sites are filtered correctly
- [ ] No cross-company data visible

If super admin:
- [ ] Company dropdown appears in header
- [ ] Can switch between companies
- [ ] Data changes when switching
- [ ] Always see one company at a time

---

## Troubleshooting

### "I don't see any programs"

```sql
-- Check your active company context
SELECT * FROM get_active_company_context();

-- Check if company has programs
SELECT COUNT(*) FROM pilot_programs WHERE company_id = '<your-company-id>';
```

### "I still see wrong company's data"

1. Clear browser cache
2. Reload the page (Ctrl+Shift+R)
3. Run test script to diagnose
4. Check that migrations applied successfully

### "Company dropdown not showing"

- This is normal for regular users and company admins
- Only super admins see the company dropdown
- Check: `SELECT is_super_admin FROM users WHERE id = auth.uid();`

---

## Files to Review

- `IMPLEMENTATION_SUMMARY.md` - What was built
- `COMPANY_CONTEXT_MIGRATION_GUIDE.md` - Detailed instructions
- `test-company-isolation.mjs` - Test script

---

## That's It!

Three migrations, one deployment, and you have strict company isolation with zero cross-company data leakage.

**Questions?** Check the detailed guide or run the test script.

---

**Status:** ✅ Ready to Apply
**Build Status:** ✅ Passes
**Test Status:** ✅ Script Ready
