# Table Column Reference

## Summary

Based on actual database schema:

### ✅ device_wake_sessions
- **Has:** company_id, program_id, site_id
- **Action:** No changes needed in triggers/backfill

### ✅ device_commands
- **Has:** company_id, program_id, site_id
- **Actual columns:** command_id, device_id, command_type, command_payload, issued_at, delivered_at, acknowledged_at, status, retry_count, created_by_user_id, notes, priority, scheduled_for, published_at, completed_at, expires_at, max_retries, error_message, company_id, program_id, site_id
- **Action:** Use actual column names in backfill

### ❌ device_schedule_changes
- **Has:** company_id only (NO program_id, NO site_id)
- **Actual columns:** change_id, company_id, device_id, new_wake_schedule_cron, requested_at, requested_by_user_id, effective_date, applied_at, applied_by_function
- **Action:** JOIN devices table to get program_id and site_id

### ❌ device_alerts
- **Status:** Table empty (no data to check)
- **Has:** company_id only (per migration 20251109000001)
- **Action:** JOIN devices table to get program_id and site_id

---

## Migration 20251116000010 Fixes Needed

### 1. device_schedule_changes trigger ✅ FIXED
- Added JOIN to devices table
- Uses correct column: `new_wake_schedule_cron` (not `new_schedule`)
- Uses correct column: `requested_by_user_id` (not `changed_by`)

### 2. device_schedule_changes backfill ✅ FIXED
- Added JOIN to devices table for program_id/site_id
- Uses correct columns

### 3. device_alerts trigger ⚠️ NEEDS FIX
- Add JOIN to devices table for program_id/site_id
- Fix column names:
  - No `metric_name`, `metric_value`, `threshold_value`
  - Has: `metadata` (JSONB)
  - Has: `resolved_by_user_id` (not `resolved_by`)
  - Has: `resolution_notes` (not `resolution_note`)
  - Check: `resolved_at` (not `is_resolved` boolean)

### 4. device_alerts backfill ⚠️ NEEDS FIX
- Add JOIN to devices table for program_id/site_id
- Use correct column names

### 5. device_commands trigger ⚠️ NEEDS FIX
- Already has program_id/site_id - no JOIN needed!
- Fix column names:
  - Has: `command_payload` (not `parameters`)
  - Has: `created_by_user_id` (not `issued_by`)
  - No `priority` or `error_message` in original schema (added later)

### 6. device_commands backfill ⚠️ NEEDS FIX
- Already has program_id/site_id - no JOIN needed!
- Use correct column names

---

## Recommendation

The migration file has too many column mismatches to fix incrementally. Better approach:

**Option 1:** Simplify migration to ONLY handle what exists
- Skip device_alerts (table empty anyway)
- Focus on device_schedule_changes and device_wake_sessions
- Add device_commands later when schema is clarified

**Option 2:** Apply migrations that add missing columns first
- Check if there are pending migrations that add program_id/site_id to alerts
- Apply those first
- Then apply consolidation migration

**Option 3:** Manual application
- Apply Step 1 (enum values) ✅
- Skip Step 2 (has errors)
- Manually create triggers one by one after verifying columns
