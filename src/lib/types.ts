export type Database = {
  public: {
    Tables: {
      pilot_programs: {
        Row: {
          program_id: string;
          name: string;
          company_id: string;
          start_date: string;
          end_date: string;
          status: string;
          created_at: string;
          updated_at: string;
          [key: string]: any;
        };
      };
      sites: {
        Row: {
          site_id: string;
          name: string;
          type: string;
          program_id: string;
          created_at: string;
          updated_at: string;
          [key: string]: any;
        };
      };
      submissions: {
        Row: {
          submission_id: string;
          site_id: string;
          created_at: string;
          updated_at: string;
          [key: string]: any;
        };
      };
      petri_observations: {
        Row: {
          observation_id: string;
          submission_id: string;
          petri_code: string;
          created_at: string;
          [key: string]: any;
        };
      };
      gasifier_observations: {
        Row: {
          observation_id: string;
          submission_id: string;
          gasifier_code: string;
          created_at: string;
          [key: string]: any;
        };
      };
      pilot_program_history_staging: {
        Row: {
          history_id: string;
          program_id: string;
          update_type: string;
          created_at: string;
          [key: string]: any;
        };
      };
    };
  };
};

export type UserRole = 'observer' | 'analyst' | 'maintenance' | 'sysAdmin';
export type ExportRights = 'None' | 'history' | 'history_and_analytics' | 'all';

export type User = {
  id: string;
  email: string;
  full_name?: string;
  company?: string;
  company_id?: string;
  avatar_url?: string;
  is_active?: boolean;
  is_company_admin?: boolean;
  is_super_admin?: boolean;
  user_role?: UserRole;
  export_rights?: ExportRights;
  created_at?: string;
  updated_at?: string;
  user_metadata?: {
    company?: string;
    full_name?: string;
    is_active?: boolean;
  };
};

export type ProgramEffectiveStatus = 'active' | 'expired' | 'scheduled';

export type PilotProgram = Database['public']['Tables']['pilot_programs']['Row'] & {
  phases?: ProgramPhase[];
  days_count_this_program?: number;
  day_x_of_program?: number;
  phase_progress?: number;
  effective_status?: ProgramEffectiveStatus;
  has_active_devices?: boolean;
};

export type ProgramPhase = {
  phase_number: number;
  phase_type: 'control' | 'experimental';
  label: string;
  start_date: string;
  end_date: string;
  notes?: string;
};

export type Site = Database['public']['Tables']['sites']['Row'] & {
  site_code?: string;
  interior_working_surface_types?: InteriorWorkingSurfaceType[];
  microbial_risk_zone?: MicrobialRiskZone;
  quantity_deadzones?: number;
  ventilation_strategy?: VentilationStrategy;
  length?: number;
  width?: number;
  height?: number;
  min_efficacious_gasifier_density_sqft_per_bag?: number;
  recommended_placement_density_bags?: number;
  has_dead_zones?: boolean;
  num_regularly_opened_ports?: number;
  ventilation_strategy?: VentilationStrategy;
  device_count?: number;
};
export type Submission = Database['public']['Tables']['submissions']['Row'] & {
  global_submission_id?: number;
  created_by_device_id?: string | null;
  is_device_generated?: boolean;
};
export type PetriObservation = Database['public']['Tables']['petri_observations']['Row'] & {
  outdoor_temperature?: number;
  outdoor_humidity?: number;
  // Split image properties
  is_image_split?: boolean;
  is_split_source?: boolean;
  split_processed?: boolean;
  main_petri_id?: string;
  phase_observation_settings?: {
    split_pair_id?: string;
    position?: 'main' | 'left' | 'right';
    base_petri_code?: string;
    left_code?: string;
    right_code?: string;
  };
  is_missed_observation?: boolean;
  // Program phase day fields
  daysInThisProgramPhase?: number;
  todays_day_of_phase?: number;
  // Device-generated fields
  is_device_generated?: boolean;
  device_capture_metadata?: DeviceCaptureMetadata;
};
export type GasifierObservation = Database['public']['Tables']['gasifier_observations']['Row'] & {
  outdoor_temperature?: number;
  outdoor_humidity?: number;
  footage_from_origin_x?: number;
  footage_from_origin_y?: number;
  // Program phase day fields
  daysInThisProgramPhase?: number;
  todays_day_of_phase?: number;
  // Device-generated fields
  is_device_generated?: boolean;
  device_capture_metadata?: DeviceCaptureMetadata;
};
export type ProgramAccessRole = 'Admin' | 'Edit' | 'Respond' | 'ReadOnly';
export type HistoryEventType = Database['public']['Tables']['pilot_program_history_staging']['Row']['update_type'];
export type AuditLogEntry = Database['public']['Tables']['pilot_program_history_staging']['Row'];

// Types for site template data
export interface SubmissionDefaults {
  temperature: number;
  humidity: number;
  airflow: 'Open' | 'Closed'; // This remains as Open/Closed for submissions
  odor_distance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft';
  weather: 'Clear' | 'Cloudy' | 'Rain';
  notes?: string | null;
  indoor_temperature?: number | null;
  indoor_humidity_new?: number | null;
}

export interface PetriDefaults {
  petri_code: string;
  plant_type: 'Other Fresh Perishable'; // Hardcoded to 'Other Fresh Perishable'
  fungicide_used: 'Yes' | 'No';
  surrounding_water_schedule: 'Daily' | 'Every Other Day' | 'Every Third Day' | 'Twice Daily' | 'Thrice Daily';
  placement?: PetriPlacement;
  placement_dynamics?: PetriPlacementDynamics;
  notes?: string | null;
  // Add new fields for image splitting support
  is_split_image_template?: boolean;
  split_codes?: string[]; // Array of codes for split images (e.g. ["P1_Left", "P1_Right"])
}

// New types for gasifier functionality
export type ChemicalType = 'Geraniol' | 'CLO2' | 'Acetic Acid' | 'Citronella Blend' | 'Essential Oils Blend' | '1-MCP' | 'Other';
export type PlacementHeight = 'High' | 'Medium' | 'Low';
export type DirectionalPlacement = 'Front-Center' | 'Front-Left' | 'Front-Right' | 'Center-Center' | 'Center-Left' | 'Center-Right' | 'Back-Center' | 'Back-Left' | 'Back-Right';
export type PlacementStrategy = 'Perimeter Coverage' | 'Centralized Coverage' | 'Centralized and Perimeter Coverage' | 'Targeted Coverage' | 'Spot Placement Coverage';
export type PetriPlacement = DirectionalPlacement;
export type PetriPlacementDynamics = 'Near Port' | 'Near Door' | 'Near Ventillation Out' | 'Near Airflow In';

export interface GasifierDefaults {
  gasifier_code: string;
  chemical_type: ChemicalType;
  placement_height: PlacementHeight;
  directional_placement: DirectionalPlacement;
  placement_strategy: PlacementStrategy;
  notes?: string | null;
  // Add coordinates for mapping
  footage_from_origin_x?: number;
  footage_from_origin_y?: number;
}

// New types for site properties
export type PrimaryFunction = 'Growing' | 'Drying' | 'Packaging' | 'Storage' | 'Research' | 'Retail';
export type ConstructionMaterial = 'Glass' | 'Polycarbonate' | 'Metal' | 'Concrete' | 'Wood';
export type InsulationType = 'None' | 'Basic' | 'Moderate' | 'High';
export type HVACSystemType = 'Centralized' | 'Distributed' | 'Evaporative Cooling' | 'None';
export type IrrigationSystemType = 'Drip' | 'Sprinkler' | 'Hydroponic' | 'Manual';
export type LightingSystem = 'Natural Light Only' | 'LED' | 'HPS' | 'Fluorescent';
export type VentPlacement = 'Ceiling-Center' | 'Ceiling-Perimeter' | 'Upper-Walls' | 'Lower-Walls' | 'Floor-Level';
export type InteriorWorkingSurfaceType = 'Stainless Steel' | 'Unfinished Concrete' | 'Wood' | 'Plastic' | 'Granite' | 'Other Non-Absorbative';
export type MicrobialRiskZone = 'Low' | 'Medium' | 'High';
export type VentilationStrategy = 'Cross-Ventilation' | 'Positive Pressure' | 'Negative Pressure' | 'Neutral Sealed';

// New types for site environmental fields
export type InteriorWorkingSurfaceType = 'Stainless Steel' | 'Unfinished Concrete' | 'Wood' | 'Plastic' | 'Granite' | 'Other Non-Absorbative';
export type MicrobialRiskZone = 'Low' | 'Medium' | 'High';
export type VentilationStrategy = 'Cross-Ventilation' | 'Positive Pressure' | 'Negative Pressure' | 'Neutral Sealed';

// Interface for site properties in forms
export interface SitePropertiesForm {
  squareFootage?: number | null;
  cubicFootage?: number | null;
  numVents?: number | null;
  ventPlacements?: string[];
  primaryFunction?: PrimaryFunction;
  constructionMaterial?: ConstructionMaterial;
  insulationType?: InsulationType;
  hvacSystemPresent?: boolean;
  hvacSystemType?: HVACSystemType;
  irrigationSystemType?: IrrigationSystemType;
  lightingSystem?: LightingSystem;
  
  // New dimension fields
  length?: number | null;
  width?: number | null;
  height?: number | null;
  
  // New gasifier density fields
  minEfficaciousGasifierDensity?: number | null;
  recommendedPlacementDensity?: number | null;
  
  // New airflow dynamics fields
  hasDeadZones?: boolean | null;
  numRegularlyOpenedPorts?: number | null;
  
  // New environmental fields
  interiorWorkingSurfaceTypes?: string[];
  microbialRiskZone?: MicrobialRiskZone;
  quantityDeadzones?: number | null;
  ventilationStrategy?: VentilationStrategy;
}

// Split petri image record
export interface SplitPetriImage {
  id: string;
  original_image_url: string;
  main_petri_observation_id: string;
  archived_at: string;
  processed_by_user_id?: string;
}

// Analytics response types
export interface EnvironmentalTrend {
  interval_start: string;
  avg_temperature: number;
  avg_humidity: number;
  avg_indoor_temperature: number;
  avg_indoor_humidity: number;
  submission_count: number;
}

export interface WeatherConditionCounts {
  interval_start: string;
  clear_count: number;
  cloudy_count: number;
  rain_count: number;
  total_count: number;
}

// Granularity type for analytics
export type AnalyticsGranularity = '12hour' | 'day' | 'week';

// Outdoor environmental data types
export interface OutdoorEnvironmentalData {
  outdoor_temperature?: number;
  outdoor_humidity?: number;
}

// ==========================================
// IoT DEVICE TYPES
// ==========================================

export type DeviceProvisioningStatus = 'pending_mapping' | 'mapped' | 'active' | 'inactive';

export type Device = {
  device_id: string;
  device_mac: string;
  device_code: string | null;
  device_name: string | null;
  site_id: string | null;
  program_id: string | null;
  firmware_version: string | null;
  hardware_version: string;
  is_active: boolean;
  provisioning_status: DeviceProvisioningStatus;
  last_seen_at: string | null;
  last_wake_at: string | null;
  next_wake_at: string | null;
  wake_schedule_cron: string | null;
  manual_wake_override: boolean;
  manual_wake_requested_by: string | null;
  manual_wake_requested_at: string | null;
  battery_voltage: number | null;
  zone_id: string | null;
  zone_label: string | null;
  x_position: number | null;  // Will be REQUIRED after migration (currently nullable for transition)
  y_position: number | null;  // Will be REQUIRED after migration (currently nullable for transition)
  placement_json: {
    x?: number;  // Legacy - being migrated to x_position column
    y?: number;  // Legacy - being migrated to y_position column
    height?: string;
    notes?: string;
  } | null;
  battery_health_percent: number | null;
  wifi_ssid: string | null;
  mqtt_client_id: string | null;
  provisioned_at: string | null;
  provisioned_by_user_id: string | null;
  mapped_at: string | null;
  mapped_by_user_id: string | null;
  device_reported_site_id: string | null;
  device_reported_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sites?: {
    site_id: string;
    name: string;
    type: string;
    site_code?: string;
    program_id?: string;
  } | null;
  pilot_programs?: {
    program_id: string;
    name: string;
    company_id?: string;
  } | null;
};

export type DeviceTelemetry = {
  telemetry_id: string;
  device_id: string;
  captured_at: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  gas_resistance: number | null;
  battery_voltage: number | null;
  wifi_rssi: number | null;
  created_at: string;
};

export type DeviceImageStatus = 'pending' | 'receiving' | 'complete' | 'failed';

export type DeviceImage = {
  image_id: string;
  device_id: string;
  submission_id: string | null;
  observation_id: string | null;
  observation_type: 'petri' | 'gasifier' | null;
  captured_at: string;
  image_url: string | null;
  storage_path: string | null;
  total_chunks: number;
  received_chunks: number;
  status: DeviceImageStatus;
  error_message: string | null;
  device_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type DeviceCommandType =
  | 'capture_image'
  | 'send_image'
  | 'set_wake_schedule'
  | 'update_config'
  | 'reboot'
  | 'update_firmware';

export type DeviceCommandStatus =
  | 'pending'
  | 'sent'
  | 'acknowledged'
  | 'completed'
  | 'failed'
  | 'timeout';

export type DeviceCommand = {
  command_id: string;
  device_id: string;
  command_type: DeviceCommandType;
  command_payload: Record<string, any>;
  issued_by_user_id: string;
  issued_at: string;
  status: DeviceCommandStatus;
  sent_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DeviceAlertType =
  | 'missed_wake'
  | 'low_battery'
  | 'connection_failure'
  | 'sensor_error'
  | 'image_transmission_failed'
  | 'prolonged_offline';

export type DeviceAlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export type DeviceAlert = {
  alert_id: string;
  device_id: string;
  alert_type: DeviceAlertType;
  severity: DeviceAlertSeverity;
  message: string;
  details: Record<string, any>;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  resolution_notes: string | null;
};

// Device capture metadata for observations
export interface DeviceCaptureMetadata {
  device_id: string;
  device_mac: string;
  captured_at: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  battery_voltage?: number;
  wifi_rssi?: number;
  firmware_version?: string;
}


export interface DeviceWithStats extends Device {
  total_images?: number;
  pending_images?: number;
  failed_images?: number;
  last_telemetry?: DeviceTelemetry;
  active_alerts?: number;
  current_site_assignments?: DeviceSiteAssignment[];
  current_program_assignments?: DeviceProgramAssignment[];
}

// ==========================================
// JUNCTION TABLE TYPES FOR MANY-TO-MANY RELATIONSHIPS
// ==========================================

export type DeviceSiteAssignment = {
  assignment_id: string;
  device_id: string;
  site_id: string;
  program_id: string;
  is_primary: boolean;
  is_active: boolean;
  assigned_at: string;
  assigned_by_user_id: string | null;
  unassigned_at: string | null;
  unassigned_by_user_id: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sites?: {
    site_id: string;
    name: string;
    type: string;
    site_code?: string;
  };
  devices?: {
    device_id: string;
    device_code: string | null;
    device_name: string | null;
    device_mac: string;
  };
  pilot_programs?: {
    program_id: string;
    name: string;
  };
};

export type DeviceProgramAssignment = {
  assignment_id: string;
  device_id: string;
  program_id: string;
  is_primary: boolean;
  is_active: boolean;
  assigned_at: string;
  assigned_by_user_id: string | null;
  unassigned_at: string | null;
  unassigned_by_user_id: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  devices?: {
    device_id: string;
    device_code: string | null;
    device_name: string | null;
    device_mac: string;
  };
  pilot_programs?: {
    program_id: string;
    name: string;
  };
};

export type SiteProgramAssignment = {
  assignment_id: string;
  site_id: string;
  program_id: string;
  is_primary: boolean;
  is_active: boolean;
  assigned_at: string;
  assigned_by_user_id: string | null;
  unassigned_at: string | null;
  unassigned_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sites?: {
    site_id: string;
    name: string;
    type: string;
    site_code?: string;
  };
  pilot_programs?: {
    program_id: string;
    name: string;
  };
};

// ==========================================
// DEVICE HISTORY & SESSION TYPES
// ==========================================

export type DeviceEventCategory =
  | 'WakeSession'
  | 'ImageCapture'
  | 'EnvironmentalReading'
  | 'BatteryStatus'
  | 'Assignment'
  | 'Unassignment'
  | 'Activation'
  | 'Deactivation'
  | 'ChunkTransmission'
  | 'OfflineCapture'
  | 'WiFiConnectivity'
  | 'MQTTStatus'
  | 'ProvisioningStep'
  | 'FirmwareUpdate'
  | 'ConfigurationChange'
  | 'MaintenanceActivity'
  | 'ErrorEvent'
  | 'Alert'
  | 'Command';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type DeviceSessionStatus = 'success' | 'partial' | 'failed' | 'in_progress';

export type DeviceWakeSession = {
  session_id: string;
  device_id: string;
  site_id: string | null;
  program_id: string | null;
  wake_timestamp: string;
  session_duration_ms: number | null;
  next_wake_scheduled: string | null;
  connection_success: boolean;
  wifi_retry_count: number;
  mqtt_connected: boolean;
  image_captured: boolean;
  image_id: string | null;
  chunks_sent: number;
  chunks_total: number;
  chunks_missing: number[];
  transmission_complete: boolean;
  telemetry_data: DeviceSessionTelemetry;
  status: DeviceSessionStatus;
  error_codes: string[];
  pending_images_count: number;
  was_offline_capture: boolean;
  offline_duration_hours: number | null;
  created_at: string;
  updated_at: string;
  // Joined data
  device_mac?: string;
  device_name?: string;
  site_name?: string;
  program_name?: string;
};

export interface DeviceSessionTelemetry {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  battery_voltage?: number;
  battery_health_percent?: number;
  wifi_rssi?: number;
}

export type DeviceHistory = {
  history_id: string;
  device_id: string;
  site_id: string | null;
  program_id: string | null;
  session_id: string | null;
  event_category: DeviceEventCategory;
  event_type: string;
  severity: EventSeverity;
  event_timestamp: string;
  description: string | null;
  event_data: Record<string, any>;
  metadata: Record<string, any>;
  user_id: string | null;
  created_at: string;
  // Joined data
  device_mac?: string;
  device_name?: string;
  site_name?: string;
  program_name?: string;
  user_email?: string;
};

export type DeviceErrorCode = {
  error_code: number;
  error_category: string;
  error_message: string;
  severity: EventSeverity;
  recommended_action: string | null;
  created_at: string;
};

// Unified audit trail entry (combines program/site/device events)
export type UnifiedAuditEntry = {
  event_id: string;
  event_source: 'device' | 'site' | 'program' | 'submission';
  event_type: string;
  event_category: string;
  severity: string;
  event_timestamp: string;
  description: string;
  site_id?: string | null;
  site_name?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  user_email?: string | null;
  event_data: Record<string, any>;
};

// Session Wake Snapshot types for visualization
export type DeviceConnectivity = {
  status: 'excellent' | 'good' | 'poor' | 'offline' | 'unknown';
  color: string;
  trailing_wakes_expected: number;
  trailing_wakes_actual: number;
  reliability_percent: number | null;
  last_expected_wakes?: string[];
};

export type DeviceSnapshotData = {
  device_id: string;
  device_name: string;
  device_mac: string;
  x_position: number;
  y_position: number;
  mgi_score: number | null;
  mgi_velocity: number | null;
  mgi_speed_per_day: number | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  battery_voltage: number | null;
  last_wake: string | null;
  status: string;
  placement_notes: string | null;
  connectivity?: DeviceConnectivity;
};

export type ZoneSnapshotData = {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  coordinates: { x: number; y: number }[];
  device_count: number;
  avg_mgi: number | null;
  avg_temperature: number | null;
  avg_humidity: number | null;
  risk_level: string | null;
};

export type SiteLayoutData = {
  length: number;
  width: number;
  height: number;
  wall_details: Array<{
    wall_id: string;
    orientation: string;
    start_point: { x: number; y: number };
    end_point: { x: number; y: number };
    length_ft: number;
    material: string;
    justification: string;
  }>;
  door_details: any[];
  platform_details: any[];
  zones: any[];
};

export type SessionWakeSnapshot = {
  snapshot_id: string;
  session_id: string;
  site_id: string;
  program_id: string;
  company_id: string;
  wake_number: number;
  wake_round_start: string;
  wake_round_end: string;
  site_state: {
    snapshot_metadata?: {
      wake_number: number;
      wake_round_start: string;
      wake_round_end: string;
      session_id: string;
    };
    site_metadata?: {
      site_id: string;
      site_name: string;
      site_code: string;
      site_type: string;
      dimensions: {
        length: number;
        width: number;
        height: number;
      };
      wall_details: any[];
      door_details: any[];
      platform_details: any[];
      timezone: string;
    };
    program_context?: {
      program_id: string;
      program_name: string;
      program_start_date: string;
      program_end_date: string;
      program_day: number;
      total_days: number;
    };
    devices: Array<{
      device_id: string;
      device_code: string;
      device_name: string;
      device_mac: string;
      position: { x: number; y: number };
      zone_id?: string;
      zone_label?: string;
      status: string;
      battery_voltage?: number;
      battery_health_percent?: number;
      last_seen_at?: string;
      telemetry?: {
        temperature?: number;
        humidity?: number;
        pressure?: number;
        wifi_rssi?: number;
        captured_at: string;
        is_current?: boolean;
        data_freshness?: string;
        hours_since_last?: number;
      };
      mgi_state?: {
        current_mgi?: number;
        captured_at?: string;
        is_current?: boolean;
        data_freshness?: string;
        hours_since_last?: number;
        mgi_velocity?: {
          per_hour?: number;
        };
      };
      images_this_round?: any[];
      alerts?: any[];
      display?: {
        color: string;
        shape: string;
        size: string;
      };
    }>;
    environmental_zones?: Array<{
      zone_id: string;
      device_id: string;
      device_code: string;
      center_x: number;
      center_y: number;
      radius: number;
      bounds: {
        min_x: number;
        max_x: number;
        min_y: number;
        max_y: number;
      };
    }>;
    session_metrics?: {
      active_devices_count: number;
      new_images_this_round: number;
      new_alerts_this_round: number;
    };
  };
  active_devices_count?: number;
  new_images_this_round?: number;
  new_alerts_this_round?: number;
  avg_temperature?: number | null;
  avg_humidity?: number | null;
  avg_mgi?: number | null;
  max_mgi?: number | null;
  created_at: string;
};