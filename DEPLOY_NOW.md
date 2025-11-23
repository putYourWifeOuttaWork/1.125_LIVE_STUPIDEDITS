# 🚀 Deploy Edge Function NOW

## What's Fixed
Missing linkage in buffer object prevented wake payloads from being marked 'complete', which blocked session counter triggers.

## Single Action Required

### Deploy MQTT Handler
1. Open: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/functions
2. Find: `mqtt_device_handler`
3. Click: **Deploy**
4. Wait for: Deployment complete message

## That's It!

After deployment:
- Wake payloads will be marked 'complete' when images finish
- Session counters will automatically increment
- UI will show correct wake/image counts

## Test It
Send a device wake message and watch the session page update in real-time.

## Optional: Backfill Old Data
If you want to fix historical sessions, run the SQL in `FIXES_APPLIED_NOV23.md` Priority 3.
