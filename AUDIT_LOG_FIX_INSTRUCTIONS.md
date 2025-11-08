# Audit Log Fix - Application Instructions

## Problem Summary

The program and site audit log pages were failing with the error:
```
Failed to load audit logs
```

**Root Cause**: When device history integration was added, new RPC functions `get_program_history_with_devices` and `get_site_history_with_devices` were created to unify device events with traditional audit trail data. However, these functions had return type mismatches causing a PostgreSQL error:
```
structure of query does not match function result type
Returned type character varying(100) does not match expected type text in column 9
```

## What Was Fixed

### 1. Database Functions (3 functions)

**File**: `supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql`

- **get_site_history_with_devices**: Fixed return type structure to properly include all needed fields (object_type, update_type, old_data, new_data, etc.)
- **get_program_history_with_devices**: Fixed return type structure and added better event_source mapping for different object types
- **export_filtered_audit_history_csv**: Created missing CSV export function that works with unified audit data

### 2. Frontend Error Handling

**File**: `src/hooks/useAuditLog.ts`

- Improved error messages to show actual database error details instead of generic "Failed to load audit logs"
- Added proper error type handling with detailed error messages
- Better debugging information for troubleshooting

## How to Apply the Fix

### Step 1: Apply the Database Migration

You need to apply the migration file to your Supabase database. Choose one of these methods:

#### Option A: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Open the file: `supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute the migration

#### Option B: MCP Supabase Tool (If Available)

If you have the Supabase MCP tool configured:

```bash
# Use the mcp__supabase__apply_migration tool
# Point it to: supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql
```

### Step 2: Verify the Fix

After applying the migration, run this test:

```bash
node apply-audit-migration.mjs
```

Expected output:
```
✅ Function working correctly! Rows returned: X
Sample event:
  Event ID: xxx-xxx-xxx
  Event Type: ProgramUpdate
  Source: program
  Timestamp: 2025-XX-XX...
```

### Step 3: Test in the Application

1. Navigate to a program's audit log page: `/programs/{programId}/audit`
2. Verify that audit events load without errors
3. Test filtering by event type, date range, etc.
4. Test CSV export functionality
5. Navigate to a site's audit log page: `/programs/{programId}/sites/{siteId}/audit`
6. Verify site-specific audit events load correctly

## What the Fix Does

### Unified Audit Trail

The fixed functions now properly combine:

1. **Device Events**: Wake sessions, image captures, telemetry readings, errors, etc.
2. **Traditional Events**: Program changes, site changes, submissions, user management, etc.

All events are returned in a consistent structure with:
- `event_id`: Unique identifier
- `event_source`: 'device', 'program', 'site', 'submission', 'petri', 'gasifier', or 'user'
- `event_type`: Specific action type (e.g., 'ProgramUpdate', 'ImageCapture')
- `event_category`: Category for grouping
- `severity`: 'info', 'warning', 'error', or 'critical'
- `event_timestamp`: When the event occurred
- `description`: Human-readable description
- `object_type`: Type of object affected
- `old_data` / `new_data`: Change tracking (for non-device events)
- `event_data`: Additional data payload
- User and device information

### CSV Export

The new `export_filtered_audit_history_csv` function allows exporting audit logs with filters applied:
- Filtered by program or site
- Filtered by object type, event type, or user
- Includes up to 10,000 most recent events
- Proper CSV formatting with quoted fields

## Troubleshooting

### If the migration fails:

1. Check that you have `SECURITY DEFINER` privileges
2. Verify the `pilot_program_history_staging` table exists
3. Ensure the `device_history` table and related device tables exist
4. Check that the `device_event_category` and `event_severity` enum types are defined

### If audit logs still don't load:

1. Check browser console for detailed error messages (now improved)
2. Verify RPC function permissions with: `GRANT EXECUTE ON FUNCTION get_program_history_with_devices TO authenticated;`
3. Check that `pilot_program_history_staging` has data by querying it directly
4. Verify device history table has events if you expect to see device data

### Common Issues:

**Error: "relation pilot_program_history_staging does not exist"**
- The audit trail table is missing. Check that base migrations are applied.

**Error: "type device_event_category does not exist"**
- Device IoT migrations need to be applied first.

**No events showing**:
- Check if `pilot_program_history_staging` has records for your program
- Verify you have permission to view the program's audit log
- Check date range filters aren't excluding all events

## Architecture Notes

### Data Flow

```
┌─────────────────────┐
│   AuditLogPage.tsx  │
│  (Frontend Component)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   useAuditLog.ts    │
│  (React Hook)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  get_program_history_with_devices()     │
│  get_site_history_with_devices()        │
│  (Database RPC Functions)               │
└────────┬────────────────────┬───────────┘
         │                    │
         ▼                    ▼
┌──────────────────┐  ┌─────────────────────────┐
│  device_history  │  │ pilot_program_history_  │
│  (Device Events) │  │  staging (Audit Trail)  │
└──────────────────┘  └─────────────────────────┘
```

### Why Two Tables?

- **device_history**: High-frequency IoT events (telemetry, wake sessions, images)
- **pilot_program_history_staging**: Traditional audit trail (user actions, data changes)

The RPC functions UNION these together into a single chronological view.

## Testing Checklist

After applying the fix, verify:

- [ ] Program audit log loads without errors
- [ ] Site audit log loads without errors
- [ ] Device events appear if devices are assigned
- [ ] Traditional events appear (program updates, site changes, etc.)
- [ ] Events are sorted by timestamp (newest first)
- [ ] Filtering by event type works
- [ ] Filtering by date range works
- [ ] Filtering by device category works (for device events)
- [ ] CSV export generates a valid file
- [ ] CSV export respects current filters
- [ ] Event details expand/collapse correctly
- [ ] Device telemetry data displays in expanded view
- [ ] User email displays correctly for all events

## Files Changed

1. `supabase/migrations/20251108230000_fix_audit_history_rpc_functions.sql` - NEW
2. `src/hooks/useAuditLog.ts` - MODIFIED (better error handling)
3. `apply-audit-migration.mjs` - NEW (test script)
4. `AUDIT_LOG_FIX_INSTRUCTIONS.md` - NEW (this file)

## Need Help?

If you encounter issues applying this fix:

1. Check the detailed error message now shown in the UI
2. Review the Supabase logs for SQL errors
3. Verify all prerequisite migrations are applied
4. Ensure proper permissions are granted to authenticated users

---

**Status**: Migration ready to apply
**Impact**: Fixes broken program and site audit logs
**Risk**: Low - only updates RPC function definitions, no data changes
**Rollback**: Drop the three functions and restore previous versions from `20251108130001_create_device_history_rpc_functions.sql`
