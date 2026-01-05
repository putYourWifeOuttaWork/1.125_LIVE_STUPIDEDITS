# Temperature Units Documentation

## CRITICAL: ALL TEMPERATURES IN FAHRENHEIT

This system **exclusively uses Fahrenheit (°F)** for all temperature measurements throughout the entire stack.

## Temperature Data Flow

1. **Device Layer** (ESP32-CAM Firmware)
   - BME680 sensor readings are sent in **Fahrenheit (°F)**
   - MQTT payloads contain `temperature` field in **°F**

2. **MQTT Handler** (Edge Function)
   - `supabase/functions/mqtt_device_handler/ingest.ts`
   - Receives temperature values in **Fahrenheit**
   - Stores values **as-is** without conversion
   - All comments clarify: "Fahrenheit from device"

3. **Database Storage**
   - `device_telemetry.temperature` → **Fahrenheit (°F)**
   - `device_wake_payloads.temperature` → **Fahrenheit (°F)**
   - `device_images.metadata.temperature` → **Fahrenheit (°F)**
   - CHECK constraints enforce reasonable Fahrenheit range: **-40°F to 150°F**

4. **Alert Thresholds**
   - `device_alert_thresholds` table uses **Fahrenheit (°F)**
   - Default values:
     - `temp_min_critical`: 25°F (below freezing critical)
     - `temp_min_warning`: 32°F (freezing warning)
     - `temp_max_warning`: 90°F (high temp warning)
     - `temp_max_critical`: 100°F (high temp critical)

5. **Alert Detection**
   - `check_absolute_thresholds()` function compares temperature in **Fahrenheit**
   - Alert messages display temperature with **°F** suffix

6. **UI Display**
   - All temperature displays show **°F** suffix
   - No conversion necessary - displayed as stored

## Why This Matters

**ISSUE IDENTIFIED**: Initial schema documentation incorrectly stated temperatures were in Celsius (°C), causing confusion where:
- Device sent 18.9°F
- System stored it as 18.9
- Display correctly showed "18.9°F"
- BUT alert evaluation may have misinterpreted it as 18.9°C → 66°F
- Result: No alert fired even though 18.9°F < 25°F threshold

**RESOLUTION**: All documentation, comments, and constraints now explicitly state **Fahrenheit**.

## Validation Rules

### Database Constraints
```sql
-- Reasonable Fahrenheit temperature range
CHECK (temperature IS NULL OR (temperature BETWEEN -40 AND 150))
```

### Alert Thresholds
- Minimum: -40°F (extreme cold)
- Maximum: 150°F (extreme heat)
- These bounds ensure data integrity and catch sensor errors

## Migration History

- **20251107000002**: Created `device_telemetry` table (initially incorrectly documented as °C)
- **20260105000000**: Fixed documentation to clarify ALL temps are °F, added CHECK constraints

## Developer Guidelines

When working with temperature data:

1. **Never convert** temperature values - they're already in Fahrenheit
2. **Always add comments** noting "Fahrenheit" when inserting/reading temperature
3. **Use °F suffix** in all UI displays
4. **Test alerts** with realistic Fahrenheit values (32°F = freezing, 70°F = room temp)
5. **Validate input** - reject values outside -40°F to 150°F range

## Testing Reference

Common Fahrenheit temperatures for testing:
- **-40°F**: Extreme cold (sensor lower limit)
- **0°F**: Very cold
- **18.9°F**: Freezer temperature (example from actual test)
- **32°F**: Freezing point of water
- **70°F**: Room temperature
- **90°F**: Warm day
- **100°F**: Hot day (critical threshold)
- **150°F**: Extreme heat (sensor upper limit)

## Contact

If you encounter temperature-related issues:
1. Check this document first
2. Verify device firmware is sending Fahrenheit
3. Check database values are in reasonable Fahrenheit range
4. Verify alert thresholds are configured in Fahrenheit
