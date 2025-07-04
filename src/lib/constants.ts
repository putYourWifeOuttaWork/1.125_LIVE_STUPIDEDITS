// Constants for use in various forms and components
// Includes country list, US states list, and common timezones

// List of countries (abbreviated to save space)
export const countries = [
  'United States',
  'Canada',
  'Mexico',
  'Brazil',
  'Argentina',
  'United Kingdom',
  'France',
  'Germany',
  'Italy',
  'Spain',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Australia',
  'New Zealand',
  'Japan',
  'China',
  'India',
  'South Korea',
  'Singapore',
  'South Africa',
  'Nigeria',
  'Egypt',
  'Israel',
  'United Arab Emirates',
  'Russia',
  'Ukraine',
  'Poland'
];

// US States
export const usStates = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 
  'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

// Common timezones
export const commonTimezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Honolulu',
  'America/Vancouver',
  'America/Toronto',
  'America/Montreal',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Pacific/Auckland'
];

// Group timezones by region for easier selection
export const timezonesGrouped = [
  {
    group: 'North America',
    zones: [
      { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
      { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
      { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
      { value: 'America/Phoenix', label: 'Arizona' },
      { value: 'America/Anchorage', label: 'Alaska' },
      { value: 'America/Honolulu', label: 'Hawaii' },
      { value: 'America/Vancouver', label: 'Vancouver' },
      { value: 'America/Toronto', label: 'Toronto' },
      { value: 'America/Montreal', label: 'Montreal' },
      { value: 'America/Mexico_City', label: 'Mexico City' }
    ]
  },
  {
    group: 'South America',
    zones: [
      { value: 'America/Bogota', label: 'Bogota' },
      { value: 'America/Lima', label: 'Lima' },
      { value: 'America/Sao_Paulo', label: 'São Paulo' },
      { value: 'America/Buenos_Aires', label: 'Buenos Aires' },
      { value: 'America/Santiago', label: 'Santiago' }
    ]
  },
  {
    group: 'Europe',
    zones: [
      { value: 'Europe/London', label: 'London' },
      { value: 'Europe/Paris', label: 'Paris' },
      { value: 'Europe/Berlin', label: 'Berlin' },
      { value: 'Europe/Madrid', label: 'Madrid' },
      { value: 'Europe/Rome', label: 'Rome' },
      { value: 'Europe/Amsterdam', label: 'Amsterdam' },
      { value: 'Europe/Stockholm', label: 'Stockholm' },
      { value: 'Europe/Oslo', label: 'Oslo' },
      { value: 'Europe/Copenhagen', label: 'Copenhagen' },
      { value: 'Europe/Helsinki', label: 'Helsinki' },
      { value: 'Europe/Moscow', label: 'Moscow' }
    ]
  },
  {
    group: 'Asia & Pacific',
    zones: [
      { value: 'Asia/Tokyo', label: 'Tokyo' },
      { value: 'Asia/Shanghai', label: 'Shanghai' },
      { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
      { value: 'Asia/Singapore', label: 'Singapore' },
      { value: 'Asia/Seoul', label: 'Seoul' },
      { value: 'Asia/Dubai', label: 'Dubai' },
      { value: 'Australia/Sydney', label: 'Sydney' },
      { value: 'Australia/Melbourne', label: 'Melbourne' },
      { value: 'Australia/Perth', label: 'Perth' },
      { value: 'Pacific/Auckland', label: 'Auckland' }
    ]
  }
];

// Canadian provinces
export const canadianProvinces = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon'
];