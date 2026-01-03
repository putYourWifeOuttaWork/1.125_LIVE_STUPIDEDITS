# Manual Wake Command Queue Integration - Deployment Checklist

## Pre-Deployment Verification

### Code Changes
- [x] ManualWakeModal.tsx updated with command queue insertion
- [x] mqtt_device_handler_bundled/index.ts updated with override clearing
- [x] Build passes without errors
- [x] No TypeScript compilation errors
- [x] All dependencies resolved

### Database Schema
- [x] Migration `20260103230000_add_manual_wake_override.sql` exists
- [ ] Migration applied to production database
- [ ] Verify columns exist:
  ```sql
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'devices'
    AND column_name IN ('manual_wake_override', 'manual_wake_requested_by', 'manual_wake_requested_at');
  ```

### MQTT Service
- [ ] CommandQueueProcessor running (check `pm2 status mqtt-service`)
- [ ] Verify polling interval (default: 5 seconds)
- [ ] Check MQTT broker connectivity
- [ ] Review recent command processing logs

### Edge Function
- [ ] Bundled edge function deployed
- [ ] Test edge function responds to webhooks
- [ ] Verify logs show proper HELLO handling
- [ ] Check manual_wake_override detection logic

## Testing Phase

### Unit Testing
- [ ] Run automated test script:
  ```bash
  node test-manual-wake-flow.mjs
  ```
- [ ] Verify all steps pass
- [ ] Check command queue insertion
- [ ] Confirm override clearing logic

### Integration Testing
- [ ] Select test device with regular schedule
- [ ] Schedule manual wake (1 minute)
- [ ] Verify command in database:
  ```sql
  SELECT * FROM device_commands
  WHERE command_type = 'set_wake_schedule'
  ORDER BY issued_at DESC LIMIT 5;
  ```
- [ ] Wait for command delivery (check status changes to 'sent')
- [ ] Verify device receives command (check MQTT logs)
- [ ] Wait for device wake
- [ ] Confirm override cleared:
  ```sql
  SELECT device_name, manual_wake_override, next_wake_at
  FROM devices
  WHERE device_id = 'TEST_DEVICE_ID';
  ```
- [ ] Verify regular schedule resumed

### User Acceptance Testing
- [ ] Test with super admin user
- [ ] Test with company admin user
- [ ] Test with regular user
- [ ] Verify proper permissions
- [ ] Test all quick action buttons (1m, 5m, 10m, 30m)
- [ ] Test custom time input
- [ ] Verify UI feedback (toasts, loading states)

## Deployment Steps

### 1. Deploy Frontend
```bash
# Build production bundle
npm run build

# Deploy to hosting (e.g., Netlify, Vercel)
# Follow your deployment process
```

### 2. Deploy Edge Function (if needed)
```bash
# If bundled function needs redeployment
# Upload to Supabase dashboard or use CLI
```

### 3. Restart MQTT Service
```bash
# Ensure latest command queue processor is running
pm2 restart mqtt-service
pm2 logs mqtt-service --lines 50
```

### 4. Verify Deployment
- [ ] Frontend deployed successfully
- [ ] No console errors in browser
- [ ] Edge function responding
- [ ] MQTT service running

## Post-Deployment Monitoring

### First 24 Hours

#### Check Command Queue
```sql
-- Monitor command processing
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (delivered_at - issued_at))) as avg_delivery_seconds
FROM device_commands
WHERE command_type = 'set_wake_schedule'
  AND issued_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

#### Check Manual Wake Usage
```sql
-- Track manual wake requests
SELECT
  DATE_TRUNC('hour', issued_at) as hour,
  COUNT(*) as manual_wakes,
  COUNT(DISTINCT created_by_user_id) as unique_users
FROM device_commands
WHERE command_type = 'set_wake_schedule'
  AND command_payload->>'manual_wake' = 'true'
  AND issued_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

#### Monitor Override Clearing
```sql
-- Find any stuck overrides
SELECT
  device_name,
  device_mac,
  manual_wake_requested_at,
  EXTRACT(EPOCH FROM (NOW() - manual_wake_requested_at))/3600 as hours_stuck
FROM devices
WHERE manual_wake_override = true
  AND manual_wake_requested_at < NOW() - INTERVAL '2 hours';
```

#### Review Error Logs
- [ ] Check browser console errors
- [ ] Review edge function logs
- [ ] Check MQTT service logs
- [ ] Monitor Supabase errors

### First Week

#### Performance Metrics
- [ ] Average command delivery time
- [ ] Command success rate
- [ ] Override clearing success rate
- [ ] User adoption rate

#### User Feedback
- [ ] Collect user feedback
- [ ] Document common issues
- [ ] Identify improvement opportunities
- [ ] Update documentation as needed

## Rollback Plan

### If Critical Issues Found

1. **Frontend Rollback**
   ```bash
   # Revert to previous deployment
   # Or disable manual wake button in UI
   ```

2. **Database Cleanup**
   ```sql
   -- Clear stuck overrides
   UPDATE devices
   SET manual_wake_override = false,
       manual_wake_requested_by = null,
       manual_wake_requested_at = null
   WHERE manual_wake_override = true;

   -- Cancel pending commands
   UPDATE device_commands
   SET status = 'expired'
   WHERE status = 'pending'
     AND command_type = 'set_wake_schedule';
   ```

3. **Notify Users**
   - Send announcement about temporary issues
   - Provide workaround if available
   - Set timeline for fix

## Success Criteria

### Technical
- [x] Code deployed without errors
- [ ] All tests passing
- [ ] Command delivery < 30 seconds
- [ ] Override clearing 100% success
- [ ] No performance degradation

### User Experience
- [ ] UI responsive and intuitive
- [ ] Clear feedback on actions
- [ ] Error messages helpful
- [ ] Feature easy to discover

### Business
- [ ] Reduces testing time
- [ ] Improves troubleshooting
- [ ] No disruption to regular operations
- [ ] Positive user feedback

## Documentation Checklist

- [x] MANUAL_WAKE_SYSTEM_COMPLETE.md (technical details)
- [x] MANUAL_WAKE_QUICK_START.md (user guide)
- [x] MANUAL_WAKE_IMPLEMENTATION_SUMMARY.md (implementation overview)
- [x] test-manual-wake-flow.mjs (test script)
- [ ] Update main README.md with manual wake feature
- [ ] Add to user training materials
- [ ] Create video tutorial (optional)

## Support Preparation

### Common Questions & Answers

**Q: How long does it take for the device to receive the command?**
A: Typically 5-30 seconds, depending on network conditions.

**Q: What if the device is offline?**
A: The command will be delivered when the device comes back online (within 24 hours).

**Q: Can I cancel a manual wake?**
A: Schedule a new manual wake to replace it, or wait for it to complete.

**Q: Will this affect my regular schedule?**
A: No, the device automatically resumes its regular schedule after the manual wake.

### Known Issues
- None at deployment time

### Escalation Path
1. Check documentation
2. Review monitoring queries
3. Check logs (browser, edge function, MQTT)
4. Contact development team

## Sign-off

- [ ] Development Team Lead
- [ ] QA Lead
- [ ] Product Owner
- [ ] DevOps Lead

## Deployment Date: _____________

## Deployed By: _____________

## Notes:
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
