# 🚨 CRITICAL: Migration Required for Device Provisioning

## Status: DATABASE SCHEMA INCOMPLETE

Your device provisioning system is **partially deployed** but **cannot function** until you apply a critical database migration.

---

## What's Missing

I've verified your database schema and found that **4 critical components are missing**:

1. ❌ `device_code` column in the `devices` table
2. ❌ `device_site_assignments` junction table
3. ❌ `device_program_assignments` junction table
4. ❌ `site_program_assignments` junction table

These are **required** for the auto-provisioning flow to work.

---

## Why This Matters

When a device powers on in the field and publishes to MQTT:

1. ✅ The MQTT edge function will receive the message
2. ✅ It will attempt to auto-provision the device
3. ❌ **The database insert will FAIL** because `device_code` column doesn't exist
4. ❌ The device will NOT appear in your UI
5. ❌ You will NOT be able to map it to a site

**Result: Devices deployed in the field will be invisible to your system.**

---

## How to Fix (2 Options)

### Option 1: Use Supabase Dashboard (RECOMMENDED)

**Step 1:** Open your Supabase SQL Editor
👉 https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new

**Step 2:** Copy the migration file
File location: `supabase/migrations/20251108120000_add_junction_tables_and_codes.sql`

**Step 3:** Paste into the SQL Editor and click **"Run"**

**Step 4:** Verify the migration succeeded:
```bash
node verify-schema-complete.mjs
```

You should see: ✅ ALL CRITICAL CHECKS PASSED

---

### Option 2: Use Supabase CLI (If Installed)

```bash
supabase db push
```

This will automatically apply all pending migrations.

---

## What This Migration Does

### 1. Adds Device Codes
- Adds `device_code` column to `devices` table
- Auto-generates codes like: `DEVICE-ESP32S3-001`, `DEVICE-ESP32S3-002`, etc.
- Makes devices easy to identify in the UI

### 2. Adds Site Codes
- Adds `site_code` column to `sites` table
- Enables human-readable site references

### 3. Creates Junction Tables
Three new tables to track assignment history:

**device_site_assignments**
- Tracks which devices are assigned to which sites
- Maintains complete history (when assigned, by whom, when unassigned)
- Supports devices being reassigned between sites

**device_program_assignments**
- Tracks which devices are in which programs
- Enables cross-program device usage

**site_program_assignments**
- Tracks which sites belong to which programs
- Enables site reuse across programs

### 4. Migrates Existing Data
- Automatically migrates your 2 existing devices to the junction tables
- Preserves all current assignments
- No data loss

### 5. Sets Up Security
- Enables Row Level Security (RLS) on all new tables
- Only company admins can manage device assignments
- Users can only view devices in their programs

---

## After Migration

Once the migration is applied, your auto-provisioning flow will work:

1. ✅ Device powers on and publishes to MQTT
2. ✅ Edge function receives the message
3. ✅ Device is auto-provisioned with a unique code
4. ✅ Device appears in the UI under "Pending Devices"
5. ✅ Admin clicks "Map" and assigns to a site
6. ✅ Device starts capturing images linked to that site

---

## Current System State

### ✅ Working Components
- MQTT edge function code is ready
- UI components are ready (DevicesPage, DeviceMappingModal)
- Device registration logic is implemented
- Auto-provisioning logic exists in edge function

### ❌ Blocked Components
- Auto-provisioning (device_code generation will fail)
- Device mapping workflow (junction tables don't exist)
- Assignment history tracking (tables don't exist)

---

## Next Steps

1. **Apply the migration** (see Option 1 or 2 above)
2. **Verify schema** by running: `node verify-schema-complete.mjs`
3. **Deploy MQTT edge function** (separate task)
4. **Test provisioning** with: `node test-mqtt-provisioning.mjs`

---

## Need Help?

If you encounter any errors during migration, check:

1. **Permission errors**: Make sure you're logged into Supabase Dashboard as the project owner
2. **Syntax errors**: The migration file uses PostgreSQL-specific syntax (DO blocks, IF NOT EXISTS)
3. **Constraint violations**: If you have existing data that violates the new constraints

The migration is designed to be **safe and idempotent** - you can run it multiple times without issues.

---

## Migration File Location

```
supabase/migrations/20251108120000_add_junction_tables_and_codes.sql
```

This file is **442 lines** of SQL that will transform your database schema to support the complete device provisioning flow.
