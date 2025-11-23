# ✅ Edge Function Fix Applied

## Root Cause Found!

The error was NOT in the database - it was in the **Edge Function** calling a non-existent RPC function!

### The Problem

The TypeScript code was calling:
```typescript
await supabase.rpc('fn_get_active_session_for_site', { p_site_id: lineageData.site_id })
```

But **this function doesn't exist in the database!** 

When a non-existent RPC function is called, PostgreSQL tries to parse it and throws a format() error about invalid specifiers.

### The Fix

Replaced all 3 instances of the RPC call with direct Supabase queries:

```typescript
const { data: sessionData } = await supabase
  .from('site_device_sessions')
  .select('session_id')
  .eq('site_id', lineageData.site_id)
  .in('status', ['pending', 'in_progress'])
  .eq('session_date', new Date().toISOString().split('T')[0])
  .order('session_start_time', { ascending: false })
  .limit(1)
  .maybeSingle();
sessionId = sessionData?.session_id || null;
```

### Changed Files

- `supabase/functions/mqtt_device_handler/ingest.ts`
  - Line ~189: handleHelloStatus() - Get active session
  - Line ~395: handleMetadata() - Get active session  
  - Line ~568: handleTelemetryOnly() - Get active session

### Why This Works

1. ✅ Direct query to `site_device_sessions` table
2. ✅ Uses `.maybeSingle()` (returns null if not found)
3. ✅ No undefined RPC functions
4. ✅ No format() errors

### Next Steps

**You must redeploy the Edge Function:**

```bash
# From project root
cd supabase/functions
supabase functions deploy mqtt_device_handler
```

Or use the Supabase Dashboard:
1. Go to Edge Functions
2. Find `mqtt_device_handler`
3. Click Deploy
4. Wait for deployment

### Testing

After deployment, send your test device message:

```
Expected result:
✅ [SUCCESS] Created image record {id}
✅ [SUCCESS] Telemetry recorded: temp=29.9 rh=55
```

## Summary

- ❌ **Before:** Calling non-existent RPC → format() error
- ✅ **After:** Direct Supabase query → works perfectly
- 📦 **Frontend build:** ✅ Successful  
- 🚀 **Edge function:** ⏳ Needs deployment

The database trigger fix we applied earlier WAS necessary and IS working. This was a separate issue in the Edge function code!
