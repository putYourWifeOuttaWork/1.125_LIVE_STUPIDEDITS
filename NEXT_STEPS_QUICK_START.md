# Device Submission System - Quick Start Guide

## 🎉 What's Been Implemented

### ✅ Completed Features

1. **Unified Submissions List**
   - Site submissions page now shows BOTH manual AND device submissions
   - Device submissions appear with blue accent border and WiFi icon
   - Manual submissions remain unchanged (green accent, user icon)
   - Both sorted by date, newest first

2. **Device Submission Card**
   - Shows session date and time range
   - Displays completion percentage
   - Shows wake statistics: Expected, Completed, Failed, Extra
   - Status badges: Pending, In Progress, Locked
   - Config changed flag warning
   - Click to view full details

3. **Mock Data Generator Functions**
   - 5 database functions created for realistic testing
   - Generate devices, sessions, wake events, images
   - Cleanup function for removing test data
   - Uses real images from Unsplash

4. **Database Investigation**
   - Found 5 existing device sessions (already in database!)
   - Identified and fixed enum errors blocking session creation
   - Verified test site and devices exist

---

## 🚀 How to Start Testing

### Step 1: Apply the Migration (REQUIRED)

The mock data generator functions don't exist in your database yet. Apply the migration:

**Via Supabase Dashboard (Easiest):**
1. Go to https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/sql/new
2. Open file: `supabase/migrations/20251111130000_fix_enum_errors_and_mock_generators.sql`
3. Copy all contents
4. Paste into SQL editor
5. Click "Run"

**Result**: 5 new functions will be available for generating mock data

### Step 2: View Existing Device Submissions

Your database already has 5 device sessions! Just need to view them:

1. Launch the app: `npm run dev`
2. Navigate to: **Test Site for IoT Device**
3. You should NOW see device submissions in the list (blue cards with WiFi icon)
4. Click any device submission to view details

If you don't see them, the issue is likely RLS policies - check if you're logged in as a user with access to that company.

### Step 3: Generate Mock Data (Optional)

Create additional test data using the functions:

```sql
-- 1. Create a mock unmapped device
SELECT fn_generate_mock_unmapped_device('My Test Device', '0 8,16 * * *');
-- Returns device_id and device_code (like MOCK-DEV-5231)

-- 2. Map it to a site in Device Registry UI
-- (manual step - assign to "Test Site for IoT Device")

-- 3. Generate a session with auto-generated wakes
SELECT fn_generate_mock_session_for_device(
  '<paste-device-id-here>'::UUID,
  CURRENT_DATE,
  true  -- auto-creates wake payloads
);

-- 4. Add individual wake events
SELECT fn_generate_mock_wake_payload(
  '<session-id>'::UUID,
  '<device-id>'::UUID,
  'complete',  -- or 'failed', 'pending'
  true  -- include image
);

-- 5. Clean up when done
SELECT fn_cleanup_mock_device_data('<device-id>'::UUID, true);
```

---

## 🎨 What You'll See

### Site Submissions Page
- **Device submissions** (blue border, WiFi icon):
  - Session date: "Nov 10, 2025"
  - Time range: "12:00 AM - 11:59 PM"
  - Completion: "25%" with progress bar
  - Stats: "12 Expected | 3 Completed | 0 Failed | 0 Extra"
  - Status: "LOCKED" or "IN PROGRESS"

- **Manual submissions** (green border, user icon):
  - Unchanged from before
  - All existing functionality preserved

### Device Submission Detail Page
- Session overview with metrics
- List of wake payloads with:
  - Wake number (#1, #2, #3...)
  - Timestamp
  - Telemetry: Temperature, Humidity, Battery, WiFi signal
  - Image status/thumbnail
  - Status badge (Complete/Failed/Pending)

---

## 🔜 What's Next (Not Yet Implemented)

### Mock Data UI Buttons
Currently, you generate mock data via SQL. Next step: Add UI buttons!

**Planned Locations:**
1. Home Page → "Testing Tools" dropdown
2. Device Registry → "Generate Mock Device" button
3. Device Detail Page → "Generate Session" button
4. Device Submission Detail → "Add Wake Payload" button

### Enhanced Detail Page
- Device cards (accordion style) for each device at site
- Wake sessions organized by device
- Image gallery per device
- Device actions: Retry, Schedule Changes, Commands

### Session Locking UI
- Visual lock overlay when session ends (11:59 PM)
- Countdown timer for active sessions
- Disabled edit buttons for locked sessions

---

## 📁 Key Files Modified

```
src/
├── pages/
│   └── SubmissionsPage.tsx                        ✅ Updated (unified list)
├── components/
│   └── submissions/
│       └── DeviceSubmissionCard.tsx              ✅ New (device card)
├── hooks/
│   └── useSiteDeviceSessions.ts                  ✅ Already existed
supabase/
└── migrations/
    └── 20251111130000_fix_enum_errors_and_mock_generators.sql  ✅ New (apply this!)
```

---

## 🐛 Troubleshooting

### "I don't see any device submissions"
- **Check**: Did you apply the migration? It fixes session creation errors
- **Check**: Are you logged in as a user with access to the test site's company?
- **Try**: Run `SELECT * FROM site_device_sessions;` to see if sessions exist
- **Solution**: Generate new session via `fn_generate_mock_session_for_device()`

### "Functions don't exist"
- **Issue**: Migration not applied yet
- **Solution**: Follow Step 1 above to apply the migration
- **Verify**: `SELECT * FROM pg_proc WHERE proname LIKE 'fn_generate%';`

### "Session creation fails"
- **Error**: "invalid input value for enum airflow_enum: Moderate"
- **Solution**: Apply the migration - it fixes this enum error
- **Test**: `SELECT auto_create_daily_sessions();`

### "Device submissions look weird"
- **Check**: Browser cache - try hard refresh (Ctrl+Shift+R)
- **Check**: Console for errors
- **Verify**: Build succeeded with `npm run build`

---

## 🎯 Success Checklist

- [ ] Migration applied successfully
- [ ] Device submissions visible in site list
- [ ] Device submissions have blue accent border
- [ ] Manual submissions still work correctly
- [ ] Clicking device submission shows detail page
- [ ] Can generate mock device via SQL
- [ ] Can generate mock session via SQL
- [ ] Can generate mock wake payloads via SQL

---

## 💡 Pro Tips

1. **Start with existing data**: Your database already has 5 sessions - view those first!
2. **One device at a time**: Generate and test one mock device before creating many
3. **Use complete status**: Most wakes should be 'complete' for realistic testing
4. **Include images**: Set `include_image=true` to see full functionality
5. **Clean up**: Use `fn_cleanup_mock_device_data()` to remove test data

---

## 📞 Need Help?

If something isn't working:
1. Check `DEVICE_SUBMISSION_IMPLEMENTATION_STATUS.md` for detailed status
2. Review `APPLY_MOCK_GENERATORS_MIGRATION.md` for migration instructions
3. Look at browser console for error messages
4. Verify you're on the test site: "Test Site for IoT Device"

---

**Ready to Start?**
1. Apply migration (Step 1 above)
2. View Test Site
3. See device submissions appear!

---

**Last Updated**: November 11, 2025
**Status**: Ready for Testing (after migration applied)
