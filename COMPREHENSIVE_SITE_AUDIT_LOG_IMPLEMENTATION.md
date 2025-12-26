# Comprehensive Site Audit Log - Implementation Complete

## What Was Implemented

### 1. Database Function: `get_comprehensive_site_audit_log`

**Location**: `COMPREHENSIVE_SITE_AUDIT_MIGRATION.sql` (in project root)

This new database function consolidates ALL site-related activity into a unified audit log by querying 7 different data sources:

1. **Site & Submission History** (pilot_program_history_staging)
   - Site property updates
   - Submissions created/updated/deleted
   - Petri and Gasifier observations

2. **Device History** (device_history)
   - Device lifecycle events (provisioning, configuration, status changes)
   - Device assignments/unassignments
   - Device-related user actions

3. **Device Alerts** (device_alerts)
   - Alerts triggered by devices
   - Alert resolutions by users
   - Includes severity levels (info, warning, error, critical)

4. **Device Commands** (device_commands)
   - User-initiated commands (retry image, reboot, update schedule, etc.)
   - Command status tracking
   - Only shows user-initiated commands (not system-generated)

5. **Device Images** (device_images)
   - Image captures (completed and failed)
   - MGI scoring results
   - Image capture metadata

6. **Device Site Assignments** (device_site_assignments)
   - Device assignment to site
   - Device unassignment from site
   - Assignment metadata

7. **Device Schedule Changes** (device_schedule_changes)
   - Wake schedule updates
   - Schedule change requests and applications

### 2. Frontend Updates

#### Hook: `useAuditLog.ts`
- Updated `fetchAuditLogs()` to use comprehensive function for sites
- Updated `filterLogs()` to support event source filtering
- Program-level audit logs continue to use traditional function

#### UI: `AuditLogPage.tsx`
- Added `siteEventSources` array for site-specific filters
- Dynamic filter dropdown shows "Event Source" for sites, "Object Type" for programs
- Enhanced display to show:
  - Device code for device-related events
  - Severity badges for alerts
  - Better visual distinction between event types

## Unified Output Schema

Each audit log entry now includes:

```typescript
{
  event_id: UUID,
  event_source: 'site' | 'device' | 'alert' | 'command' | 'image' | 'assignment' | 'schedule',
  event_type: string,
  event_timestamp: timestamp,
  description: string,           // Human-readable description
  severity: string,              // 'info', 'warning', 'error', 'critical'
  
  object_type: string,
  object_id: UUID,
  
  site_id: UUID,
  site_name: string,
  
  device_id: UUID | null,        // NEW: Device context
  device_code: string | null,    // NEW: Device identifier
  device_name: string | null,    // NEW: Device name
  
  user_id: UUID | null,
  user_email: string | null,
  
  event_data: JSONB,             // Event-specific details
  metadata: JSONB,
  old_data: JSONB | null,
  new_data: JSONB | null
}
```

## Filtering Capabilities

The comprehensive audit log supports filtering by:

- **Date Range**: Start and end dates
- **Event Source**: site, device, alert, command, image, assignment, schedule
- **Severity**: info, warning, error, critical
- **User**: Filter by specific user
- **Device**: Filter by specific device
- **Limit**: Number of results (default 100)

## What Needs to Be Done

### 1. Apply the Database Migration

The SQL file `COMPREHENSIVE_SITE_AUDIT_MIGRATION.sql` is in the project root and needs to be applied to the database.

**Options:**
- Copy/paste the SQL into Supabase SQL Editor and run it
- Use a migration tool to apply it

### 2. Test the Audit Log

After applying the migration:

1. Navigate to a site's audit log page
2. Verify you see:
   - Site updates
   - Device events (assignments, commands, etc.)
   - Alerts triggered/resolved
   - Image captures
   - Schedule changes

3. Test the filters:
   - Filter by Event Source (try "Device Alerts", "Device Commands", etc.)
   - Filter by date range
   - Filter by user (if multiple users have activity)

### 3. Verify Data Appears

If the audit log is empty after migration:

**Check 1**: Verify the function was created
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'get_comprehensive_site_audit_log';
```

**Check 2**: Test the function directly
```sql
SELECT * FROM get_comprehensive_site_audit_log(
  p_site_id := 'YOUR_SITE_ID_HERE',
  p_start_date := NULL,
  p_end_date := NULL,
  p_event_sources := NULL,
  p_severity_levels := NULL,
  p_user_id := NULL,
  p_device_id := NULL,
  p_limit := 10
);
```

**Check 3**: Verify data exists in source tables
```sql
-- Check for device history
SELECT COUNT(*) FROM device_history WHERE site_id = 'YOUR_SITE_ID';

-- Check for device alerts
SELECT COUNT(*) FROM device_alerts WHERE site_id = 'YOUR_SITE_ID';

-- Check for device images
SELECT COUNT(*) FROM device_images WHERE site_id = 'YOUR_SITE_ID';

-- Check for device commands
SELECT COUNT(*) FROM device_commands WHERE site_id = 'YOUR_SITE_ID';
```

## Benefits

### Comprehensive Visibility
- Single timeline showing ALL activity at a site
- Device activity integrated with user actions
- No more siloed views of different event types

### Better Context
- Device information shown for device-related events
- Alert severity clearly indicated
- Command status and details visible

### Flexible Filtering
- Filter by specific event sources
- Focus on critical alerts only
- View only user-initiated actions

### Deduplication
- Smart filtering avoids duplicate entries
- High-volume telemetry data excluded
- Primary event sources prioritized

## Architecture Notes

### Performance Considerations
- Uses UNION ALL (not UNION) for better performance
- Indexed columns (site_id, device_id, timestamps) for fast queries
- LIMIT clause to prevent excessive data retrieval
- Excludes high-volume telemetry table

### Security
- SECURITY DEFINER with company context validation
- Verifies site exists and is accessible
- Only shows data for user's accessible sites
- Follows existing RLS patterns

### Backward Compatibility
- Program-level audit logs unchanged
- Old `get_site_audit_history` function still exists
- New function only used when site_id is present

## Event Source Reference

| Event Source | Description | Key Information Shown |
|-------------|-------------|----------------------|
| site | Site and submission updates | Site name, user, changes made |
| device | Device lifecycle events | Device code, event type, severity |
| alert | Device alerts triggered/resolved | Alert message, severity, device |
| command | User commands to devices | Command type, status, device |
| image | Image captures and MGI scoring | Image name, MGI score, status |
| assignment | Device assignments to site | Device, user, assignment reason |
| schedule | Wake schedule changes | New schedule, device, user |

## Next Steps for Enhancement

If time permits, consider:

1. **Pagination**: Implement cursor-based pagination for large datasets
2. **Export**: Update CSV export to include device fields
3. **Real-time Updates**: Add real-time subscription for live audit feed
4. **Advanced Filters**: Add device type filter, alert category filter
5. **Session Detail Link**: Link device events to session detail pages
6. **Telemetry Option**: Add opt-in telemetry view (separate tab)

## Testing Checklist

- [ ] Migration applied successfully
- [ ] Site audit log loads without errors
- [ ] Device events appear in the log
- [ ] Alert events show severity badges
- [ ] Command events show command details
- [ ] Image events show MGI scores
- [ ] Assignment events show device info
- [ ] Filters work correctly
- [ ] Date range filtering works
- [ ] User filter works
- [ ] Device code displays for device events
- [ ] Severity badges show correct colors
- [ ] No performance issues with 100+ entries

## Support

If you encounter any issues:

1. Check browser console for errors
2. Verify migration was applied: Check function exists in database
3. Test function directly in SQL editor with sample site_id
4. Verify source tables have data for the test site
5. Check that site_id and device site_id relationships are correct

---

**Implementation Date**: December 26, 2024
**Status**: Ready for migration deployment
**Database Changes**: One new function, no schema changes required
