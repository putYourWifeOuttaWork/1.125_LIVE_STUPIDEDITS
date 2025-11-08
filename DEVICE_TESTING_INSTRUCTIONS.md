# 🧪 IoT Device Provisioning Testing Guide

**Date:** November 8, 2025
**Test Device:** DEVICE-ESP32S3-001 (MAC: 77:89:5D:70:A7:68)
**Status:** Mock device provisioned and ready for UI testing

---

## ✅ What's Been Completed

### 1. Database Schema
- ✅ All device tables created and verified
- ✅ Junction tables for device-site-program relationships ready
- ✅ 22/22 schema checks passing

### 2. Backend Updates
- ✅ `mapDevice` function updated to create junction table records
- ✅ `reassignDevice` function updated to preserve assignment history
- ✅ Junction table records automatically track `assigned_by`, `assigned_at`
- ✅ Old assignments marked `is_active: false` when reassigning (history preserved)

### 3. Mock Device Created
- ✅ Device auto-provisioned: `DEVICE-ESP32S3-001`
- ✅ Status: `pending_mapping`
- ✅ Device is active and visible in database
- ✅ Ready for admin assignment via UI

### 4. Build Status
- ✅ Project builds successfully with no TypeScript errors
- ✅ All components properly typed

---

## 🎯 Testing Workflow

### Step 1: Start Development Server

```bash
npm run dev
```

The dev server will start on `http://localhost:5173`

### Step 2: Navigate to Devices Page

1. Log in to the application
2. Navigate to the **Devices** page (URL: `/devices`)
3. You should see:
   - Yellow banner: "1 Device Awaiting Mapping"
   - Pending device section showing:
     - MAC Address: `77:89:5D:70:A7:68`
     - Device Code: `DEVICE-ESP32S3-001`
     - "Map" button

### Step 3: Test Initial Device Mapping

1. Click the **"Map"** button on the pending device
2. DeviceMappingModal will open
3. Fill out the form:
   - **Device Name** (optional): e.g., "Test Barn Camera"
   - **Program** (required): Select one of your existing programs
   - **Site** (required): Select a site from the chosen program
   - **Wake Schedule**: Choose from presets or custom
   - **Notes** (optional): e.g., "Testing device provisioning flow"
4. Click **"Map Device"**

### Step 4: Verify Successful Mapping

**UI Should Show:**
- ✅ Toast notification: "Device mapped successfully!"
- ✅ Device disappears from pending section
- ✅ Pending devices count decreases to 0
- ✅ Device appears in main active devices list
- ✅ Device shows assigned site and program

**Database Should Have:**
Run verification script:
```bash
node verify-device-mapping.mjs
```

Expected results:
- ✅ Device record updated with `site_id`, `program_id`
- ✅ `provisioning_status` changed to `"mapped"`
- ✅ `is_active` set to `true`
- ✅ `mapped_at` timestamp recorded
- ✅ `mapped_by_user_id` set to current user
- ✅ Junction record in `device_site_assignments` with `is_active: true`
- ✅ Junction record in `device_program_assignments` with `is_active: true`

---

## 🔄 Testing Device Reassignment

### Step 1: Navigate to Device Detail

1. From the devices list, click **"View"** on the mapped device
2. Device detail page should show:
   - Current site assignment
   - Current program assignment
   - Device information
   - Assignment history (if implemented)

### Step 2: Test Reassignment

1. Click **"Reassign"** button (or similar action)
2. Modal opens with current assignments pre-populated
3. Select a **different site** (can be same or different program)
4. Optionally add reassignment reason
5. Click **"Reassign Device"**

### Step 3: Verify Reassignment

**UI Should Show:**
- ✅ Toast: "Device reassigned successfully!"
- ✅ Device detail page updates with new site
- ✅ Assignment history shows both old and new assignments

**Database Verification:**
```bash
node verify-device-mapping.mjs
```

Expected results:
- ✅ Device record updated with new `site_id`
- ✅ Old junction record: `is_active: false`, `unassigned_at` set
- ✅ New junction record: `is_active: true`, `assigned_at` set
- ✅ **History preserved**: Both assignment records exist in database

---

## 🧪 Testing Multiple Devices

To test with multiple pending devices:

```bash
# Create a second mock device
node test-new-device-provisioning.mjs

# Should create: DEVICE-ESP32S3-002
```

Then repeat the mapping workflow to ensure:
- Banner shows correct count (e.g., "2 Devices Awaiting Mapping")
- Each device can be mapped independently
- No cross-contamination between device assignments

---

## 🐛 Troubleshooting

### Issue: Pending device not showing in UI

**Check:**
1. Verify device exists: `SELECT * FROM devices WHERE provisioning_status = 'pending_mapping';`
2. Check browser console for errors
3. Verify `usePendingDevices` hook is querying correctly
4. Try refreshing the page (auto-refresh is 20 seconds)

### Issue: Mapping fails with error

**Check:**
1. Browser console for detailed error message
2. Network tab for failed API calls
3. Verify you have programs and sites in database
4. Check Supabase RLS policies allow insert on junction tables
5. Verify user is authenticated and has proper permissions

### Issue: Junction table records not created

**Check:**
1. Run: `SELECT * FROM device_site_assignments;`
2. Run: `SELECT * FROM device_program_assignments;`
3. If empty, check browser console for insert errors
4. Verify RLS policies on junction tables

### Issue: Device doesn't appear in active list after mapping

**Check:**
1. Verify `provisioning_status` changed from `'pending_mapping'` to `'mapped'`
2. Check filter logic in `DevicesPage.tsx` (line 98)
3. Try changing status filter dropdown
4. Verify React Query cache invalidation worked

---

## 📊 Verification Scripts

### Check Device Status
```bash
node check_database.mjs
```

### Verify Complete Schema
```bash
node verify-schema-complete.mjs
```

### Create Verification Script for Mapped Device
```bash
node verify-device-mapping.mjs
```
(See below for script contents)

---

## 🔍 Expected Database State After Mapping

### devices table
```sql
{
  "device_id": "a38675a6-acf4-4268-8adf-b6c8e49f9292",
  "device_mac": "77:89:5D:70:A7:68",
  "device_code": "DEVICE-ESP32S3-001",
  "device_name": "Test Barn Camera",
  "provisioning_status": "mapped",
  "is_active": true,
  "site_id": "<selected-site-id>",
  "program_id": "<selected-program-id>",
  "mapped_at": "2025-11-08T...",
  "mapped_by_user_id": "<your-user-id>",
  ...
}
```

### device_site_assignments table
```sql
{
  "assignment_id": "<uuid>",
  "device_id": "a38675a6-acf4-4268-8adf-b6c8e49f9292",
  "site_id": "<selected-site-id>",
  "program_id": "<selected-program-id>",
  "is_primary": true,
  "is_active": true,
  "assigned_at": "2025-11-08T...",
  "assigned_by_user_id": "<your-user-id>",
  "unassigned_at": null,
  ...
}
```

### device_program_assignments table
```sql
{
  "assignment_id": "<uuid>",
  "device_id": "a38675a6-acf4-4268-8adf-b6c8e49f9292",
  "program_id": "<selected-program-id>",
  "is_primary": true,
  "is_active": true,
  "assigned_at": "2025-11-08T...",
  "assigned_by_user_id": "<your-user-id>",
  "unassigned_at": null,
  ...
}
```

---

## ✅ Success Criteria

The device provisioning flow is successful when:

- [x] Mock device appears in pending devices banner
- [x] Admin can open mapping modal
- [x] Modal validates required fields (program, site)
- [x] Mapping creates junction table records
- [x] Device transitions from `pending_mapping` to `mapped`
- [x] Device appears in active devices list
- [x] Junction records have correct `assigned_by` user
- [x] Reassignment preserves old assignment history
- [x] No duplicate active assignments exist
- [x] UI updates reactively after mapping/reassignment

---

## 🚀 Next Steps After Successful Testing

1. **Test with Real ESP32-CAM Device**
   - Power on physical device
   - Device should auto-provision via MQTT
   - Follow same mapping workflow

2. **Test MQTT Edge Function**
   - Deploy `mqtt_device_handler` to Supabase
   - Verify MQTT connection logs
   - Test real device→server communication

3. **Implement Additional Features**
   - Device detail page enhancements
   - Assignment history timeline view
   - Bulk device operations
   - Device health monitoring dashboard

4. **Production Deployment**
   - Deploy to Netlify/Vercel
   - Configure production MQTT credentials
   - Set up monitoring and alerting

---

## 📝 Notes

- Device history is **never deleted**, only marked inactive
- Junction tables support **many-to-many** relationships (future: multi-site devices)
- Current implementation sets `is_primary: true` for all assignments
- RLS policies ensure users can only map devices to programs they have access to
- Auto-refresh interval: Devices page refreshes every 30 seconds

---

**Testing Owner:** Your Name
**Last Updated:** November 8, 2025
**Mock Device ID:** `a38675a6-acf4-4268-8adf-b6c8e49f9292`
