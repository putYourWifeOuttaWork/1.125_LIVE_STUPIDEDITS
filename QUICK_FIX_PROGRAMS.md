# Quick Fix: Programs Showing Wrong Company

## TL;DR - The Issue

✅ **Your multi-tenancy system is working perfectly!**

❌ **The problem:** All 12 programs in your database are assigned to "Sandhill Growers"

✅ **The solution:** Reassign programs to the correct companies

---

## Current State

```
📊 Company → Program Count
   GasX              → 0 programs
   GRM Tek           → 0 programs
   Sandhill Growers  → 12 programs
```

This is why GasX users see "no programs" and Sandhill users see all 12 programs. **The filtering is working correctly!**

---

## Quick Fix (5 Minutes)

### Step 1: Check Current State
```bash
node diagnose-company-context-admin.mjs
```

### Step 2: Reassign Programs (Interactive)
```bash
node list-and-reassign-programs.mjs
```

Follow the prompts to assign each program to the correct company.

---

## What Changed in Your App

### New Feature: Company Context Banner

When users visit the Pilot Programs page, they now see:

```
┌─────────────────────────────────────────────────────────┐
│ 🏢 Viewing programs for: GasX                          │
│    Only programs assigned to GasX are visible.         │
│    This company has no programs yet.                   │
└─────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Users know exactly which company's data they're viewing
- ✅ Super admins are reminded they can switch companies
- ✅ No confusion about "missing" programs
- ✅ Clear explanation of the filtering behavior

### Already Exists: Super Admin Company Switcher

Super admins see a company dropdown in the header:
```
🛡️ Super Admin  |  🏢 GasX ▼
```

Click it to switch between companies and view different programs.

---

## How the System Works

```
┌─────────────┐
│   User      │
│  Logs In    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ Active Company Context Set      │
│ - Regular users: Their company  │
│ - Super admins: Can switch      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ RLS Policies Filter Data        │
│ WHERE company_id =              │
│   get_active_company_id()       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ User Sees Only Their            │
│ Company's Programs              │
└─────────────────────────────────┘
```

---

## Decision Tree: Why Am I Seeing These Programs?

```
Q: I see programs from Sandhill Growers
└─> Are you logged in as a Sandhill user?
    ├─> Yes → ✅ Correct! You should see Sandhill programs
    └─> No → Are you a Super Admin?
        ├─> Yes → Check company dropdown - you're viewing Sandhill context
        └─> No → This is the bug this fix addresses
```

---

## Verification Checklist

After reassigning programs:

### Test as GasX User
- [ ] Log in as GasX user
- [ ] Go to Pilot Programs page
- [ ] See banner: "Viewing programs for: GasX"
- [ ] See only GasX programs (or "No programs" if GasX has none)
- [ ] Do NOT see Sandhill programs

### Test as Sandhill User
- [ ] Log in as Sandhill user
- [ ] Go to Pilot Programs page
- [ ] See banner: "Viewing programs for: Sandhill Growers"
- [ ] See only Sandhill programs
- [ ] Do NOT see GasX programs

### Test as Super Admin
- [ ] Log in as super admin
- [ ] See company dropdown in header
- [ ] Switch to GasX → see only GasX programs
- [ ] Switch to Sandhill → see only Sandhill programs
- [ ] Switch to GRM Tek → see only GRM Tek programs

---

## Common Questions

**Q: Why do I see "No programs for GasX"?**
A: Because GasX has 0 programs assigned to it. Create new programs or reassign existing ones.

**Q: Can I see programs from multiple companies at once?**
A: No. This is by design for data security. One company at a time.

**Q: How do I move a program between companies?**
A: Use the reassignment tool: `node list-and-reassign-programs.mjs`

**Q: Will this affect my existing data?**
A: No. The filtering was already working. This just makes it more visible.

**Q: I'm a super admin. How do I switch companies?**
A: Click the company dropdown in the header (next to the Super Admin badge).

---

## Technical Details

### Database Tables
- `companies` - All companies in the system
- `pilot_programs` - Programs with `company_id` column
- `user_active_company_context` - Tracks which company each user is viewing

### Key Functions
- `get_active_company_id()` - Returns current user's active company
- `set_active_company_context(company_id)` - Super admins can change context
- `user_has_program_access(program_id)` - Checks program access for regular users

### RLS Policies
Every SELECT query automatically includes:
```sql
WHERE company_id = get_active_company_id()
```

This ensures users only see data from their active company.

---

## Files You Can Use

1. **`diagnose-company-context-admin.mjs`**
   - Check current state
   - Find issues
   - Get recommendations

2. **`list-and-reassign-programs.mjs`**
   - Interactively reassign programs
   - Updates sites and submissions automatically
   - Shows before/after summary

3. **`COMPANY_FILTERING_SOLUTION.md`**
   - Complete documentation
   - Root cause analysis
   - Step-by-step solutions

---

## Summary

✅ **System Status:** Working correctly
✅ **Build Status:** Passing
✅ **UI Enhanced:** Company context now visible
✅ **Tools Ready:** Scripts available for data fix

**Next Action:** Run `node list-and-reassign-programs.mjs` to fix program assignments

---

**Questions?** Read `COMPANY_FILTERING_SOLUTION.md` for full details.
