# Session Roll-up Alignment Fix

## Problem
The UI was displaying session wake counters (completed, failed, extra) that were potentially out of sync with the actual device wake payload data. The counters were stored in the `site_device_sessions` table and updated by triggers, but the UI should always reflect the real-time state of the underlying `device_wake_payloads` data.

## Solution
Updated both the database views and UI hooks to calculate wake counts dynamically from the `device_wake_payloads` table instead of using stored counters.

### Changes Made:

#### 1. Database View Update
**File:** `supabase/migrations/20251123150000_fix_session_views_dynamic_counts.sql`

Updated `vw_site_day_sessions` view to calculate counts dynamically:
- `completed_wake_count`: Count of payloads with status='complete' AND overage_flag=false
- `failed_wake_count`: Count of payloads with status='failed'
- `extra_wake_count`: Count of payloads with overage_flag=true
- `total_wakes`: Total count of all payloads for the session

This ensures the view always returns accurate real-time counts based on actual payload data.

#### 2. UI Hook Update
**File:** `src/hooks/useSiteDeviceSessions.ts`

Updated the `useSiteDeviceSessions` hook to:
- Query `device_wake_payloads` table for each session
- Calculate actual counts client-side:
  - completed_wake_count
  - failed_wake_count
  - extra_wake_count
  - total_wakes
- Return these dynamically calculated values instead of the stored counters

Added `total_wakes` field to the `SiteDeviceSession` interface.

### Benefits:

1. **Real-time Accuracy**: UI always shows current state of wake payloads
2. **No Trigger Dependencies**: Doesn't rely on triggers firing correctly
3. **Device-Specific Alignment**: Counts properly reflect devices assigned to each site and session
4. **Debugging Clarity**: Easy to verify counts match underlying data
5. **Consistent Experience**: Both the lab views and device session cards show the same accurate data

### Migration Status:

✅ Migration file created: `supabase/migrations/20251123150000_fix_session_views_dynamic_counts.sql`
✅ TypeScript hooks updated
✅ Project builds successfully

⚠️ **Action Required**: Apply the migration to the Supabase database to enable dynamic counting in views.

### Testing:

Run `node check-session-alignment.mjs` to verify that UI counts match payload data.

### Performance Note:

The view uses correlated subqueries which are efficient for reasonable numbers of payloads per session. PostgreSQL will use appropriate indexes on `site_device_session_id` foreign key. For very high-volume scenarios, consider adding a materialized view that refreshes periodically.
