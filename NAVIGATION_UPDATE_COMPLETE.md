# Navigation & Access to Snapshot Viewer - COMPLETE

**Date**: November 18, 2025
**Status**: ✅ **COMPLETE AND BUILDING**

---

## 🎯 What Was Added

Added two ways to access the Session Snapshot Viewer visualization:

### 1. Direct Button on Device Session Detail Page ⭐
### 2. Lab Navigation Link in Main Header

---

## 📍 Access Method 1: From Device Session Page

### Location
**Page**: `Device Session Details` (the page you showed in the screenshot)
**URL**: `/programs/{programId}/sites/{siteId}/sessions/{sessionId}`

### What Changed
Added a new **"View Snapshot Map"** button next to the Refresh button in the header.

```tsx
<Button
  variant="primary"
  onClick={() => navigate(`/lab/sessions/${sessionId}/snapshots`)}
  icon={<Map size={16} />}
>
  View Snapshot Map
</Button>
```

### User Flow
1. User is viewing a device session (like in your screenshot)
2. Sees new blue "View Snapshot Map" button in top-right
3. Clicks button
4. Navigates directly to 2D visualization for that session

**This is the PRIMARY way users should access the visualization** - contextual and intuitive!

---

## 📍 Access Method 2: Lab Navigation Link

### Location
**Main navigation bar** (green header at top)

### What Changed
Added new **"Lab"** menu item with flask icon (🧪) for super admins only.

```tsx
{isSuperAdmin && (
  <Link to="/lab/ingest-feed">
    <FlaskConical size={18} />
    <span>Lab</span>
  </Link>
)}
```

### Who Can See It
- ✅ **Super Admins only** (has `isSuperAdmin` check)
- ❌ Regular users won't see it
- ❌ Company admins won't see it

### What It Does
- Clicking "Lab" goes to `/lab/ingest-feed`
- This is the live ingestion feed page that already existed
- From there, users can navigate to other lab tools

---

## 🗺️ New Routes Added

### 1. Session Snapshot Viewer (NEW)
```
/lab/sessions/:sessionId/snapshots
```
**Component**: `SessionSnapshotViewer.tsx`
**Purpose**: D3.js spatial visualization with timeline

### 2. Ingest Feed (EXISTING, NOW ROUTED)
```
/lab/ingest-feed
```
**Component**: `IngestFeed.tsx`
**Purpose**: Live device data ingestion monitoring

### 3. Site Sessions (EXISTING, NOW ROUTED)
```
/lab/site-sessions
```
**Component**: `SiteSessions.tsx`
**Purpose**: Session management and monitoring

---

## 🎨 Visual Changes

### On Device Session Detail Page
**Before**:
```
[Back]  Device Session Details                    [Refresh]
```

**After**:
```
[Back]  Device Session Details    [View Snapshot Map] [Refresh]
```

### In Main Navigation (Super Admin Only)
**Before**:
```
Home | Sessions | Company | Devices | Profile
```

**After** (Super Admin):
```
Home | Sessions | Company | Devices | Lab | Profile
```

---

## 🧪 How to Test

### Test 1: Access from Session Page (PRIMARY)
1. Navigate to a device session
   - Go to: `/programs/{programId}/sites/{siteId}/sessions/{sessionId}`
   - Use the breadcrumb or existing navigation
2. Look for blue "View Snapshot Map" button in header
3. Click it
4. Should navigate to `/lab/sessions/{sessionId}/snapshots`
5. See 2D site map with devices

### Test 2: Access from Lab Menu (Super Admin Only)
1. Log in as super admin
2. Look at top navigation bar
3. Should see new "Lab" link with flask icon
4. Click "Lab"
5. Goes to Ingest Feed page
6. Can manually navigate to `/lab/site-sessions` from URL

### Test 3: Mobile Menu
Mobile users should also see:
- "View Snapshot Map" button (smaller, stacked)
- "Lab" link in hamburger menu (super admin only)

---

## 📁 Files Modified

### Modified (3 files)
```
src/pages/SiteDeviceSessionDetailPage.tsx
  - Added Map icon import
  - Added "View Snapshot Map" button

src/components/layouts/AppLayout.tsx
  - Added FlaskConical icon import
  - Added Lab navigation link (super admin only)

src/App.tsx
  - Added IngestFeed and SiteSessions lazy imports
  - Added routes for /lab/ingest-feed and /lab/site-sessions
```

---

## 🎯 Recommended User Journey

### For Regular Users (Field Staff, Observers)
1. Open app on tablet/phone
2. Navigate to Programs → Sites → Sessions
3. Select a session
4. See session details (your screenshot)
5. Click "View Snapshot Map" button
6. View 2D visualization
7. Use timeline to scrub through wakes
8. Click devices to see details

### For Super Admins (Lab/Testing)
1. Click "Lab" in main nav
2. See ingest feed (live device data)
3. Manually navigate to other lab tools:
   - `/lab/site-sessions` - session browser
   - `/lab/sessions/{id}/snapshots` - specific visualization
4. Use for debugging and monitoring

---

## 🔧 Configuration Notes

### Who Can Access What

| Route | Visible To | Auth Check |
|-------|-----------|------------|
| `/lab/sessions/:id/snapshots` | All authenticated users | `ProtectedRoute` |
| `/lab/ingest-feed` | All authenticated users | `ProtectedRoute` |
| `/lab/site-sessions` | All authenticated users | `ProtectedRoute` |
| Lab nav link | Super admins only | `isSuperAdmin` |
| "View Snapshot Map" button | All users | None (always visible) |

**Note**: The snapshot viewer is accessible to all authenticated users via the button, but only super admins see the "Lab" navigation link. This is intentional - regular users access visualizations contextually (from session page), while admins have direct access to all lab tools.

---

## ✅ Build Status

```bash
npm run build
✓ built in 12.64s
```

No errors! All TypeScript compiles successfully.

---

## 🚀 Next Steps

### Immediate
1. **Test with real session** - Use session_id from your screenshot
2. **Verify button visibility** - Check mobile responsive
3. **Add breadcrumb** - Consider adding "Lab" to breadcrumb trail

### Soon
1. **Add submenu to Lab** - Dropdown with:
   - Ingest Feed
   - Site Sessions
   - Device Monitoring
2. **Add "Lab" landing page** - Overview of all lab tools
3. **Add navigation within lab pages** - Tabs or sidebar

### Future
1. **Role-based lab access** - Fine-grained permissions
2. **Lab settings page** - Configure lab tools
3. **Lab analytics dashboard** - Aggregate metrics

---

## 📊 Summary

**We added two access points**:
1. ✅ **Contextual button** on session detail page (PRIMARY - for all users)
2. ✅ **Lab navigation link** in header (SECONDARY - for super admins)

**All existing lab pages now have routes**:
- ✅ Snapshot Viewer (NEW visualization)
- ✅ Ingest Feed (existing, now accessible)
- ✅ Site Sessions (existing, now accessible)

**Build is clean**:
- ✅ No TypeScript errors
- ✅ All imports resolved
- ✅ Routes registered correctly

**Ready to test with real data!** 🎉

---

## 🎓 User Education Notes

When rolling this out, tell users:

> "Look for the blue 'View Snapshot Map' button on any device session page.
> Click it to see a 2D visualization of your site with device positions and MGI levels.
> Use the timeline slider to watch how conditions change over time."

Keep it simple - no mention of "lab" or technical terms for regular users. They just click the button and see the map! 🗺️
