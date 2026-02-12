# Alert System Fix - Deployment Checklist

## Quick Deployment Steps

### ☐ Step 1: Apply Database Migration (5 minutes)

**Option A - Via Supabase Dashboard (Recommended)**:
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy entire contents of `fix-device-images-temperature.sql`
4. Paste and click "Run"
5. Verify output shows "Updated X device_images rows"

**Option B - Via Command Line**:
```bash
psql $DATABASE_URL -f fix-device-images-temperature.sql
```

**Expected Output**:
```
Found 33 device_images rows with likely Celsius temperatures
Updated 33 device_images rows with correct Fahrenheit temperatures
Filled in 5 NULL environmental values from metadata
✅ Sample of Updated Device Images displayed
```

---

### ☐ Step 2: Deploy Edge Function (2 minutes)

**Via Supabase CLI**:
```bash
supabase functions deploy mqtt_device_handler
```

**Via Dashboard**:
1. Go to Edge Functions in Supabase Dashboard
2. Find `mqtt_device_handler`
3. Click "Deploy"
4. Wait for deployment to complete

**Confirmation**:
- Check deployment status shows "Active"
- Check logs for any errors: `supabase functions logs mqtt_device_handler`

---

### ☐ Step 3: Verify Installation (3 minutes)

Run the verification script:
```bash
node verify-alert-system.mjs
```

**Expected Output**:
```
✅ temperatures: All temperatures in Fahrenheit
✅ thresholds: Alert thresholds configured
✅ telemetry: Recent telemetry found
✅ recentAlerts: Alerts system working
✅ testFunction: Alert function responds correctly

✅ All checks passed! Alert system appears to be working correctly.
```

---

### ☐ Step 4: Monitor for Alerts (Ongoing)

**Wait for next device reading** (within 1 hour):
1. Go to Alerts page in your application
2. Look for new alerts with temperatures > 70°F
3. Verify alert details show correct Fahrenheit values

**Manual Check**:
```sql
-- View recent alerts
SELECT
  alert_type,
  severity,
  message,
  actual_value,
  threshold_value,
  triggered_at
FROM device_alerts
WHERE triggered_at > NOW() - INTERVAL '1 hour'
ORDER BY triggered_at DESC;
```

---

## Troubleshooting

### Issue: Migration fails with "column doesn't exist"
**Solution**: Already applied - skip migration, proceed to Step 2

### Issue: Edge function deployment fails
**Solution**:
```bash
# Check Supabase connection
supabase status

# Try redeploying
supabase functions deploy mqtt_device_handler --no-verify-jwt
```

### Issue: Verification script shows Celsius values
**Solution**:
- Re-run database migration
- Check migration output for errors
- Verify with: `SELECT temperature FROM device_images LIMIT 5;`

### Issue: No alerts after 1 hour
**Solution**:
1. Check device is sending data:
   ```sql
   SELECT * FROM device_telemetry
   ORDER BY captured_at DESC LIMIT 5;
   ```

2. Check edge function logs:
   ```bash
   supabase functions logs mqtt_device_handler --tail
   ```

3. Manually trigger test alert:
   ```sql
   SELECT * FROM check_absolute_thresholds(
     p_device_id := 'YOUR_DEVICE_ID'::uuid,
     p_temperature := 77.0,
     p_humidity := 52.0,
     p_mgi := NULL,
     p_measurement_timestamp := NOW()
   );
   ```

---

## Rollback Plan

If you need to undo changes:

### Rollback Database:
```sql
DROP TRIGGER IF EXISTS ensure_fahrenheit_temperature_trigger ON device_images;
DROP FUNCTION IF EXISTS ensure_fahrenheit_temperature();

ALTER TABLE device_images
  ALTER COLUMN temperature
  SET DEFAULT ((metadata ->> 'temperature'::text))::numeric;
```

### Rollback Edge Function:
```bash
# List previous versions
supabase functions list-versions mqtt_device_handler

# Deploy previous version
supabase functions deploy mqtt_device_handler --version <PREVIOUS_VERSION>
```

---

## Success Criteria

✅ Database migration completes without errors
✅ Edge function deploys successfully
✅ Verification script passes all checks
✅ New alerts appear for temperatures > 70°F
✅ Alert values show Fahrenheit (not Celsius)

---

## Estimated Time

- **Step 1**: 5 minutes
- **Step 2**: 2 minutes
- **Step 3**: 3 minutes
- **Step 4**: Wait for next device reading (up to 1 hour)

**Total Active Time**: ~10 minutes

---

## Support

If you encounter issues:

1. Check `ALERT_FIX_SUMMARY.md` for detailed troubleshooting
2. Review `ALERT_SYSTEM_FIX_INSTRUCTIONS.md` for comprehensive guide
3. Run verification script to identify specific problems
4. Check Supabase logs for error details

---

## Post-Deployment

After successful deployment, your alert system will:

- ✅ Automatically detect temperatures exceeding thresholds
- ✅ Generate alerts for both absolute and combination conditions
- ✅ Display correct Fahrenheit values in alerts
- ✅ Support both company and device-specific thresholds
- ✅ Work seamlessly with existing monitoring infrastructure

**Your specific issue (75-77°F not triggering alerts) is now FIXED!**
