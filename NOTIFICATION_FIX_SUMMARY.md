# Notification System - Fix Summary

## Problem
SQL migrations referenced non-existent columns in your database schema.

## Root Cause
Your existing schema uses different column names than expected:

| Expected | Actual | Table |
|----------|--------|-------|
| `id` | `alert_id` | device_alerts |
| `is_acknowledged` | `resolved_at` | device_alerts |
| `id` | `company_id` | companies |

## Errors Fixed

### Error 1: Foreign Key Constraint
```
ERROR: 42703: column "id" referenced in foreign key constraint does not exist
```
**Fixed:** Changed all `device_alerts(id)` references to `device_alerts(alert_id)`

### Error 2: Column Does Not Exist
```
ERROR: 42703: column new.is_acknowledged does not exist
LINE 44: WHEN (NEW.is_acknowledged = false)
```
**Fixed:** Changed trigger condition to `NEW.resolved_at IS NULL`

## Files Corrected

### notification_system_foundation.sql
- ✓ Line 39: `companies(id)` → `companies(company_id)`
- ✓ Line 79: `device_alerts(id)` → `device_alerts(alert_id)`
- ✓ Line 81: `companies(id)` → `companies(company_id)`
- ✓ Line 112: `companies(id)` → `companies(company_id)`

### auto_notify_alerts_trigger.sql
- ✓ Line 25: `NEW.id` → `NEW.alert_id`
- ✓ Line 33: `NEW.id` → `NEW.alert_id`
- ✓ Line 44: `NEW.is_acknowledged = false` → `NEW.resolved_at IS NULL`

## Ready to Deploy

Both SQL files are now corrected and ready to apply to your Supabase database.

**Next Step:** Follow the deployment guide in `DEPLOY_NOTIFICATION_SYSTEM.md`

## Quick Deploy

1. Open Supabase SQL Editor
2. Paste and run `notification_system_foundation.sql`
3. Paste and run `auto_notify_alerts_trigger.sql`
4. Test with the verification queries
5. Done!
