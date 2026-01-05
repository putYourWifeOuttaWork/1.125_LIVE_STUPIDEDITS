# HomePage Blank Screen Fix - COMPLETE

## Problem Identified

The HomePage was showing blank with no console errors because it was using the **wrong company context system**.

## Root Cause

There were **two separate company context systems** in the application:

1. **`useActiveCompany` hook** (old system)
   - Used localStorage
   - File: `src/hooks/useActiveCompany.ts`
   - Used by: HomePage only

2. **`useCompanyFilterStore` store** (correct system)
   - Uses database-backed RPC functions
   - File: `src/stores/companyFilterStore.ts`
   - Used by: AppLayout header company selector

The HomePage was reading from `useActiveCompany` (localStorage), but the header's company selector was updating `useCompanyFilterStore` (database). **They were not connected!**

## What Was Changed

### Fixed File: `src/pages/HomePage.tsx`

**Before:**
```typescript
import { useActiveCompany } from '../hooks/useActiveCompany';

const HomePage = () => {
  const { activeCompanyId, isSuperAdmin } = useActiveCompany();
```

**After:**
```typescript
import { useCompanyFilterStore } from '../stores/companyFilterStore';
import useUserRole from '../hooks/useUserRole';

const HomePage = () => {
  const { selectedCompanyId: activeCompanyId } = useCompanyFilterStore();
  const { isSuperAdmin } = useUserRole();
```

## How It Works Now

1. **Super Admin logs in** → `useUserRole()` detects they are super admin
2. **Company selector appears in header** → Uses `useCompanyFilterStore`
3. **Super Admin selects a company** → Updates database via `setActiveCompanyContext()`
4. **HomePage reads company context** → Now correctly reads from `useCompanyFilterStore`
5. **Data filters properly** → ActiveSessionsGrid receives correct `companyFilter={activeCompanyId}`

## For Super Admins

As a super admin, you should now:

1. **See the company selector** in the header (blue dropdown with company name)
2. **Select a company** from the dropdown to view their data
3. **HomePage will display** all alerts, sessions, and data for the selected company
4. **Company context persists** across page refreshes (stored in database)

## Testing Checklist

- [x] Build completed successfully
- [ ] Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
- [ ] HomePage loads with content visible
- [ ] Company selector visible in header (super admin only)
- [ ] Selecting different companies filters data correctly
- [ ] Active alerts panel shows company-specific alerts
- [ ] Active sessions grid shows company-specific sessions

## Next Steps

1. Hard refresh your browser to load the new code
2. Select a company from the header dropdown if you're a super admin
3. HomePage should now display all real-time monitoring data

## Technical Notes

- The `useActiveCompany` hook can potentially be deprecated/removed
- All components should use `useCompanyFilterStore` for company context
- The system uses RPC functions: `get_active_company_context()` and `set_active_company_context()`
