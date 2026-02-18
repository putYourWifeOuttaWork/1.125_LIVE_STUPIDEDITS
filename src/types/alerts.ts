export interface DeviceAlert {
  alert_id: string;
  device_id: string;
  alert_type: string;
  alert_category: 'absolute' | 'shift' | 'velocity' | 'speed' | 'combination' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  actual_value: number | null;
  threshold_value: number | null;
  threshold_context: any;
  measurement_timestamp: string;
  triggered_at: string;
  resolved_at: string | null;

  device_coords: string | null;
  zone_label: string | null;
  site_id: string | null;
  site_name: string | null;
  program_id: string | null;
  program_name: string | null;
  company_id: string | null;
  company_name: string | null;
  metadata: any;

  session_id: string | null;
  snapshot_id: string | null;
  wake_number: number | null;
}
