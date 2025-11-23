# 🚀 Ready to Apply: Junction Table Fix

## Migration File Location
```
supabase/migrations/20251122140000_fix_junction_table_assignment_system.sql
```

## Quick Steps

### 1. View the Migration
```bash
cat supabase/migrations/20251122140000_fix_junction_table_assignment_system.sql
```

### 2. Copy & Apply
1. **Copy** the entire contents (it's a 13KB SQL file)
2. **Open** your Supabase Dashboard
3. **Navigate** to SQL Editor
4. **Create** a New Query
5. **Paste** the migration
6. **Click** Run (or press Cmd/Ctrl + Enter)

### 3. Verify
```bash
node verify-junction-fix.mjs
```

---

## What This Fixes

**Problem:** Site Template device assignments only updated `devices` table, not junction tables.

**Solution:** 
- Fixes `fn_assign_device_to_site` to create junction records
- Fixes `fn_remove_device_from_site` to deactivate junctions
- Creates auto-sync triggers
- Backfills ~5 devices (LAB001-005) with missing records

**Result:**
- Programs tab shows complete history
- Assignment card shows correct data
- All future Site Template assignments create junctions

---

## Guarantees

✅ All map positions preserved (x_position, y_position untouched)  
✅ Maps look and work identically  
✅ No breaking changes to existing queries  
✅ No data loss (only adds missing records)  
✅ Idempotent (safe to run multiple times)

---

## After Migration

Everything will work automatically. Optionally you can:
1. Test Site Template device assignment
2. Check Programs tab for complete history
3. Verify junction records exist for all devices

**No code changes needed - the migration fixes everything!**
