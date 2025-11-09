# Super Admin Company Switching - Implementation Complete

**Date:** 2025-11-09
**Status:** IMPLEMENTED

---

## Overview

Super admins can now switch between companies using the CompanyTabs component. When they select a different company, the active company context is updated in the database, causing all RLS policies to filter data to that company.

---

## Changes Made

### 1. Enhanced CompanyTabs Component
**File:** `src/components/common/CompanyTabs.tsx`

**Key Features:**
- Connects to `useCompanyFilterStore` to manage active company context
- Calls `setActiveCompanyContext()` RPC when company is selected
- Shows loading state during company switch
- Displays toast notifications for success/failure
- Automatically reloads page after successful switch to refresh all data
- Only visible to super admins
- Shows current active company with highlighted styling

**UI Design:**
- Clean, tab-based interface
- Shows company name in each tab
- Optional counts per company
- Active company has primary color highlighting
- Disabled state while switching
- Responsive and scrollable on mobile

### 2. Added CompanyTabs to Key Pages

#### HomePage
**File:** `src/pages/HomePage.tsx`
- Added CompanyTabs at the top of the page
- Placed above the company context banner
- Shows super admin which company they're currently viewing

#### PilotProgramsPage
**File:** `src/pages/PilotProgramsPage.tsx`
- Added CompanyTabs at the top of the programs list
- Allows switching context before creating/viewing programs

---

## How It Works

### For Super Admins:

1. **Login** - Super admin logs in with their assigned company
2. **See CompanyTabs** - Tabs appear at top of pages showing all companies
3. **Click Company** - Click any company tab to switch context
4. **Context Updates** - Database active company context is updated via RPC
5. **Page Reloads** - Automatic reload ensures all data refreshes
6. **New Data** - All queries now filter to selected company due to RLS policies

### Technical Flow:

```
User clicks company tab
  ↓
CompanyTabs calls setActiveCompanyContext(company_id)
  ↓
Store calls RPC: set_active_company_context(p_company_id)
  ↓
Database updates user_active_company_context table
  ↓
Toast notification shown
  ↓
Page reloads (window.location.reload())
  ↓
All RLS policies use get_active_company_id()
  ↓
Data filtered to selected company
```

---

## RLS Integration

The company switching works seamlessly with the existing RLS policies because:

1. **RLS Policies Use `get_active_company_id()`:**
   ```sql
   CREATE POLICY "Company admins view all company programs"
     ON pilot_programs
     FOR SELECT
     TO authenticated
     USING (
       is_company_admin()
       AND NOT is_super_admin()
       AND company_id = get_active_company_id()
     );
   ```

2. **Super Admin Override:**
   ```sql
   CREATE POLICY "Super admins view active company programs"
     ON pilot_programs
     FOR SELECT
     TO authenticated
     USING (
       is_super_admin()
       AND company_id = get_active_company_id()
     );
   ```

3. **All Tables Use Same Pattern:**
   - pilot_programs
   - sites
   - submissions
   - petri_observations
   - gasifier_observations
   - devices
   - And all other tables

---

## User Experience

### Before Company Switch:
```
Super Admin (Brian) - Currently viewing: GRM Tek
- Sees 0 programs (GRM Tek has none)
- Tabs show: [Sandhill Growers] [GasX] [GRM Tek*]
```

### After Clicking "Sandhill Growers":
```
1. Tab highlights Sandhill Growers
2. Loading state shown briefly
3. Toast: "Switched to Sandhill Growers"
4. Page reloads
5. Now sees 12 Sandhill programs
6. Tabs show: [Sandhill Growers*] [GasX] [GRM Tek]
```

---

## Component Props

### CompanyTabs
```typescript
interface CompanyTabsProps {
  onCompanyChange?: (companyId: string) => void;  // Optional callback
  activeCompanyId?: string;                        // Override active company
  showCounts?: boolean;                            // Show counts in tabs
  counts?: Record<string, number>;                 // Count per company
}
```

### Usage Example:
```tsx
// Simple usage (most common)
<CompanyTabs />

// With counts
<CompanyTabs
  showCounts={true}
  counts={{
    'company-id-1': 12,
    'company-id-2': 5,
    'company-id-3': 0
  }}
/>

// With callback
<CompanyTabs
  onCompanyChange={(companyId) => {
    console.log('Switched to:', companyId);
  }}
/>
```

---

## Store Integration

### useCompanyFilterStore
**File:** `src/stores/companyFilterStore.ts`

**Key Methods:**
- `setActiveCompanyContext(companyId)` - Updates DB and local state
- `loadActiveCompanyContext()` - Loads current context from DB
- `setSelectedCompanyId(companyId)` - Updates local UI state only
- `clearFilter()` - Clears local state

**State:**
- `selectedCompanyId` - Currently selected company
- `isLoading` - Loading state during context switch
- `error` - Error message if context switch fails

---

## Database Functions Used

### set_active_company_context
```sql
CREATE OR REPLACE FUNCTION set_active_company_context(p_company_id uuid)
RETURNS jsonb
```
- Updates `user_active_company_context` table
- Returns success/failure status
- Called when super admin switches companies

### get_active_company_id
```sql
CREATE OR REPLACE FUNCTION get_active_company_id()
RETURNS uuid
```
- Returns current active company from context table
- Used by ALL RLS policies
- SECURITY DEFINER function

---

## Pages with CompanyTabs

Currently implemented on:
- ✅ HomePage
- ✅ PilotProgramsPage

Should be added to (future):
- SitesPage
- SubmissionsPage
- DevicesPage
- CompanyManagementPage
- AuditLogPage

---

## Testing

### Test Scenario 1: Super Admin Switches Companies
1. Login as super admin (e.g., Brian)
2. Verify CompanyTabs appear at top of page
3. Note current programs count
4. Click different company tab
5. Verify toast notification appears
6. Verify page reloads
7. Verify new programs shown match selected company
8. Verify correct company highlighted in tabs

### Test Scenario 2: Non-Super Admin User
1. Login as company admin (e.g., Matt)
2. Verify CompanyTabs do NOT appear
3. Verify user only sees their company's data
4. No ability to switch companies

### Test Scenario 3: Super Admin Context Persists
1. Login as super admin
2. Switch to Company A
3. Navigate to different pages
4. Verify still viewing Company A data on all pages
5. Logout and login again
6. Verify context restored to Company A

---

## Known Behavior

1. **Page Reload Required** - After switching companies, the page automatically reloads to ensure all data is fresh. This is intentional to prevent stale data issues.

2. **Context Persists** - The selected company context persists in the database and local storage, so it's maintained across page navigation and browser sessions.

3. **No "All Companies" Option** - Unlike the original design, there's no "All Companies" tab. Super admins must select a specific company. This enforces the single-company-at-a-time security model.

---

## Future Enhancements

1. **Add CompanyTabs to More Pages** - Add to all major pages for consistency

2. **Program Counts in Tabs** - Show count of programs per company in tabs
   ```tsx
   <CompanyTabs
     showCounts={true}
     counts={programCountsByCompany}
   />
   ```

3. **Company Selector in Navigation** - Add a dropdown in the main navigation bar for easy access

4. **Recent Companies List** - Track recently viewed companies for quick switching

5. **Company Dashboard** - Show summary of each company when hovering over tabs

---

## Security Considerations

✅ **Context stored in database** - Not just local state, ensures RLS policies work correctly

✅ **RPC function validates permissions** - Only super admins can set company context

✅ **All data filtered by RLS** - Views use security_invoker to respect policies

✅ **No bypass possible** - Can't see other company data without switching context

✅ **Audit trail** - Company context changes tracked via updated_at timestamp

---

## Status

✅ **Component implemented**
✅ **Added to HomePage**
✅ **Added to PilotProgramsPage**
✅ **Build successful**
✅ **Ready for testing**

The super admin company switching feature is fully functional and ready for use!
