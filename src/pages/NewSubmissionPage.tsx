import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { ArrowLeft, CloudRain, Sun, Cloud, Thermometer, Droplets, Info, MapPin, Clock } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { useSites } from '../hooks/useSites';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import useWeather from '../hooks/useWeather';
import useCompanies from '../hooks/useCompanies';
import LoadingScreen from '../components/common/LoadingScreen';
import { toast } from 'react-toastify';
import sessionManager from '../lib/sessionManager';

// Schema for form validation
const SubmissionSchema = Yup.object().shape({
  temperature: Yup.number()
    .required('Temperature is required')
    .min(-30, 'Temperature is too low')
    .max(120, 'Temperature is too high'),
  humidity: Yup.number()
    .required('Humidity is required')
    .min(0, 'Humidity cannot be negative')
    .max(100, 'Humidity cannot exceed 100%'),
  indoor_temperature: Yup.number()
    .nullable()
    .min(32, 'Indoor temperature must be at least 32°F')
    .max(120, 'Indoor temperature cannot exceed 120°F'),
  indoor_humidity: Yup.number()
    .nullable()
    .min(1, 'Indoor humidity must be at least 1%')
    .max(100, 'Indoor humidity cannot exceed 100%'),
  airflow: Yup.string()
    .oneOf(['Open', 'Closed'], 'Please select a valid airflow option')
    .required('Airflow is required'),
  odorDistance: Yup.string()
    .oneOf(['5-10ft', '10-25ft', '25-50ft', '50-100ft', '>100ft'], 'Please select a valid odor distance')
    .required('Odor distance is required'),
  weather: Yup.string()
    .oneOf(['Clear', 'Cloudy', 'Rain'], 'Please select a valid weather condition')
    .required('Weather is required'),
  notes: Yup.string()
    .max(255, 'Notes must be less than 255 characters'),
  timezone: Yup.string()
    .when('siteType', {
      is: 'Transport',
      then: (schema) => schema.required('Timezone is required for transport sites'),
      otherwise: (schema) => schema.optional()
    })
});

const NewSubmissionPage = () => {
  const navigate = useNavigate();
  const { programId, siteId } = useParams<{ programId: string, siteId: string }>();
  const { selectedProgram, setSelectedSite } = usePilotProgramStore();
  const { fetchSite, loading: siteLoading } = useSites(programId);
  const { userCompany } = useCompanies();
  const isOnline = useOnlineStatus();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isTransportFacility, setIsTransportFacility] = useState(false);
  const [localSiteData, setLocalSiteData] = useState<any | null>(null); // New state to prevent infinite loop
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionState | null>(null);
  
  // Weather data
  const { 
    currentConditions, 
    isLoading: weatherLoading, 
    error: weatherError,
    locationPermission,
    suggestedWeatherType
  } = useWeather();

  // Load site data if not already in store
  useEffect(() => {
    const loadSite = async () => {
      if (!siteId || !programId) {
        navigate('/home');
        return;
      }
      
      console.log(`Loading site data for ${siteId}...`);
      
      // Check if we already have the site data locally
      if (localSiteData && localSiteData.site_id === siteId) {
        console.log(`Site loaded: ${localSiteData.name}`);
        setIsTransportFacility(localSiteData.type === 'Transport');
        return;
      }
      
      try {
        const site = await fetchSite(siteId);
        if (site) {
          setSelectedSite(site);
          setLocalSiteData(site); // Store site data locally
          console.log(`Site loaded: ${site.name}`);
          setIsTransportFacility(site.type === 'Transport');
          
          // Log template data for debugging
          console.log('Site petri_defaults:', site.petri_defaults);
          console.log('Site gasifier_defaults:', site.gasifier_defaults);
        } else {
          toast.error('Site not found');
          navigate(`/programs/${programId}/sites`);
        }
      } catch (error) {
        console.error('Error loading site:', error);
        toast.error('Failed to load site data');
        navigate(`/programs/${programId}/sites`);
      }
    };
    
    loadSite();
  }, [programId, siteId, navigate, fetchSite, setSelectedSite]); // Remove selectedSite from dependencies

  // Check for geolocation permission if this is a transport facility
  useEffect(() => {
    if (isTransportFacility) {
      // Check if the browser supports the permissions API
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
          .then(permissionStatus => {
            setLocationPermissionStatus(permissionStatus.state);
            
            // Listen for permission changes
            permissionStatus.onchange = () => {
              setLocationPermissionStatus(permissionStatus.state);
            };
          })
          .catch(error => {
            console.error('Error checking geolocation permission:', error);
          });
      } else {
        // Fallback for browsers that don't support the permissions API
        setLocationPermissionStatus('prompt');
      }
    }
  }, [isTransportFacility]);

  // Initialize formik with default values
  const formik = useFormik({
    initialValues: {
      temperature: localSiteData?.default_temperature || currentConditions?.temp || 70,
      humidity: localSiteData?.default_humidity || currentConditions?.RelativeHumidity || currentConditions?.humidity || 50,
      indoor_temperature: localSiteData?.default_indoor_temperature || '',
      indoor_humidity: localSiteData?.default_indoor_humidity || '',
      airflow: localSiteData?.submission_defaults?.airflow || 'Open',
      odorDistance: localSiteData?.submission_defaults?.odor_distance || '5-10ft',
      weather: suggestedWeatherType || localSiteData?.default_weather || userCompany?.default_weather || 'Clear',
      notes: localSiteData?.submission_defaults?.notes || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Default to browser timezone
      siteType: localSiteData?.type || 'Greenhouse', // Used for conditional validation
    },
    validationSchema: SubmissionSchema,
    validateOnMount: true, // Added this to validate form on mount
    enableReinitialize: true, // This ensures form values are updated when initialValues change
    onSubmit: async (values, { setSubmitting }) => {
      if (!programId || !siteId) {
        toast.error('Missing program or site ID');
        return;
      }
      
      setIsCreatingSession(true);
      try {
        // Construct submission data
        const submissionData = {
          temperature: Number(values.temperature),
          humidity: Number(values.humidity),
          airflow: values.airflow as 'Open' | 'Closed',
          odor_distance: values.odorDistance as '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
          weather: values.weather as 'Clear' | 'Cloudy' | 'Rain',
          notes: values.notes || null,
        };
        
        // Add indoor environmental data if provided
        if (values.indoor_temperature) {
          submissionData.indoor_temperature = Number(values.indoor_temperature);
        }
        
        if (values.indoor_humidity) {
          submissionData.indoor_humidity = Number(values.indoor_humidity);
        }
        
        // Add timezone for transport facilities
        if (isTransportFacility && values.timezone) {
          submissionData.timezone = values.timezone;
        }
        
        // Get petri and gasifier defaults from site if available
        const petriDefaults = localSiteData?.petri_defaults;
        const gasifierDefaults = localSiteData?.gasifier_defaults;
        
        console.log('Creating session with the following data:');
        console.log('Submission data:', submissionData);
        console.log('Petri defaults:', petriDefaults);
        console.log('Gasifier defaults:', gasifierDefaults);
        console.log('Using templates (petri/gasifier):', !!petriDefaults, !!gasifierDefaults);
        
        // Create the submission session
        const response = await sessionManager.createSubmissionSession(
          siteId,
          programId,
          submissionData,
          petriDefaults,
          gasifierDefaults
        );
        
        if (response.success && response.submission_id) {
          // Navigate to the new submission edit page
          navigate(`/programs/${programId}/sites/${siteId}/submissions/${response.submission_id}/edit`);
          toast.success('Submission created successfully. You can now add observations.');
        } else {
          console.error('Failed to create submission session:', response);
          toast.error(response.message || 'Failed to create submission');
        }
      } catch (error) {
        console.error('Error creating submission:', error);
        toast.error('Error creating submission. Please try again.');
      } finally {
        setSubmitting(false);
        setIsCreatingSession(false);
      }
    },
  });

  // Initialize form values from site defaults if available
  useEffect(() => {
    if (!localSiteData || formik.dirty) return;
    
    // Prepare values object with current form values
    const updatedValues = { ...formik.values };
    
    // IMPORTANT FIX: Prioritize initialTemperature and initialHumidity from Weather API
    // Only use site defaults if Weather API values are not available
    
    // For temperature: prefer API value, fall back to site default
    if (currentConditions?.temp !== undefined && currentConditions.temp !== null) {
      updatedValues.temperature = currentConditions.temp.toString();
    } else if (localSiteData.default_temperature) {
      updatedValues.temperature = localSiteData.default_temperature.toString();
    }
    
    // For humidity: prefer API value, fall back to site default
    if ((currentConditions?.RelativeHumidity !== undefined && currentConditions.RelativeHumidity !== null) || 
        (currentConditions?.humidity !== undefined && currentConditions.humidity !== null)) {
      updatedValues.humidity = (currentConditions.RelativeHumidity || currentConditions.humidity).toString();
    } else if (localSiteData.default_humidity) {
      updatedValues.humidity = localSiteData.default_humidity.toString();
    }
    
    // Check if site has submission defaults for other fields
    if (localSiteData.submission_defaults) {
      const defaults = localSiteData.submission_defaults;
      
      // Set other default values (but not temperature or humidity which we handled above)
      if (defaults.indoor_temperature) {
        updatedValues.indoor_temperature = defaults.indoor_temperature.toString();
      } else if (localSiteData.default_indoor_temperature) {
        updatedValues.indoor_temperature = localSiteData.default_indoor_temperature.toString();
      }
      
      if (defaults.indoor_humidity) {
        updatedValues.indoor_humidity = defaults.indoor_humidity.toString();
      } else if (localSiteData.default_indoor_humidity) {
        updatedValues.indoor_humidity = localSiteData.default_indoor_humidity.toString();
      }
      
      if (defaults.airflow) {
        updatedValues.airflow = defaults.airflow;
      }
      
      if (defaults.odor_distance) {
        updatedValues.odorDistance = defaults.odor_distance;
      }
      
      // For weather, prioritize suggestedWeatherType, then site default, then company default
      if (suggestedWeatherType) {
        updatedValues.weather = suggestedWeatherType;
      } else if (defaults.weather) {
        updatedValues.weather = defaults.weather;
      } else if (localSiteData.default_weather) {
        updatedValues.weather = localSiteData.default_weather;
      } else if (userCompany?.default_weather) {
        updatedValues.weather = userCompany.default_weather;
      }
      
      if (defaults.notes) {
        updatedValues.notes = defaults.notes;
      }
    } else {
      // Handle case where submission_defaults is not available but individual defaults are
      if (localSiteData.default_indoor_temperature) {
        updatedValues.indoor_temperature = localSiteData.default_indoor_temperature.toString();
      }
      
      if (localSiteData.default_indoor_humidity) {
        updatedValues.indoor_humidity = localSiteData.default_indoor_humidity.toString();
      }
      
      // For weather, prioritize suggestedWeatherType, then site default, then company default
      if (suggestedWeatherType) {
        updatedValues.weather = suggestedWeatherType;
      } else if (localSiteData.default_weather) {
        updatedValues.weather = localSiteData.default_weather;
      } else if (userCompany?.default_weather) {
        updatedValues.weather = userCompany.default_weather;
      }
    }
    
    // Fix: Only update form values if they're different from current values
    // Convert to JSON strings for deep comparison
    const currentValuesStr = JSON.stringify(formik.values);
    const updatedValuesStr = JSON.stringify(updatedValues);
    
    if (currentValuesStr !== updatedValuesStr) {
      formik.setValues(updatedValues);
    }
  }, [localSiteData, suggestedWeatherType, userCompany?.default_weather, currentConditions, formik]);

  // Request geolocation if this is a transport facility
  const requestGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Success - we have the position
          setLocationPermissionStatus('granted');
          
          // You could store lat/long here if needed
          console.log('Location obtained:', position.coords.latitude, position.coords.longitude);
          
          // Get timezone from browser
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          formik.setFieldValue('timezone', timezone);
          
          toast.success('Location access granted. Timezone set to ' + timezone);
        },
        (error) => {
          // Error getting position
          console.error('Error getting location:', error);
          setLocationPermissionStatus('denied');
          
          if (error.code === error.PERMISSION_DENIED) {
            toast.error('Location access denied. Please enter timezone manually.');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            toast.error('Location information is unavailable. Please enter timezone manually.');
          } else if (error.code === error.TIMEOUT) {
            toast.error('Location request timed out. Please enter timezone manually.');
          }
        }
      );
    } else {
      toast.error('Geolocation is not supported by this browser. Please enter timezone manually.');
    }
  };

  if (siteLoading) {
    return <LoadingScreen />;
  }

  if (!localSiteData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Site not found. Please select a site first.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate(`/programs/${programId}/sites`)}
        >
          Go to Sites
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Submission</h1>
          <p className="text-gray-600 mt-1">
            {localSiteData.name} - {localSiteData.type}
          </p>
        </div>
      </div>

      <form onSubmit={formik.handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold flex items-center">
              <Info className="mr-2 h-5 w-5 text-primary-600" />
              Initial Submission Information
            </h2>
          </CardHeader>
          <CardContent>
            <div className="mb-4 bg-primary-50 border border-primary-100 p-3 rounded-md">
              <p className="text-sm text-primary-700">
                Enter the basic information to start your submission. You'll be able to add petri dish and 
                gasifier observations in the next step.
              </p>
            </div>
            
            {/* Display warning if this is a transport facility */}
            {isTransportFacility && (
              <div className="mb-6 bg-warning-50 border border-warning-200 p-3 rounded-md">
                <div className="flex items-start">
                  <MapPin className="text-warning-500 mr-2 mt-0.5" size={18} />
                  <div>
                    <p className="text-warning-800 font-medium">Transport Facility Notice</p>
                    <p className="text-sm text-warning-700 mt-1">
                      This is a transport facility submission. The location and timezone information will be based on 
                      where you are at the time of submission.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-700">Outdoor Environment</h3>
                
                <div className="flex items-center mb-4">
                  <Thermometer className="text-error-500 mr-2" size={18} />
                  <Input
                    label="Temperature (°F)"
                    id="temperature"
                    name="temperature"
                    type="number"
                    value={formik.values.temperature}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.temperature && formik.errors.temperature ? formik.errors.temperature : undefined}
                    className="!mb-0"
                    testId="temperature-input"
                  />
                </div>
                
                <div className="flex items-center mb-4">
                  <Droplets className="text-secondary-500 mr-2" size={18} />
                  <Input
                    label="Humidity (%)"
                    id="humidity"
                    name="humidity"
                    type="number"
                    value={formik.values.humidity}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.humidity && formik.errors.humidity ? formik.errors.humidity : undefined}
                    className="!mb-0"
                    testId="humidity-input"
                  />
                </div>
                
                <div className="mb-4 flex">
                  <div className="w-6 mr-2 flex-shrink-0"></div> {/* Placeholder for icon alignment */}
                  <div className="flex-1">
                    <label htmlFor="airflow" className="block text-sm font-medium text-gray-700 mb-1">
                      Airflow
                    </label>
                    <select
                      id="airflow"
                      name="airflow"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.airflow}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="Open">Open</option>
                      <option value="Closed">Closed</option>
                    </select>
                    {formik.touched.airflow && formik.errors.airflow && (
                      <p className="mt-1 text-sm text-error-600">{formik.errors.airflow}</p>
                    )}
                  </div>
                </div>
                
                <div className="mb-4 flex">
                  <div className="w-6 mr-2 flex-shrink-0"></div> {/* Placeholder for icon alignment */}
                  <div className="flex-1">
                    <label htmlFor="odorDistance" className="block text-sm font-medium text-gray-700 mb-1">
                      Odor Distance
                    </label>
                    <select
                      id="odorDistance"
                      name="odorDistance"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.odorDistance}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                    >
                      <option value="5-10ft">5-10 ft</option>
                      <option value="10-25ft">10-25 ft</option>
                      <option value="25-50ft">25-50 ft</option>
                      <option value="50-100ft">50-100 ft</option>
                      <option value=">100ft">More than 100 ft</option>
                    </select>
                    {formik.touched.odorDistance && formik.errors.odorDistance && (
                      <p className="mt-1 text-sm text-error-600">{formik.errors.odorDistance}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-700">Indoor Environment</h3>
                
                <div className="flex items-center mb-4">
                  <Thermometer className="text-error-500 mr-2" size={18} />
                  <Input
                    label="Indoor Temperature (°F)"
                    id="indoor_temperature"
                    name="indoor_temperature"
                    type="number"
                    placeholder="e.g., 75"
                    value={formik.values.indoor_temperature}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.indoor_temperature && formik.errors.indoor_temperature ? formik.errors.indoor_temperature : undefined}
                    helperText="Valid range: 32-120°F (optional)"
                    className="!mb-0"
                    testId="indoor-temperature-input"
                  />
                </div>
                
                <div className="flex items-center mb-4">
                  <Droplets className="text-secondary-500 mr-2" size={18} />
                  <Input
                    label="Indoor Humidity (%)"
                    id="indoor_humidity"
                    name="indoor_humidity"
                    type="number"
                    placeholder="e.g., 45"
                    value={formik.values.indoor_humidity}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.indoor_humidity && formik.errors.indoor_humidity ? formik.errors.indoor_humidity : undefined}
                    helperText="Valid range: 1-100% (optional)"
                    className="!mb-0"
                    testId="indoor-humidity-input"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weather
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => formik.setFieldValue('weather', 'Clear')}
                      className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                        formik.values.weather === 'Clear'
                          ? 'bg-yellow-100 border-yellow-200 border text-yellow-800'
                          : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <Sun className={`h-6 w-6 ${formik.values.weather === 'Clear' ? 'text-yellow-600' : 'text-gray-400'}`} />
                      <span className="mt-1 text-sm font-medium">Clear</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => formik.setFieldValue('weather', 'Cloudy')}
                      className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                        formik.values.weather === 'Cloudy'
                          ? 'bg-gray-800 border-gray-900 border text-white'
                          : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <Cloud className={`h-6 w-6 ${formik.values.weather === 'Cloudy' ? 'text-white' : 'text-gray-400'}`} />
                      <span className="mt-1 text-sm font-medium">Cloudy</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => formik.setFieldValue('weather', 'Rain')}
                      className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                        formik.values.weather === 'Rain'
                          ? 'bg-blue-100 border-blue-200 border text-blue-800'
                          : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <CloudRain className={`h-6 w-6 ${formik.values.weather === 'Rain' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className="mt-1 text-sm font-medium">Rain</span>
                    </button>
                  </div>
                  {formik.touched.weather && formik.errors.weather && (
                    <p className="mt-1 text-sm text-error-600">{formik.errors.weather}</p>
                  )}
                </div>
                
                {/* Show weather data if available */}
                {currentConditions && !weatherLoading && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                    <p className="text-sm font-medium text-gray-700">Current Weather:</p>
                    <div className="flex items-center mt-1">
                      <div className="text-sm">
                        <span className="text-gray-600">{currentConditions.temp}°F, {currentConditions.RelativeHumidity || currentConditions.humidity}% humidity</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Timezone field for transport facilities */}
            {isTransportFacility && (
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <Clock className="text-primary-500 mr-2" size={18} />
                  <label className="block text-sm font-medium text-gray-700">
                    Location & Timezone
                  </label>
                </div>
                
                <div className="p-3 bg-gray-50 rounded-md border border-gray-200 mb-3">
                  {locationPermissionStatus === 'granted' ? (
                    <div className="flex items-center text-success-700">
                      <MapPin className="mr-2" size={16} />
                      <span>Location access granted. Timezone will be recorded automatically.</span>
                    </div>
                  ) : locationPermissionStatus === 'denied' ? (
                    <div className="flex items-center text-error-700">
                      <MapPin className="mr-2" size={16} />
                      <span>Location access denied. Please enter timezone manually.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center text-gray-700">
                        <MapPin className="mr-2" size={16} />
                        <span>Location access is required for transport facilities to track submission location.</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={requestGeolocation}
                      >
                        Allow Location Access
                      </Button>
                    </div>
                  )}
                </div>
                
                <Input
                  label="Timezone"
                  id="timezone"
                  name="timezone"
                  type="text"
                  placeholder="e.g., America/New_York"
                  value={formik.values.timezone}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.timezone && formik.errors.timezone ? formik.errors.timezone : undefined}
                  helperText="Required for transport facilities to track submission time correctly"
                  testId="timezone-input"
                />
              </div>
            )}
            
            {/* Notes field */}
            <div className="mb-4">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter any additional notes about this submission"
                value={formik.values.notes}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              ></textarea>
              {formik.touched.notes && formik.errors.notes && (
                <p className="mt-1 text-sm text-error-600">{formik.errors.notes}</p>
              )}
            </div>
            
            {/* Warning for offline users */}
            {!isOnline && (
              <div className="mb-6 bg-warning-50 border border-warning-200 p-3 rounded-md text-warning-800">
                <p className="text-sm font-medium">You are currently offline</p>
                <p className="text-xs mt-1">
                  Your submission will be stored locally and will sync when you reconnect. Make sure you complete 
                  this submission when online, as offline functionality may be limited.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end space-x-3">
            <Button 
              type="button"
              variant="outline"
              onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
              testId="cancel-submission-button"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              variant="primary"
              isLoading={formik.isSubmitting || isCreatingSession}
              disabled={!formik.isValid}
              testId="start-submission-button"
            >
              Start Submission
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default NewSubmissionPage;