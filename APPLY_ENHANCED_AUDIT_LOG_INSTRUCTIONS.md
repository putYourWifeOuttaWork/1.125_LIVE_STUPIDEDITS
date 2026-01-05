# Enhanced Site Audit Log Migration

## Quick Apply Instructions

### Step 1: Copy the SQL

```bash
# On Mac/Linux:
cat APPLY_ENHANCED_AUDIT_LOG.sql | pbcopy

# On Windows PowerShell:
Get-Content APPLY_ENHANCED_AUDIT_LOG.sql | Set-Clipboard

# Or just open the file and copy manually
```

### Step 2: Apply in Supabase Dashboard

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Paste the SQL from Step 1
5. Click **Run** (or press Cmd/Ctrl + Enter)

### Step 3: Verify It Worked

```bash
node apply-enhanced-audit-migration.mjs
```

You should see:
```
✅ Function test successful! Returned X events

📊 Event sources found:
  - session: X events
  - wake: X events
  - site: X events
  ...
```

---

## What This Migration Does

### New Event Sources

1. **session** - Daily session lifecycle events
   - Session created
   - Session in progress
   - Session locked (end of day)
   - Includes expected vs. actual wake counts
   - Warnings for sessions with >50% failed wakes

2. **wake** - Milestone device wake events (filtered for importance)
   - Failed wakes
   - Wakes with completed images
   - Low battery warnings (<3.3V)
   - Overage flags

### Why Filtered Wake Events?

Devices can wake 24-96 times per day. Showing every single wake would overwhelm the audit log. Instead, we only show milestone events:
- Failures (need attention)
- Image captures (important moments)
- Battery warnings (maintenance needed)
- Extra/unexpected wakes (anomalies)

This keeps the audit log focused on actionable events.

### Event Schema

All events now include a `session_id` field when applicable, allowing drill-down from audit log → session detail page.

---

## New Filter Options

The updated audit log supports filtering by:
- **Event Source**: `session`, `wake`, `site`, `device`, `alert`, `command`, `image`, `assignment`, `schedule`
- **Severity**: `info`, `warning`, `error`, `critical`
- **Device**: Filter by specific device
- **Date Range**: Start and end dates
- **User**: Filter by user who triggered the event

---

## Next Steps

After applying this migration, the frontend will be updated to:
1. Display session and wake events in the audit log
2. Add expandable rows with full JSON details
3. Add drill-down navigation links (click device code → device page, click session ID → session page)
4. Show session_id column in the table
5. Update event source dropdown to include "Daily Sessions" and "Device Wakes"

---

## Rollback (If Needed)

If you need to revert this migration:

```sql
DROP FUNCTION IF EXISTS get_comprehensive_site_audit_log(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[], UUID, UUID, INTEGER);

-- Then reapply the old version from:
-- COMPREHENSIVE_SITE_AUDIT_MIGRATION.sql
```

---

## Support

If you encounter any issues:

1. Check that site_device_sessions and device_wake_payloads tables exist
2. Verify you have data in these tables
3. Run the test script: `node apply-enhanced-audit-migration.mjs`
4. Check for error messages in the SQL editor

Common issues:
- **"relation does not exist"**: The required tables haven't been created yet
- **"permission denied"**: You need to run this as a service role or admin
- **"no rows returned"**: Normal if you have no site activity yet
