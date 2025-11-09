# Infinite Loop Fix

**Date:** 2025-11-09
**Issue:** App was reloading infinitely, preventing users from accessing the application

---

## Problem

Console errors showed:
- "User has no company assignment" repeated continuously
- "Auth error handler registered, total handlers: 13" (incrementing)
- ProtectedRoute initializing company context repeatedly
- App restarting and loading recursively

---

## Root Cause

In `src/App.tsx` line 121, there was a force reload on visibility change:

```javascript
window.location.reload(true);
```

This created an infinite loop:
1. App loads
2. Browser window gains focus (visibility change event)
3. App force reloads
4. Browser window gains focus again (from the reload)
5. App force reloads again
6. **Loop continues forever**

---

## Solution

Removed the force reload from the visibility change handler in `src/App.tsx`:

**Before:**
```javascript
const handleVisibilityChange = async () => {
  if (document.visibilityState === 'visible' && user) {
    console.log('App has come back into focus, checking connection state');

    // *** KEY CHANGE: Force a hard reload immediately when the app comes back into focus ***
    window.location.reload(true);

    // The rest of this function will never execute because of the reload
```

**After:**
```javascript
const handleVisibilityChange = async () => {
  if (document.visibilityState === 'visible' && user) {
    console.log('App has come back into focus, checking connection state');

    // NOTE: Removed force reload as it causes infinite loop
    // The rest of this function handles reconnection gracefully
```

---

## Impact

- ✅ App now loads normally without infinite loop
- ✅ ProtectedRoute runs once per login (as intended)
- ✅ Active company context initialized correctly
- ✅ Users can access the application
- ✅ Visibility change still handles reconnection, just without the reload

---

## Why the Force Reload Was There

The force reload was likely added to handle stale connection states when the app came back into focus. However:

1. Modern browsers already handle this well
2. The existing code (lines 122-150) properly validates sessions and syncs data
3. The force reload was causing more harm than good

---

## Testing

After the fix:
1. User logs in successfully
2. ProtectedRoute initializes company context once
3. App loads and displays data
4. No infinite loop or repeated initialization
5. Build completes successfully

---

## Status

✅ **FIXED** - App now loads properly and multi-tenancy isolation is functional.
