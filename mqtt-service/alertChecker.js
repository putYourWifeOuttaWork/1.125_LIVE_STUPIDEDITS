export async function checkTelemetryAlerts(supabase, deviceId, temperatureF, humidity, capturedAt) {
  if (!deviceId) return;

  const timestamp = capturedAt || new Date().toISOString();

  const checks = [
    {
      name: 'check_absolute_thresholds',
      params: {
        p_device_id: deviceId,
        p_temperature: temperatureF ?? null,
        p_humidity: humidity ?? null,
        p_mgi: null,
        p_measurement_timestamp: timestamp,
      },
    },
  ];

  if (temperatureF != null && humidity != null) {
    checks.push({
      name: 'check_combination_zones',
      params: {
        p_device_id: deviceId,
        p_temperature: temperatureF,
        p_humidity: humidity,
        p_measurement_timestamp: timestamp,
      },
    });
  }

  checks.push({
    name: 'check_intra_session_shifts',
    params: {
      p_device_id: deviceId,
      p_temperature: temperatureF ?? null,
      p_humidity: humidity ?? null,
      p_measurement_timestamp: timestamp,
    },
  });

  let totalAlerts = 0;

  for (const check of checks) {
    try {
      const { data, error } = await supabase.rpc(check.name, check.params);
      if (error) {
        console.error(`[ALERTS] ${check.name} error:`, error.message);
        continue;
      }
      const alerts = Array.isArray(data) ? data : (data ? JSON.parse(data) : []);
      if (alerts.length > 0) {
        totalAlerts += alerts.length;
        console.log(`[ALERTS] ${check.name}: ${alerts.length} alert(s) triggered`);
        for (const a of alerts) {
          console.log(`  - ${a.type} (alert_id: ${a.alert_id})`);
        }
      }
    } catch (err) {
      console.error(`[ALERTS] ${check.name} exception:`, err.message);
    }
  }

  if (totalAlerts > 0) {
    console.log(`[ALERTS] Total alerts triggered for device ${deviceId}: ${totalAlerts}`);
  }
}

export async function checkMgiAlerts(supabase, deviceId, mgiScore, scoredAt) {
  if (!deviceId || mgiScore == null) return;

  const timestamp = scoredAt || new Date().toISOString();

  const checks = [
    {
      name: 'check_absolute_thresholds',
      params: {
        p_device_id: deviceId,
        p_temperature: null,
        p_humidity: null,
        p_mgi: mgiScore,
        p_measurement_timestamp: timestamp,
      },
    },
    {
      name: 'check_mgi_velocity',
      params: {
        p_device_id: deviceId,
        p_current_mgi: mgiScore,
        p_measurement_timestamp: timestamp,
      },
    },
    {
      name: 'check_mgi_program_speed',
      params: {
        p_device_id: deviceId,
        p_current_mgi: mgiScore,
        p_measurement_timestamp: timestamp,
      },
    },
  ];

  let totalAlerts = 0;

  for (const check of checks) {
    try {
      const { data, error } = await supabase.rpc(check.name, check.params);
      if (error) {
        console.error(`[ALERTS] ${check.name} error:`, error.message);
        continue;
      }
      const alerts = Array.isArray(data) ? data : (data ? JSON.parse(data) : []);
      if (alerts.length > 0) {
        totalAlerts += alerts.length;
        console.log(`[ALERTS] ${check.name}: ${alerts.length} MGI alert(s) triggered`);
        for (const a of alerts) {
          console.log(`  - ${a.type} (alert_id: ${a.alert_id})`);
        }
      }
    } catch (err) {
      console.error(`[ALERTS] ${check.name} exception:`, err.message);
    }
  }

  if (totalAlerts > 0) {
    console.log(`[ALERTS] Total MGI alerts triggered for device ${deviceId}: ${totalAlerts}`);
  }
}
