# Temperature Units Documentation

## CRITICAL: ALL TEMPERATURES STORED IN FAHRENHEIT

This system **exclusively stores Fahrenheit (°F)** for all temperature measurements throughout the database and application. However, **devices send Celsius (°C)** which is converted at ingestion.

## Temperature Data Flow

1. **Device Layer** (ESP32-CAM Firmware)
   - BME680 sensor readings are in **Celsius (°C)**
   - MQTT payloads contain `temperature` field in **°C**
   - Device firmware sends natural Celsius readings from sensor

2. **MQTT Handler** (Edge Function)
   - `supabase/functions/mqtt_device_handler/ingest.ts`
   - Receives temperature values in **Celsius (°C)**
   - **Converts to Fahrenheit** using formula: `°F = (°C × 1.8) + 32`
   - Stores converted values in database as **Fahrenheit**
   - Function: `celsiusToFahrenheit(payload.temperature)`

3. **Database Storage**
   - `device_telemetry.temperature` → **Fahrenheit (°F)** (converted at ingestion)
   - `device_wake_payloads.temperature` → **Fahrenheit (°F)** (converted at ingestion)
   - `device_images.metadata.temperature` → **Fahrenheit (°F)** (if applicable)
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
   - All comparisons happen in Fahrenheit (post-conversion)

6. **UI Display**
   - All temperature displays show **°F** suffix
   - No conversion necessary - displayed as stored from database
   - Frontend receives Fahrenheit values

## Conversion Details

### Formula
```
Fahrenheit = (Celsius × 1.8) + 32
```

### Examples
| Celsius | Fahrenheit |
|---------|------------|
| -40°C   | -40°F      |
| -5°C    | 23°F       |
| 0°C     | 32°F       |
| 18.9°C  | 66°F       |
| 20°C    | 68°F       |
| 25°C    | 77°F       |
| 30°C    | 86°F       |
| 85°C    | 185°F      |

### Implementation
The conversion function in `ingest.ts`:
```typescript
function celsiusToFahrenheit(celsius: number | null | undefined): number | null {
  if (celsius === null || celsius === undefined) return null;

  // Validate input range (-40°C to 85°C is typical sensor range)
  if (celsius < -40 || celsius > 85) {
    console.warn(`[Temperature] Out of range Celsius value: ${celsius}°C`);
  }

  const fahrenheit = (celsius * 1.8) + 32;

  // Round to 2 decimal places
  return Math.round(fahrenheit * 100) / 100;
}
```

## Why This Architecture?

**Reasoning**:
1. **Devices naturally output Celsius** - BME680 sensor provides Celsius readings
2. **US-based users prefer Fahrenheit** - Display and alert thresholds more intuitive in °F
3. **Convert once at ingestion** - Single conversion point, all downstream uses Fahrenheit
4. **Consistent storage format** - Database exclusively stores Fahrenheit for consistency

**Previous Issue**:
- Initial documentation incorrectly stated devices sent Fahrenheit
- Caused confusion where device showing 18.9°C was interpreted as 18.9°F
- Result: Display showed "18.9°F" but alerts didn't fire properly

**Current Resolution**:
- Devices send Celsius (18.9°C)
- System converts to Fahrenheit (66.0°F)
- Database stores Fahrenheit (66.0)
- Display shows "66.0°F"
- Alerts correctly evaluate against Fahrenheit thresholds

## Validation Rules

### Input Validation (Celsius from Device)
```typescript
// Typical BME680 sensor range
if (celsius < -40 || celsius > 85) {
  console.warn(`Out of range Celsius value: ${celsius}°C`);
}
```

### Database Constraints (Fahrenheit Stored)
```sql
-- Reasonable Fahrenheit temperature range after conversion
CHECK (temperature IS NULL OR (temperature BETWEEN -40 AND 150))
```

### Alert Thresholds (Fahrenheit)
- Minimum: -40°F (extreme cold)
- Maximum: 150°F (extreme heat)
- These bounds ensure data integrity and catch sensor errors

## Migration History

- **20251107000002**: Created `device_telemetry` table (initially incorrectly documented as °C)
- **20260105000000**: Fixed documentation to clarify ALL temps are °F, added CHECK constraints
- **20260105000002**: Added Celsius → Fahrenheit conversion at MQTT ingestion layer

## Developer Guidelines

When working with temperature data:

1. **Device Layer**: Devices send Celsius - do NOT change firmware
2. **Ingestion Layer**: Always use `celsiusToFahrenheit()` helper when storing temperatures
3. **Database Layer**: All stored temperatures are Fahrenheit
4. **API Layer**: Return temperatures as-stored (Fahrenheit) with °F suffix
5. **UI Layer**: Display temperatures with °F suffix, no conversion needed
6. **Alert Logic**: All threshold comparisons use Fahrenheit values

### Code Examples

**CORRECT - Ingesting temperature**:
```typescript
temperature: celsiusToFahrenheit(payload.temperature)  // Convert Celsius → Fahrenheit
```

**INCORRECT - No conversion**:
```typescript
temperature: payload.temperature  // ❌ This stores Celsius, breaks alerts!
```

**CORRECT - Displaying temperature**:
```tsx
<span>{temperature.toFixed(1)}°F</span>
```

## Testing Reference

### Device Test Values (Celsius)
When simulating device messages:
- **-5°C**: Freezer temperature → converts to 23°F (should trigger alert < 25°F)
- **18.9°C**: Actual freezer test → converts to 66.0°F (no alert, correct)
- **20°C**: Room temperature → converts to 68°F
- **30°C**: Warm day → converts to 86°F

### Expected Database Values (Fahrenheit)
After conversion and storage:
- **-40°F**: Extreme cold (sensor lower limit)
- **0°F**: Very cold
- **23°F**: Freezer (-5°C), should trigger critical alert
- **32°F**: Freezing point of water (0°C)
- **66°F**: Room temperature (18.9°C from actual test)
- **70°F**: Comfortable room temperature
- **90°F**: Warm day (triggers warning)
- **100°F**: Hot day (triggers critical alert)
- **150°F**: Extreme heat (sensor upper limit)

### Alert Testing Scenarios
| Device Sends | Converts To | Expected Alert |
|--------------|-------------|----------------|
| -10°C        | 14°F        | Critical (< 25°F) |
| -5°C         | 23°F        | Critical (< 25°F) |
| 0°C          | 32°F        | Warning (= 32°F) |
| 18.9°C       | 66°F        | None (normal) |
| 20°C         | 68°F        | None (normal) |
| 32°C         | 90°F        | Warning (= 90°F) |
| 38°C         | 100°F       | Critical (= 100°F) |

## Troubleshooting

### Issue: Alerts not firing for cold temperatures
**Cause**: Conversion not applied - Celsius stored as Fahrenheit
**Fix**: Verify `celsiusToFahrenheit()` is called in all 4 ingestion points

### Issue: Temperature display shows unexpected values
**Cause**: Display might be showing unconverted Celsius
**Fix**: Check database has Fahrenheit values, verify UI is showing as-stored

### Issue: Out-of-range database values
**Cause**: Celsius values stored directly without conversion
**Fix**: Apply conversion, consider data migration for historical records

## Contact

If you encounter temperature-related issues:
1. Check this document first
2. Verify device firmware is sending Celsius (18-25°C is typical room temp)
3. Verify MQTT handler is applying `celsiusToFahrenheit()` conversion
4. Check database values are in reasonable Fahrenheit range (60-80°F is typical room temp)
5. Verify alert thresholds are configured in Fahrenheit
