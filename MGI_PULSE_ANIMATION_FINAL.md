# MGI Always-On Pulse Animation - Complete

## Overview

The MGI pulse animation is now **always on** for all devices with velocity data. The pulse size and speed scale with velocity magnitude, creating an intuitive visual indicator of mold growth rate.

---

## Pulse Behavior

### Always Visible
- ✅ Pulse is **always on** (not just for high velocity)
- ✅ Color **matches the device node** color (MGI-based)
- ✅ Gradient transparency (fades from 60% opacity to 0%)
- ✅ Continuous loop animation

### Size Based on Velocity

**Small Pulse** (0-3% velocity)
- Expands to 2× base radius (20px)
- Duration: 3 seconds (slow)
- Use case: Minimal growth

**Medium Pulse** (4-7% velocity)
- Expands to 3× base radius (30px)
- Duration: 2.2 seconds
- Use case: Moderate growth

**Large Pulse** (8-12% velocity)
- Expands to 4× base radius (40px)
- Duration: 1.5 seconds (fast)
- Use case: Significant growth

**Very Large & Fast** (12%+ velocity)
- Expands to 5× base radius (50px)
- Duration: 1 second (very fast)
- Use case: Critical rapid growth

---

## Visual Specifications

### Animation Properties

```typescript
// Initial state
radius: 10px
opacity: 0.6 (60%)
stroke-width: 2px
color: matches device node color

// End state
radius: varies by velocity (20-50px)
opacity: 0 (fully transparent)
stroke-width: 1px
easing: d3.easeQuadOut

// Then loops back to initial state
```

### Color Gradient
The pulse uses the **same color** as the device node:
- Green nodes → Green pulse (healthy)
- Yellow nodes → Yellow pulse (warning)
- Orange nodes → Orange pulse (concerning)
- Red nodes → Red pulse (critical)

---

## Velocity Thresholds

```typescript
export const VELOCITY_THRESHOLDS = {
  normal: 3,        // 1-3% per session = small pulse
  elevated: 7,      // 4-7% per session = medium pulse
  high: 12,         // 8-12% per session = large pulse
  // 12%+ = very large and fast pulse
};
```

---

## Implementation

### Updated Functions

**`shouldShowVelocityPulse(velocity)`**
- Now returns `true` for **any velocity data** (even null shows minimal pulse)
- No longer requires velocity > 15%

**`getVelocityPulseRadius(velocity, baseRadius)`**
- Returns radius based on velocity magnitude
- 0-3%: 2× base (20px)
- 4-7%: 3× base (30px)
- 8-12%: 4× base (40px)
- 12%+: 5× base (50px)

**`getVelocityPulseDuration(velocity)` [NEW]**
- Returns animation duration in milliseconds
- 0-3%: 3000ms (slow)
- 4-7%: 2200ms
- 8-12%: 1500ms (fast)
- 12%+: 1000ms (very fast)

---

## Test Data

The test script now creates 4 devices with different velocity levels:

```bash
node test-mgi-visualization.mjs
```

**Creates:**
1. **Device 1**: MGI 25%, velocity 2% → Green node, small slow pulse
2. **Device 2**: MGI 45%, velocity 6% → Yellow node, medium pulse
3. **Device 3**: MGI 70%, velocity 10% → Orange node, large fast pulse
4. **Device 4**: MGI 88%, velocity 15% → Red node, very large ultra-fast pulse

---

## Visual Effect

### What You'll See:

**Low Velocity (Device 1)**
- Green dot with gentle, slow expanding circle
- Subtle "breathing" effect
- 3-second cycle

**Medium Velocity (Device 2)**
- Yellow dot with moderate pulse
- Noticeable expansion
- 2.2-second cycle

**High Velocity (Device 3)**
- Orange dot with large, fast pulse
- Clear visual alert
- 1.5-second cycle

**Critical Velocity (Device 4)**
- Red dot with huge, rapid pulse
- Demands immediate attention
- 1-second cycle (very fast!)

---

## Benefits

✅ **Always-on visibility** - No devices are invisible  
✅ **Proportional scaling** - Pulse size/speed matches severity  
✅ **Color consistency** - Pulse matches node for instant recognition  
✅ **Gradient transparency** - Beautiful fade-out effect  
✅ **Performance optimized** - Smooth D3 transitions  
✅ **Intuitive** - Faster pulse = more urgent attention needed  

---

## Code Example

```typescript
// In SiteMapViewer.tsx
const pulseRadius = getVelocityPulseRadius(device.mgi_velocity, 10);
const pulseDuration = getVelocityPulseDuration(device.mgi_velocity);
const deviceColor = getMGIColor(device.mgi_score);

// Always-on pulse with gradient transparency
const pulse = deviceGroup
  .append('circle')
  .attr('cx', cx)
  .attr('cy', cy)
  .attr('r', 10)
  .attr('fill', 'none')
  .attr('stroke', deviceColor)  // Matches node color!
  .attr('stroke-width', 2)
  .attr('opacity', 0.6);

function animatePulse() {
  pulse
    .transition()
    .duration(pulseDuration)  // Variable speed!
    .ease(d3.easeQuadOut)
    .attr('r', pulseRadius)   // Variable size!
    .attr('stroke-width', 1)
    .attr('opacity', 0)       // Fade to transparent
    .on('end', () => {
      pulse.attr('r', 10).attr('stroke-width', 2).attr('opacity', 0.6);
      animatePulse();  // Loop forever
    });
}
animatePulse();
```

---

## Files Updated

✅ **`src/utils/mgiUtils.ts`** - Updated thresholds and functions  
✅ **`src/components/lab/SiteMapViewer.tsx`** - Always-on pulse with variable speed  
✅ **`src/components/lab/MGILegend.tsx`** - Export new duration function  
✅ **`test-mgi-visualization.mjs`** - Creates 4 devices with varied velocities  

---

## Build Status

```
✓ built in 19.68s
✅ No errors
✅ Ready to deploy
```

---

## How to Test

1. **Apply migration** (if not already done):
   ```bash
   # In Supabase Dashboard SQL Editor
   # Run: fix-device-id-migration.sql
   ```

2. **Create test data**:
   ```bash
   node test-mgi-visualization.mjs
   ```

3. **View results**:
   - Refresh homepage
   - Select site
   - Choose "Mold Growth (MGI)" from Zones dropdown
   - Watch the pulses! 🎯

---

## Expected Results

You should see:
- All 4 devices with different colored nodes
- Each device pulsing at different rates
- Larger, faster pulses on high-velocity devices
- Smooth, continuous animations
- Colors matching between node and pulse

---

## Perfect for:

✅ **Real-time monitoring** - See growth rates at a glance  
✅ **Priority triaging** - Fast pulses = urgent attention needed  
✅ **Trend awareness** - Velocity more important than absolute MGI  
✅ **Beautiful UX** - Smooth, professional animations  

---

The pulse creates a "radar ping" effect that naturally draws your eye to the most actively growing areas!
