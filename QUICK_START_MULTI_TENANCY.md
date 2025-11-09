# Quick Start: Multi-Tenancy System

**✅ MIGRATION FIXED:** Updated to handle existing functions by dropping them first.

## ⚡ Apply Migration (Required First Step)

### Option 1: Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Open file: `supabase/migrations/20251109160000_user_management_and_device_pool.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click "Run"
6. Wait for "Success. No rows returned"

### Option 2: Command Line
```bash
# If you have Supabase CLI installed
supabase db push
```

---

## 🎯 What You Get

### For Super Admins
- **Device Pool Page** (`/device-pool`)
  - View all unassigned devices
  - Assign devices to companies
  - See statistics by type and status

- **User Management**
  - Search users across all companies
  - Assign users to any company
  - Manage cross-company operations

- **Company Tabs** (Ready to integrate)
  - Segment data by company
  - View "All Companies" aggregate
  - Quick company switching

### For Company Admins
- **User Management** (Own Company Only)
  - Search and add existing users
  - Promote/demote admins
  - Manage company members

- **Device Management** (Assigned Devices Only)
  - View company devices
  - Manage device settings
  - Cannot see unassigned pool

### For Regular Users
- **Restricted Access**
  - See only company devices
  - Based on user_role permissions
  - No device pool access

---

## 🧪 Quick Test

### 1. Test Super Admin Device Pool
```bash
# As super admin user:
1. Navigate to /device-pool
2. Should see device pool page
3. Should see any unassigned devices
4. Select company from dropdown
5. Click "Assign" button
6. Device should disappear from pool
```

### 2. Test User Assignment
```bash
# As company admin:
1. Go to /company page
2. Click "Manage Users" button
3. Enter email in search
4. Click "Add User"
5. User should appear in company list
```

### 3. Test Permission Guards
```bash
# As regular user (not admin):
1. Try to navigate to /device-pool
2. Should see "Access Denied" message
3. Should be redirected to home
```

---

## 📋 New RPC Functions

### User Management
- `search_users_by_email(search_query)` - Find existing users
- `add_user_to_company(email, company_id)` - Assign user
- `remove_user_from_company(user_id)` - Unassign user

### Device Pool
- `get_unassigned_devices()` - List unassigned devices
- `assign_device_to_company(device_id, company_id)` - Assign device
- `get_device_pool_stats()` - Get pool statistics

---

## 🔧 Troubleshooting

### "Could not find function"
- **Cause:** Migration not applied
- **Fix:** Apply migration using steps above

### "Access denied" to device pool
- **Cause:** User is not super admin
- **Fix:** Update user: `UPDATE users SET is_super_admin = true WHERE email = 'you@example.com'`

### Device not visible after assignment
- **Cause:** RLS policies may be cached
- **Fix:** Refresh page or check: `SELECT company_id FROM devices WHERE device_id = 'xxx'`

---

## 🚀 Next Steps

### Immediate
1. ✅ Apply migration (see top of this guide)
2. ✅ Test device pool as super admin
3. ✅ Test user assignment as company admin
4. ✅ Verify permission guards working

### Optional Enhancements
5. Integrate CompanyTabs into main pages
6. Connect company filter to data hooks
7. Add bulk device assignment
8. Add user invitation via email

---

## 📁 Key Files

```
Database:
  supabase/migrations/20251109160000_user_management_and_device_pool.sql

Pages:
  src/pages/DevicePoolPage.tsx

Components:
  src/components/common/CompanyTabs.tsx
  src/components/routing/RequireSuperAdmin.tsx
  src/components/routing/RequireCompanyAdmin.tsx

Routes:
  src/App.tsx (added /device-pool route)

Hooks:
  src/hooks/useCompanies.ts (already uses RPC functions)
```

---

## 💡 Quick Tips

- **Device Pool** only visible to super admins
- **User search** finds users across all companies
- **Company admins** can only manage their own company
- **RLS enforces** all permissions at database level
- **Audit log** captures all device and user operations
- **Build status** verified with no TypeScript errors

---

## ✅ Success Checklist

- [ ] Migration applied successfully
- [ ] Super admin can access /device-pool
- [ ] Devices can be assigned to companies
- [ ] Assigned devices visible to company users
- [ ] User search returns results
- [ ] User assignment works
- [ ] Permission guards block unauthorized access
- [ ] All operations logged in audit trail

---

## 📞 Need Help?

See detailed documentation:
- `MULTI_TENANCY_COMPLETE.md` - Full implementation details
- `APPLY_USER_MANAGEMENT_MIGRATION.md` - Migration instructions
- `MULTI_TENANCY_IMPLEMENTATION.md` - Original Phase 1 docs

Check database:
```sql
-- Verify migration applied
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('search_users_by_email', 'assign_device_to_company');

-- Check unassigned devices
SELECT COUNT(*) FROM devices WHERE company_id IS NULL;

-- Check your permissions
SELECT email, is_super_admin, is_company_admin, company_id
FROM users WHERE email = 'you@example.com';
```
