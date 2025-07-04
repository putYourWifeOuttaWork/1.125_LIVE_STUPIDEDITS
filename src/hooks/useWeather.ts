import { useState, useEffect } from 'react';

// Define types for Visual Crossing API responses
interface WeatherLocation {
  address: string;
  name: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

interface CurrentConditions {
  temp: number;          // Temperature in the requested unit
  feelslike: number;     // Feels like temperature
  humidity: number;      // Relative humidity (0-100)
  precip: number;        // Precipitation amount
  precipprob: number;    // Probability of precipitation
  snow: number;          // Snow amount
  snowdepth: number;     // Snow depth
  windspeed: number;     // Wind speed
  winddir: number;       // Wind direction in degrees
  pressure: number;      // Sea level pressure
  visibility: number;    // Visibility distance
  cloudcover: number;    // Cloud cover (0-100)
  solarradiation: number;// Solar radiation
  solarenergy: number;   // Solar energy
  uvindex: number;       // UV index
  conditions: string;    // Text description of conditions
  icon: string;          // Icon name for the conditions
  datetime: string;      // Date and time string
}

interface HourlyForecast {
  datetime: string;
  temp: number;
  feelslike: number;
  humidity: number;
  precip: number;
  precipprob: number;
  conditions: string;
  icon: string;
}

interface WeatherData {
  location: WeatherLocation;
  currentConditions: CurrentConditions;
  hours: HourlyForecast[];
}

// API configuration
const API_KEY = 'GDSVTPUYAML3K9P8BSHGXS5C7';
const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

const useWeather = () => {
  const [locationData, setLocationData] = useState<WeatherLocation | null>(null);
  const [currentConditions, setCurrentConditions] = useState<CurrentConditions | null>(null);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecast[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  useEffect(() => {
    const fetchWeatherData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Get user's geolocation
        if (!navigator.geolocation) {
          throw new Error('Geolocation is not supported by your browser');
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          });
        });

        setLocationPermission('granted');
        const { latitude, longitude } = position.coords;

        // Fetch weather data from Visual Crossing API
        const params = new URLSearchParams({
          key: API_KEY,
          unitGroup: 'us', // Use US units (fahrenheit, mph, etc)
          include: 'current,hours',
          contentType: 'json',
        });

        const response = await fetch(
          `${BASE_URL}/${latitude},${longitude}/today?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Transform the data to match our application's expected format
        const transformedLocation: WeatherLocation = {
          address: data.resolvedAddress,
          name: data.resolvedAddress.split(',')[0],
          timezone: data.timezone,
          latitude: data.latitude,
          longitude: data.longitude
        };
        
        setLocationData(transformedLocation);
        setCurrentConditions(data.currentConditions);
        
        // Get the next few hours of forecast
        const nextFewHours = data.days[0].hours
          .filter((hour: any) => {
            const hourTime = new Date(data.days[0].datetime + 'T' + hour.datetime + ':00');
            const now = new Date();
            return hourTime > now;
          })
          .slice(0, 5);
          
        setHourlyForecast(nextFewHours);
      } catch (err) {
        console.error('Error fetching weather data:', err);
        
        // Handle permission denied error specifically
        if (err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED) {
          setLocationPermission('denied');
          setError('Location permission denied. Please enable location services to see weather data.');
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error occurred');
        }
        
        // Fall back to mock data for development
        useMockWeatherData();
      } finally {
        setIsLoading(false);
      }
    };
    
    // Function to use mock data when API call fails or during development
    const useMockWeatherData = () => {
      setIsLoading(true);
      
      // Simulate API delay
      setTimeout(() => {
        try {
          // Mock location data
          const mockLocation: WeatherLocation = {
            address: 'Miami, Florida, USA',
            name: 'Miami',
            timezone: 'America/New_York',
            latitude: 25.7617,
            longitude: -80.1918
          };
          setLocationData(mockLocation);
          
          // Mock current conditions - matching the CurrentConditions interface exactly
          const mockCurrentConditions: CurrentConditions = {
            temp: 84,
            feelslike: 89,
            humidity: 75,
            precip: 0,
            precipprob: 15,
            snow: 0,
            snowdepth: 0,
            windspeed: 8,
            winddir: 120,
            pressure: 30.12,
            visibility: 10,
            cloudcover: 35,
            solarradiation: 850,
            solarenergy: 15.2,
            uvindex: 6,
            conditions: 'Partly Sunny',
            icon: 'partly-cloudy-day',
            datetime: new Date().toISOString()
          };
          setCurrentConditions(mockCurrentConditions);
          
          // Mock hourly forecast
          const currentHour = new Date().getHours();
          const mockHourlyForecast: HourlyForecast[] = Array.from({ length: 3 }, (_, i) => {
            const hour = (currentHour + i + 1) % 24;
            return {
              datetime: `${hour.toString().padStart(2, '0')}:00:00`,
              temp: 84 + Math.floor(Math.random() * 5 - 2),
              feelslike: 89 + Math.floor(Math.random() * 5 - 2),
              humidity: 75 + Math.floor(Math.random() * 10 - 5),
              precip: 0,
              precipprob: 10 + Math.floor(Math.random() * 20),
              conditions: i === 1 ? 'Partly Cloudy' : 'Mostly Sunny',
              icon: i === 1 ? 'partly-cloudy-day' : 'clear-day'
            };
          });
          setHourlyForecast(mockHourlyForecast);
        } catch (error) {
          console.error('Error with mock weather data:', error);
          setError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
          setIsLoading(false);
        }
      }, 1000);
    };

    // Use mock data in development mode to avoid external API issues
    if (import.meta.env.DEV) {
      useMockWeatherData();
    } else {
      fetchWeatherData();
    }
  }, []);

  // Helper function to map Visual Crossing weather conditions to our app's weather types
  const mapToAppWeatherType = (): 'Clear' | 'Cloudy' | 'Rain' => {
    // Add null checks to prevent errors
    if (!currentConditions || !currentConditions.conditions) {
      return 'Clear'; // Default
    }
    
    const condition = currentConditions.conditions.toLowerCase();
    const iconName = currentConditions.icon?.toLowerCase() || '';
    
    // Check for rain or precipitation first
    if (
      condition.includes('rain') ||
      condition.includes('shower') ||
      condition.includes('storm') ||
      condition.includes('drizzle') ||
      iconName.includes('rain') ||
      iconName.includes('shower')
    ) {
      return 'Rain';
    }
    
    // Check for cloudy conditions
    if (
      condition.includes('cloud') ||
      condition.includes('overcast') ||
      iconName.includes('cloud') ||
      iconName.includes('overcast') ||
      (currentConditions.cloudcover && currentConditions.cloudcover > 60)
    ) {
      return 'Cloudy';
    }
    
    // Default to Clear for everything else
    return 'Clear';
  };

  return {
    locationData,
    currentConditions,
    hourlyForecast,
    isLoading,
    error,
    locationPermission,
    suggestedWeatherType: mapToAppWeatherType()
  };
};

export default useWeather;