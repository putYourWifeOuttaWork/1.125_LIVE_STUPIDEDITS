# Super Admin Command Center Implementation

## Overview

The HomePage has been transformed into a powerful Super Admin Command Center focused on real-time triage and cross-customer management. This implementation prioritizes actionable data, fast navigation to problem areas, and efficient management of multiple customers.

## What Was Implemented

### ✅ Phase 1: Core Infrastructure

#### 1. Database Migration for Alert Context
**File**: `add-session-context-to-alerts-migration.sql`

Added session context to device alerts table:
- `session_id` (uuid, nullable) - Links alert to specific device session
- `snapshot_id` (uuid, nullable) - Links alert to specific wake snapshot
- `wake_number` (integer, nullable) - Identifies the wake number where alert occurred
- Added foreign key constraints and indexes for efficient querying
- Enables direct navigation from alerts to the exact session moment

**Note**: This migration file needs to be applied to your Supabase database manually.

#### 2. useActiveCompany Hook
**File**: `src/hooks/useActiveCompany.ts`

Global company context management for super admins:
- Stores selected company in localStorage for persistence across sessions
- Provides `activeCompanyId`, `activeCompany`, and `companies` list
- `switchCompany()` function to change context
- Automatically filters out when user is not a super admin
- Reloads page after switching to refresh all queries

#### 3. Updated CompanySwitcher Component
**File**: `src/components/lab/CompanySwitcher.tsx`

Enhanced company switcher with three variants:
- **Header variant**: Compact button with dropdown (for main navigation)
- **Select variant**: Traditional dropdown (for forms)
- **Default dropdown**: Card-style button with dropdown (for standalone use)

Features:
- Shows "All Companies" option for viewing all data
- Visual checkmarks for active selection
- Loading states and error handling
- Only visible to super admins
- Reloads page after switching for data consistency

### ✅ Phase 2: Active Sessions Grid

#### 4. ActiveSessionsGrid Component
**File**: `src/components/devices/ActiveSessionsGrid.tsx`

Real-time grid showing active device sessions:
- Queries sessions with status `pending` or `in_progress` for TODAY only
- Shows: site name, company name (super admin), program name, progress (X/Y wakes), alert counts
- Color-coded cards:
  - **Red**: Critical alerts present
  - **Yellow**: Warnings or behind schedule
  - **Green**: On track, no alerts
- Real-time subscriptions to `site_device_sessions` and `device_alerts`
- Clickable cards navigate to session detail page
- Limit (default 10) with "View All" button
- Company filtering support for super admins
- Lazy loading with skeleton states

### ✅ Phase 3: Session-Aware Alert Navigation

#### 5. Updated ActiveAlertsPanel
**File**: `src/components/devices/ActiveAlertsPanel.tsx`

Enhanced alerts with session context:
- Added `session_id`, `snapshot_id`, `wake_number` to DeviceAlert interface
- Smart navigation logic:
  - If `session_id` exists → Navigate to `/programs/{p}/sites/{s}/device-sessions/{session_id}`
  - If `session_id` missing → Fallback to device detail page `/devices/{device_id}`
- "View Session Timeline" button for alerts with session context
- "View Device Details" as secondary action
- Maintains existing alert acknowledgment and filtering features

### ✅ Phase 4: Redesigned HomePage

#### 6. HomePage Transformation
**File**: `src/pages/HomePage.tsx` (old version backed up to `HomePage.tsx.backup`)

New tier structure:

**Tier 1: Company Context Banner (Super Admin Only)**
- Shows when super admin has selected a specific company
- Displays "Viewing Company Context" with company details
- Blue highlighted card for visibility

**Tier 2: Header**
- "Command Center" title (changed from "Welcome to InVivo!")
- "Real-time monitoring and triage" subtitle
- Quick actions: Manage Sessions, View Programs

**Tier 3: Active Alerts Panel (Full Width)**
- Most prominent position
- Real-time alert monitoring
- Session-aware navigation

**Tier 4: Active Sessions Grid (2/3) + Quick Selector (1/3)**
- Left: Active Sessions Grid showing today's active sessions
- Right: Compact Program/Site selector for quick context switching
- Quick "Create Submission" button when site selected

**Tier 5: Site Map (Collapsible Accordion)**
- Starts collapsed by default
- Expands when site selected
- Shows device positions and environmental zones
- Click to expand/collapse with chevron icon
- Only renders when site is selected

### Removed Elements
- Weather card (removed entirely)
- Historical Device Sessions list (replaced with Active Sessions Grid)
- Unclaimed Sessions Card (kept in sessions drawer only)

## Key Features Implemented

### 1. Real-Time Updates
- ActiveSessionsGrid subscribes to session and alert changes
- ActiveAlertsPanel subscribes to alert changes
- Automatic refresh when data changes

### 2. Smart Navigation
- Alerts navigate to session timeline when session context available
- Fallback to device page when session not available
- Session cards directly link to session detail page

### 3. Company Context Filtering
- Super admins can switch between companies
- All data automatically filters by selected company
- Persists across page reloads via localStorage

### 4. Progressive Disclosure
- Site map starts collapsed to reduce cognitive load
- Expands when user shows interest (selects site)
- Only shows what's relevant to current context

### 5. Color-Coded Status
- Red: Critical alerts or issues
- Yellow: Warnings or behind schedule
- Green: On track, no alerts
- Intuitive visual feedback for quick triage

## Files Created/Modified

### Created:
1. `/add-session-context-to-alerts-migration.sql` - Database migration
2. `/src/hooks/useActiveCompany.ts` - Company context hook
3. `/src/components/devices/ActiveSessionsGrid.tsx` - Active sessions component

### Modified:
1. `/src/components/lab/CompanySwitcher.tsx` - Enhanced with variants
2. `/src/components/devices/ActiveAlertsPanel.tsx` - Session-aware navigation
3. `/src/pages/HomePage.tsx` - Complete redesign (old backed up)

### Backed Up:
1. `/src/pages/HomePage.tsx.backup` - Original HomePage for reference

## Next Steps (Not Yet Implemented)

### Required:
1. **Apply Database Migration**: The SQL file `add-session-context-to-alerts-migration.sql` needs to be applied to your Supabase database
2. **Update Alert Triggers**: Modify alert detection functions to populate `session_id`, `snapshot_id`, `wake_number` when creating alerts
3. **Backfill Existing Alerts**: (Optional) Update existing alerts with session context where device_id and timestamps can be matched

### Optional Enhancements:
1. **Company Switcher in AppLayout**: Integrate CompanySwitcher into AppLayout header (currently using existing company dropdown)
2. **Database Function**: Create `get_active_sessions_today()` RPC function for optimized querying
3. **Cross-Company Dashboard**: Create comparison view for super admins to see metrics across all companies
4. **Keyboard Shortcuts**: Add Ctrl+K for company switcher, Ctrl+S for sessions
5. **Pull-to-Refresh**: Add gesture support for mobile admin access

## Testing Recommendations

### Test Scenarios:

1. **Super Admin Company Switching**
   - Switch between companies
   - Verify all data updates correctly
   - Check localStorage persistence

2. **Active Sessions Grid**
   - Verify only TODAY's active sessions show
   - Check color coding matches alert severity
   - Test real-time updates when sessions change
   - Verify navigation to session detail pages

3. **Alert Navigation**
   - Create alerts with session context
   - Verify navigation goes to session timeline
   - Test fallback to device page for alerts without session
   - Check acknowledgment still works

4. **Site Map Accordion**
   - Verify starts collapsed
   - Test expand/collapse functionality
   - Check device visualization works
   - Verify only shows for selected sites

5. **Company Context**
   - Test with super admin user
   - Test with regular user (should not see switcher)
   - Verify company admin sees their company only

## Build Status

✅ **Build Successful**
- All TypeScript code compiles without errors
- No breaking changes to existing functionality
- Backward compatible with current data structure

## Notes

- Old HomePage is preserved as `HomePage.tsx.backup`
- Migration SQL is ready but not yet applied
- Real-time subscriptions are active for sessions and alerts
- Company context persists in localStorage as `activeCompanyId`
- All changes maintain existing RLS policies and security

## Summary

The HomePage has been successfully transformed into a Super Admin Command Center with:
- Real-time monitoring of active sessions
- Session-aware alert navigation
- Company context switching for super admins
- Collapsible site maps
- Progressive disclosure of information
- Color-coded status indicators for quick triage

The implementation focuses on what matters NOW (today's active sessions, current alerts) rather than historical data, enabling faster response times and better cross-customer management.
