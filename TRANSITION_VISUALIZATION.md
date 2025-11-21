# 🎬 How Smooth Transitions Work

## Timeline Navigation Flow

```
User clicks "Next" → Snapshot changes from #4 to #5

┌─────────────────────────────────────────────────────────┐
│  SNAPSHOT #4          TRANSITION          SNAPSHOT #5   │
│  ────────────────────────────────────────────────────   │
│                                                          │
│  Device DCKHED:                           Device DCKHED:│
│  • Temp: 27.5°C  ──→  ~~~~~~~~~~~  ──→   • Temp: 43.8°C│
│  • MGI: 0.22     ──→  ~~~~~~~~~~~  ──→   • MGI: 0.35   │
│  • Color: 🟢     ──→  ~~~~~~~~~~~  ──→   • Color: 🟠   │
│                                                          │
│  t=0ms              t=250ms            t=500ms          │
│  progress=0         progress=0.5       progress=1       │
└─────────────────────────────────────────────────────────┘
```

## Value Interpolation Example

**Temperature transition from 27.5°C to 43.8°C over 500ms:**

```
Frame 0   (0ms):   27.5°C  (0% progress)
Frame 5   (83ms):  28.2°C  (slow start - easing)
Frame 10  (166ms): 30.1°C  
Frame 15  (250ms): 35.6°C  (middle - fastest)
Frame 20  (333ms): 41.2°C  
Frame 25  (416ms): 43.1°C  (slow down - easing)
Frame 30  (500ms): 43.8°C  (100% progress)
```

## Color Transition

**MGI Score 0.22 → 0.35 (Green to Orange):**

```
0.22 → #10B981 (Green) ────┐
                            ├─ Interpolate RGB values
0.35 → #F59E0B (Orange) ───┘

Result: Smooth fade through intermediate colors
  #10B981 → #34B98B → #58B994 → ... → #F59E0B
```

## Canvas Redraw Cycle

```
┌──────────────────────────────────────────────────┐
│  1. User changes snapshot                        │
│     ↓                                            │
│  2. transitionProgress = 0                       │
│     ↓                                            │
│  3. Interval starts (60 FPS)                     │
│     ↓                                            │
│  4. Every 16.67ms:                               │
│     • Increment progress                         │
│     • displayDevices recalculates (lerp)         │
│     • Canvas redraws with new colors/zones       │
│     ↓                                            │
│  5. progress reaches 1.0                         │
│     ↓                                            │
│  6. Interval stops                               │
│     ↓                                            │
│  7. Final values locked in                       │
└──────────────────────────────────────────────────┘
```

## Easing Curve Visualization

```
  1.0 ┤                    ╭─────────────
      │                  ╱
      │                ╱
  0.5 ┤              ╱        <-- Ease-in-out
      │            ╱              (smooth acceleration)
      │          ╱
  0.0 ┼────────╯
      0ms    250ms    500ms
```

Compare to linear (no easing):

```
  1.0 ┤              ╱────────────
      │            ╱
      │          ╱
  0.5 ┤        ╱        <-- Linear (robotic feel)
      │      ╱
      │    ╱
  0.0 ┼──╯
      0ms    250ms    500ms
```

## Zone Color Interpolation

**Temperature Zone Example:**

```
Snapshot #4: Avg Temp = 28°C → Blue Zone
Snapshot #5: Avg Temp = 68°C → Orange Zone

During transition:
┌────────────────────────────────────────┐
│ Frame  | Temp  | Color      | Zone    │
├────────────────────────────────────────┤
│ 0      | 28°C  | #3B82F6    | 🔵🔵🔵 │
│ 5      | 32°C  | #4B8CF6    | 🔵🔵⚪ │
│ 10     | 38°C  | #6B9CF6    | 🔵⚪⚪ │
│ 15     | 48°C  | #FBAC56    | ⚪🟠🟠 │
│ 20     | 58°C  | #FB9C36    | 🟠🟠🟠 │
│ 25     | 64°C  | #FB8C26    | 🟠🟠🟠 │
│ 30     | 68°C  | #F59E0B    | 🟠🟠🟠 │
└────────────────────────────────────────┘
```

Perfect smooth gradient! No sudden pops or jumps.

---

## Key Advantages

✅ **Smooth** - No jarring jumps
✅ **Professional** - Polished feel
✅ **Informative** - Easy to see what's changing
✅ **Performant** - Only 30 redraws (60fps × 0.5s)
✅ **Flexible** - Easy to adjust speed
