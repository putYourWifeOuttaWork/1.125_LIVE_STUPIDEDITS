# Device Images Migration Validation Report
**Date:** 2026-01-04
**Status:** PARTIALLY APPLIED - ACTION REQUIRED

---

## Executive Summary

The device_images computed columns migration **has been applied**, but there's a critical data quality issue that needs immediate attention.

### Current State
- ✅ **Migration Applied:** Computed columns (temperature, humidity, pressure, gas_resistance) exist
- ✅ **LOCF Function:** `get_device_environmental_with_locf()` is deployed and working
- ⚠️ **Data Quality:** Only **8.6%** of rows have computed values populated

### The Problem

PostgreSQL GENERATED STORED columns only compute values when rows are **INSERTED or UPDATED**. Your 408 existing device_images were inserted **before** the migration was applied, so their computed columns remain NULL.

- Total device_images: **408**
- Rows with metadata JSONB: **271 (66.4%)**
- Rows with computed temperature: **35 (8.6%)**
- **Expected:** ~175 rows (all complete + metadata rows)
- **Missing:** ~140 rows need backfill

---

## Detailed Findings

### 1. Computed Columns Status
```
✅ Columns exist: temperature, humidity, pressure, gas_resistance
✅ Recent images: 5/5 have computed values (100%)
❌ Old images: ~140/175 are missing computed values (80% missing)
```

### 2. Function Deployment
```
✅ get_device_environmental_with_locf() - Deployed and functional
⚠️  generate_session_wake_snapshot() - Version unclear
```

### 3. Data Distribution
```
Total rows:                  408
Status = 'complete':         175 (42.9%)
With metadata JSONB:         271 (66.4%)
With computed temperature:    35 (8.6%)
```

### 4. Root Cause Analysis

**Why are computed values missing?**

GENERATED STORED columns in PostgreSQL work like this:
1. When a row is **inserted** → PostgreSQL computes the value from the expression
2. When a row is **updated** → PostgreSQL recomputes the value
3. When you **add** the column to existing table → Existing rows get NULL

Your timeline:
- **Before migration:** 373 rows inserted (computed columns don't exist yet)
- **Migration applied:** Computed columns added (but existing rows NOT updated)
- **After migration:** 35 new rows inserted (computed columns work correctly!)

---

## Required Action: Backfill

### Step 1: Apply Backfill SQL

Run this via **Supabase SQL Editor:**

```sql
-- Force PostgreSQL to compute values from metadata JSONB
UPDATE device_images
SET updated_at = NOW()
WHERE metadata IS NOT NULL
  AND temperature IS NULL;
```

**Expected impact:**
- Updates: ~140 rows
- Duration: <5 seconds
- Result: Data quality jumps from 8.6% to ~43%

### Step 2: Verify Backfill

Run the verification script:
```bash
node verify-migration-status.mjs
```

Expected output after backfill:
```
Data Quality: 43.0% ✅
With computed temperature: 175/408
```

---

## Migration Files Status

| File | Status | Notes |
|------|--------|-------|
| `20260104_device_images_computed_columns.sql` | ✅ Applied | Columns exist |
| `20260104_locf_environmental_helper.sql` | ✅ Applied | Function works |
| `20260104_session_wake_snapshots_device_images.sql` | ❓ Unknown | Need to verify which version is deployed |
| `20260104_backfill_device_images_computed.sql` | ❌ **NEEDS TO RUN** | Backfill existing rows |
| `20260104_fix_snapshot_aggregates.sql` | ❓ Conflicting | Uses device_telemetry (old) |
| `20260104_backfill_snapshot_aggregates.sql` | ⏸️ Pending | Run after choosing snapshot function version |

---

## Architecture Decision Required

There are **two conflicting versions** of `generate_session_wake_snapshot()`:

### Option A: Old Architecture (device_telemetry)
**File:** `20260104_fix_snapshot_aggregates.sql`
- Uses `device_telemetry` table for environmental data
- Keeps existing architecture
- Requires maintaining two tables

### Option B: New Architecture (device_images) ⭐ RECOMMENDED
**File:** `20260104_session_wake_snapshots_device_images.sql`
- Uses `device_images` as single source of truth
- Uses computed columns for fast queries
- Uses LOCF helper function
- Cleaner architecture, better performance

**Recommendation:** Apply Option B (device_images architecture) since:
1. Computed columns are already added
2. LOCF helper is already deployed
3. Single source of truth is cleaner
4. Better aligned with MQTT ingestion flow

---

## Next Steps

### Immediate (Required)
1. ✅ Run `20260104_backfill_device_images_computed.sql`
2. ✅ Verify backfill completed successfully

### Architecture Decision (Choose One)
3a. **If keeping device_telemetry:** Apply `20260104_fix_snapshot_aggregates.sql`
3b. **If moving to device_images (recommended):** Apply `20260104_session_wake_snapshots_device_images.sql`

### After Choosing Architecture
4. Run appropriate backfill for snapshots:
   - If (3a): Run `20260104_backfill_snapshot_aggregates.sql`
   - If (3b): Regenerate snapshots using new function

### Testing
5. Test snapshot generation with live data
6. Monitor query performance
7. Verify environmental data displays correctly in UI

---

## Testing Checklist

After backfill:
- [ ] Device environmental panel shows temperature/humidity
- [ ] Session detail view shows environmental trends
- [ ] Snapshots include environmental aggregates
- [ ] LOCF correctly fills gaps in data
- [ ] No performance degradation on queries

---

## Questions?

Run the validation scripts:
```bash
# Check current state
node verify-migration-status.mjs

# Check after backfill
node verify-migration-status.mjs
```

Expected final state:
- Data Quality: **~43%** (all complete rows with metadata)
- LOCF handles remaining gaps
- New images: 100% coverage automatically
