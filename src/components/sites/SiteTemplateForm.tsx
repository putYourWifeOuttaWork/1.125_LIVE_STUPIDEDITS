import { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate } from 'react-router-dom';
import { Check, X, Plus, Trash2, ArrowLeft, Building, Fan } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import { SubmissionDefaults, PetriDefaults, GasifierDefaults } from '../../lib/types';
import NewSitePetriTemplateForm from './NewSitePetriTemplateForm';
import NewSiteGasifierTemplateForm from './NewSiteGasifierTemplateForm';
import { v4 as uuidv4 } from 'uuid';
import { countries, usStates, timezonesGrouped } from '../../lib/constants';

interface SiteTemplateFormProps {
  siteId: string;
  initialValues: {
    submissionDefaults?: SubmissionDefaults;
    petriDefaults?: PetriDefaults[];
    gasifierDefaults?: GasifierDefaults[];
    siteType?: string;
    squareFootage?: number | null;
    cubicFootage?: number | null;
    numVents?: number | null;
    ventPlacements?: string[];
    primaryFunction?: string;
    constructionMaterial?: string;
    insulationType?: string;
    hvacSystemPresent?: boolean;
    hvacSystemType?: string;
    irrigationSystemType?: string;
    lightingSystem?: string;
    length?: number;
    width?: number;
    height?: number;
    minEfficaciousGasifierDensity?: number;
    hasDeadZones?: boolean;
    numRegularlyOpenedPorts?: number;
    interiorWorkingSurfaceTypes?: string[];
    microbialRiskZone?: string;
    quantityDeadzones?: number;
    ventilationStrategy?: string;
  };
  initialSiteName: string;
  onSubmit: (
    siteName: string,
    submissionDefaults: SubmissionDefaults,
    petriDefaults: PetriDefaults[], 
    gasifierDefaults: GasifierDefaults[],
    siteProperties?: any
  ) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

// Validation schema for the form
const SiteTemplateSchema = Yup.object().shape({
  siteName: Yup.string()
    .required('Site name is required')
    .min(2, 'Site name must be at least 2 characters')
    .max(100, 'Site name must be at most 100 characters'),
  // Weather defaults
  temperature: Yup.number()
    .required('Temperature is required')
    .min(-30, 'Temperature must be at least -30°F')
    .max(120, 'Temperature must be at most 120°F'),
  humidity: Yup.number()
    .required('Humidity is required')
    .min(0, 'Humidity must be at least 0%')
    .max(100, 'Humidity must be at most 100%'),
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
    }),
  // Physical properties
  squareFootage: Yup.number()
    .nullable()
    .min(100, 'Square footage must be at least 100')
    .max(1000000000, 'Square footage must be at most 1,000,000,000'),
  cubicFootage: Yup.number()
    .nullable()
    .min(25, 'Cubic footage must be at least 25')
    .max(1000000, 'Cubic footage must be at most 1,000,000'),
  numVents: Yup.number()
    .nullable()
    .integer('Number of vents must be an integer')
    .min(1, 'Number of vents must be at least 1')
    .max(10000, 'Number of vents must be at most 10,000'),
  // Dimensions
  length: Yup.number()
    .nullable()
    .min(1, 'Length must be at least 1')
    .max(10000, 'Length must be at most 10,000'),
  width: Yup.number()
    .nullable()
    .min(1, 'Width must be at least 1')
    .max(10000, 'Width must be at most 10,000'),
  height: Yup.number()
    .nullable()
    .min(1, 'Height must be at least 1')
    .max(10000, 'Height must be at most 10,000'),
  // Environmental properties
  numRegularlyOpenedPorts: Yup.number()
    .nullable()
    .integer('Number of regularly opened ports must be an integer')
    .min(0, 'Number of regularly opened ports must be at least 0')
    .max(1000, 'Number of regularly opened ports must be at most 1,000'),
  minEfficaciousGasifierDensity: Yup.number()
    .nullable()
    .min(100, 'Min efficacious gasifier density must be at least 100')
    .max(10000, 'Min efficacious gasifier density must be at most 10,000'),
  quantityDeadzones: Yup.number()
    .nullable()
    .integer('Quantity of dead zones must be an integer')
    .min(1, 'Quantity of dead zones must be at least 1')
    .max(25, 'Quantity of dead zones must be at most 25'),
});

const SiteTemplateForm = ({
  siteId,
  initialValues,
  initialSiteName,
  onSubmit,
  onCancel,
  isLoading = false,
}: SiteTemplateFormProps) => {
  const navigate = useNavigate();
  
  // Initialize form state
  const [petriTemplates, setPetriTemplates] = useState<PetriDefaults[]>(
    initialValues.petriDefaults?.length ? [...initialValues.petriDefaults] : []
  );
  
  const [gasifierTemplates, setGasifierTemplates] = useState<GasifierDefaults[]>(
    initialValues.gasifierDefaults?.length ? [...initialValues.gasifierDefaults] : []
  );

  // Initialize formik
  const formik = useFormik({
    initialValues: {
      siteName: initialSiteName || '',
      // Submission defaults
      temperature: initialValues.submissionDefaults?.temperature || 70,
      humidity: initialValues.submissionDefaults?.humidity || 50,
      indoor_temperature: initialValues.submissionDefaults?.indoor_temperature || '',
      indoor_humidity: initialValues.submissionDefaults?.indoor_humidity || '',
      airflow: initialValues.submissionDefaults?.airflow || 'Open',
      odorDistance: initialValues.submissionDefaults?.odor_distance || '5-10ft',
      weather: initialValues.submissionDefaults?.weather || 'Clear',
      notes: initialValues.submissionDefaults?.notes || '',
      // Site properties
      siteType: initialValues.siteType || 'Greenhouse',
      squareFootage: initialValues.squareFootage || '',
      cubicFootage: initialValues.cubicFootage || '',
      numVents: initialValues.numVents || '',
      ventPlacements: initialValues.ventPlacements || [],
      primaryFunction: initialValues.primaryFunction || '',
      constructionMaterial: initialValues.constructionMaterial || '',
      insulationType: initialValues.insulationType || '',
      hvacSystemPresent: initialValues.hvacSystemPresent || false,
      hvacSystemType: initialValues.hvacSystemType || '',
      irrigationSystemType: initialValues.irrigationSystemType || '',
      lightingSystem: initialValues.lightingSystem || '',
      // Dimensions
      length: initialValues.length || '',
      width: initialValues.width || '',
      height: initialValues.height || '',
      // Airflow dynamics
      hasDeadZones: initialValues.hasDeadZones || false,
      numRegularlyOpenedPorts: initialValues.numRegularlyOpenedPorts || '',
      // Density settings
      minEfficaciousGasifierDensity: initialValues.minEfficaciousGasifierDensity || 2000,
      // Environmental properties
      interiorWorkingSurfaceTypes: initialValues.interiorWorkingSurfaceTypes || [],
      microbialRiskZone: initialValues.microbialRiskZone || 'Medium',
      quantityDeadzones: initialValues.quantityDeadzones || '',
      ventilationStrategy: initialValues.ventilationStrategy || ''
    },
    validationSchema: SiteTemplateSchema,
    validateOnMount: true, // Added this to validate form on mount
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // Construct submission defaults object
        const submissionDefaults: SubmissionDefaults = {
          temperature: Number(values.temperature),
          humidity: Number(values.humidity),
          airflow: values.airflow as 'Open' | 'Closed',
          odor_distance: values.odorDistance as '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
          weather: values.weather as 'Clear' | 'Cloudy' | 'Rain',
          notes: values.notes || undefined
        };
        
        // Add indoor environmental data if provided
        if (values.indoor_temperature) {
          submissionDefaults.indoor_temperature = Number(values.indoor_temperature);
        }
        
        if (values.indoor_humidity) {
          submissionDefaults.indoor_humidity = Number(values.indoor_humidity);
        }
        
        // Construct site properties object
        const siteProperties = {
          // Physical attributes
          squareFootage: values.squareFootage ? Number(values.squareFootage) : null,
          cubicFootage: values.cubicFootage ? Number(values.cubicFootage) : null,
          numVents: values.numVents ? Number(values.numVents) : null,
          ventPlacements: values.ventPlacements && values.ventPlacements.length > 0 ? values.ventPlacements : null,
          // Facility details
          primaryFunction: values.primaryFunction || null,
          constructionMaterial: values.constructionMaterial || null,
          insulationType: values.insulationType || null,
          // Environmental controls
          hvacSystemPresent: values.hvacSystemPresent,
          hvacSystemType: values.hvacSystemType || null,
          irrigationSystemType: values.irrigationSystemType || null,
          lightingSystem: values.lightingSystem || null,
          // Dimensions
          length: values.length ? Number(values.length) : null,
          width: values.width ? Number(values.width) : null,
          height: values.height ? Number(values.height) : null,
          // Airflow dynamics
          hasDeadZones: values.hasDeadZones,
          numRegularlyOpenedPorts: values.numRegularlyOpenedPorts ? Number(values.numRegularlyOpenedPorts) : null,
          // Density settings
          minEfficaciousGasifierDensity: values.minEfficaciousGasifierDensity ? Number(values.minEfficaciousGasifierDensity) : 2000,
          // Environmental properties
          interiorWorkingSurfaceTypes: values.interiorWorkingSurfaceTypes && values.interiorWorkingSurfaceTypes.length > 0 
            ? values.interiorWorkingSurfaceTypes 
            : null,
          microbialRiskZone: values.microbialRiskZone || 'Medium',
          quantityDeadzones: values.hasDeadZones && values.quantityDeadzones ? Number(values.quantityDeadzones) : null,
          ventilationStrategy: values.ventilationStrategy || null
        };
        
        await onSubmit(
          values.siteName,
          submissionDefaults,
          petriTemplates,
          gasifierTemplates,
          siteProperties
        );
      } catch (error) {
        console.error('Error submitting form:', error);
      }
    }
  });
  
  // Handle adding a new petri template
  const handleAddPetriTemplate = () => {
    const newTemplate: PetriDefaults = {
      petri_code: `P${(petriTemplates.length + 1).toString().padStart(2, '0')}`,
      plant_type: 'Other Fresh Perishable',
      fungicide_used: 'No',
      surrounding_water_schedule: 'Daily',
    };
    
    setPetriTemplates([...petriTemplates, newTemplate]);
  };
  
  // Handle updating a petri template
  const handleUpdatePetriTemplate = (index: number, template: PetriDefaults) => {
    const updatedTemplates = [...petriTemplates];
    updatedTemplates[index] = template;
    setPetriTemplates(updatedTemplates);
  };
  
  // Handle removing a petri template
  const handleRemovePetriTemplate = (index: number) => {
    const updatedTemplates = [...petriTemplates];
    updatedTemplates.splice(index, 1);
    setPetriTemplates(updatedTemplates);
  };
  
  // Handle adding a new gasifier template
  const handleAddGasifierTemplate = () => {
    const newTemplate: GasifierDefaults = {
      gasifier_code: `G${(gasifierTemplates.length + 1).toString().padStart(2, '0')}`,
      chemical_type: 'CLO2',
      placement_height: 'Medium',
      directional_placement: 'Center-Center',
      placement_strategy: 'Centralized Coverage',
      footage_from_origin_x: 0, // Default X coordinate
      footage_from_origin_y: 0  // Default Y coordinate
    };
    
    setGasifierTemplates([...gasifierTemplates, newTemplate]);
  };
  
  // Handle updating a gasifier template
  const handleUpdateGasifierTemplate = (index: number, template: GasifierDefaults) => {
    const updatedTemplates = [...gasifierTemplates];
    updatedTemplates[index] = template;
    setGasifierTemplates(updatedTemplates);
  };
  
  // Handle removing a gasifier template
  const handleRemoveGasifierTemplate = (index: number) => {
    const updatedTemplates = [...gasifierTemplates];
    updatedTemplates.splice(index, 1);
    setGasifierTemplates(updatedTemplates);
  };
  
  // Calculate recommended gasifier placement
  useEffect(() => {
    // Only calculate if all dimensions are provided
    if (formik.values.length && formik.values.width && formik.values.minEfficaciousGasifierDensity) {
      const squareFootage = Number(formik.values.length) * Number(formik.values.width);
      // Update the square footage field
      formik.setFieldValue('squareFootage', squareFootage);
      
      // Calculate recommended gasifier density
      const recommendedBags = Math.ceil(squareFootage / Number(formik.values.minEfficaciousGasifierDensity));
    }
  }, [formik.values.length, formik.values.width, formik.values.minEfficaciousGasifierDensity]);
  
  // Update cubic footage when dimensions change
  useEffect(() => {
    if (formik.values.length && formik.values.width && formik.values.height) {
      const cubicFootage = 
        Number(formik.values.length) * 
        Number(formik.values.width) * 
        Number(formik.values.height);
      
      formik.setFieldValue('cubicFootage', cubicFootage);
    }
  }, [formik.values.length, formik.values.width, formik.values.height]);
  
  // Handle ventPlacement array selection
  const handleVentPlacementChange = (placement: string) => {
    const currentPlacements = formik.values.ventPlacements || [];
    
    if (currentPlacements.includes(placement)) {
      // Remove placement if already selected
      formik.setFieldValue(
        'ventPlacements', 
        currentPlacements.filter(p => p !== placement)
      );
    } else {
      // Add placement if not already selected
      formik.setFieldValue('ventPlacements', [...currentPlacements, placement]);
    }
  };
  
  // Handle interior working surface types selection
  const handleSurfaceTypeChange = (surfaceType: string) => {
    const currentTypes = formik.values.interiorWorkingSurfaceTypes || [];
    
    if (currentTypes.includes(surfaceType)) {
      // Remove type if already selected
      formik.setFieldValue(
        'interiorWorkingSurfaceTypes', 
        currentTypes.filter(t => t !== surfaceType)
      );
    } else {
      // Add type if not already selected
      formik.setFieldValue('interiorWorkingSurfaceTypes', [...currentTypes, surfaceType]);
    }
  };

  return (
    <form onSubmit={formik.handleSubmit} className="space-y-6">
      {/* Site name field */}
      <Input
        label="Site Name"
        id="siteName"
        name="siteName"
        value={formik.values.siteName}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.siteName && formik.errors.siteName ? formik.errors.siteName : undefined}
        disabled={isLoading}
      />
      
      {/* Submission defaults section */}
      <div className="border-b border-gray-200 pb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Submission Defaults</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-medium text-gray-700 mb-3">Outdoor Environment</h4>
            
            <div className="space-y-4">
              <Input
                label="Temperature (°F)"
                id="temperature"
                name="temperature"
                type="number"
                value={formik.values.temperature}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.temperature && formik.errors.temperature ? formik.errors.temperature : undefined}
                disabled={isLoading}
              />
              
              <Input
                label="Humidity (%)"
                id="humidity"
                name="humidity"
                type="number"
                value={formik.values.humidity}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.humidity && formik.errors.humidity ? formik.errors.humidity : undefined}
                disabled={isLoading}
              />
              
              <div className="mb-4">
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
                  disabled={isLoading}
                >
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
                {formik.touched.airflow && formik.errors.airflow && (
                  <p className="mt-1 text-sm text-error-600">{formik.errors.airflow}</p>
                )}
              </div>
              
              <div className="mb-4">
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
                  disabled={isLoading}
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
            <h4 className="text-md font-medium text-gray-700 mb-3">Indoor Environment</h4>
            
            <div className="space-y-4">
              <Input
                label="Indoor Temperature (°F) - Optional"
                id="indoor_temperature"
                name="indoor_temperature"
                type="number"
                value={formik.values.indoor_temperature}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.indoor_temperature && formik.errors.indoor_temperature ? formik.errors.indoor_temperature : undefined}
                disabled={isLoading}
                helperText="Valid range: 32-120°F"
              />
              
              <Input
                label="Indoor Humidity (%) - Optional"
                id="indoor_humidity"
                name="indoor_humidity"
                type="number"
                value={formik.values.indoor_humidity}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.indoor_humidity && formik.errors.indoor_humidity ? formik.errors.indoor_humidity : undefined}
                disabled={isLoading}
                helperText="Valid range: 1-100%"
              />
              
              <div className="mb-4">
                <label htmlFor="weather" className="block text-sm font-medium text-gray-700 mb-1">
                  Weather
                </label>
                <select
                  id="weather"
                  name="weather"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.weather}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="Clear">Clear</option>
                  <option value="Cloudy">Cloudy</option>
                  <option value="Rain">Rain</option>
                </select>
                {formik.touched.weather && formik.errors.weather && (
                  <p className="mt-1 text-sm text-error-600">{formik.errors.weather}</p>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-4">
          <div className="mb-4">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter any default notes for submissions"
              value={formik.values.notes}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              disabled={isLoading}
            ></textarea>
            {formik.touched.notes && formik.errors.notes && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.notes}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Physical characteristics section */}
      <div className="border-b border-gray-200 pb-6">
        <div className="flex items-center mb-4">
          <Building className="mr-2 h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-medium text-gray-900">Facility Characteristics</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-medium text-gray-700 mb-3">Dimensions</h4>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Length (ft)"
                  id="length"
                  name="length"
                  type="number"
                  value={formik.values.length}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.length && formik.errors.length ? formik.errors.length : undefined}
                  disabled={isLoading}
                />
                
                <Input
                  label="Width (ft)"
                  id="width"
                  name="width"
                  type="number"
                  value={formik.values.width}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.width && formik.errors.width ? formik.errors.width : undefined}
                  disabled={isLoading}
                />
                
                <Input
                  label="Height (ft)"
                  id="height"
                  name="height"
                  type="number"
                  value={formik.values.height}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.height && formik.errors.height ? formik.errors.height : undefined}
                  disabled={isLoading}
                />
              </div>
              
              <Input
                label="Square Footage"
                id="squareFootage"
                name="squareFootage"
                type="number"
                value={formik.values.squareFootage}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.squareFootage && formik.errors.squareFootage ? formik.errors.squareFootage : undefined}
                disabled={formik.values.length && formik.values.width ? true : isLoading}
                helperText={formik.values.length && formik.values.width ? "Auto-calculated from length and width" : "Valid range: 100-1,000,000,000 sq ft"}
              />
              
              <Input
                label="Cubic Footage"
                id="cubicFootage"
                name="cubicFootage"
                type="number"
                value={formik.values.cubicFootage}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.cubicFootage && formik.errors.cubicFootage ? formik.errors.cubicFootage : undefined}
                disabled={formik.values.length && formik.values.width && formik.values.height ? true : isLoading}
                helperText={formik.values.length && formik.values.width && formik.values.height ? "Auto-calculated from dimensions" : "Valid range: 25-1,000,000 cu ft"}
              />
            </div>
          </div>
          
          <div>
            <h4 className="text-md font-medium text-gray-700 mb-3">Facility Details</h4>
            
            <div className="space-y-4">
              <div className="mb-4">
                <label htmlFor="primaryFunction" className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Function
                </label>
                <select
                  id="primaryFunction"
                  name="primaryFunction"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.primaryFunction || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="">Select primary function</option>
                  <option value="Growing">Growing</option>
                  <option value="Drying">Drying</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Storage">Storage</option>
                  <option value="Research">Research</option>
                  <option value="Retail">Retail</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label htmlFor="constructionMaterial" className="block text-sm font-medium text-gray-700 mb-1">
                  Construction Material
                </label>
                <select
                  id="constructionMaterial"
                  name="constructionMaterial"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.constructionMaterial || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="">Select construction material</option>
                  <option value="Glass">Glass</option>
                  <option value="Polycarbonate">Polycarbonate</option>
                  <option value="Metal">Metal</option>
                  <option value="Concrete">Concrete</option>
                  <option value="Wood">Wood</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label htmlFor="insulationType" className="block text-sm font-medium text-gray-700 mb-1">
                  Insulation Type
                </label>
                <select
                  id="insulationType"
                  name="insulationType"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.insulationType || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="">Select insulation type</option>
                  <option value="None">None</option>
                  <option value="Basic">Basic</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Ventilation section */}
        <div className="mt-6">
          <div className="flex items-center mb-4">
            <Fan className="mr-2 h-5 w-5 text-primary-600" />
            <h4 className="text-md font-medium text-gray-700">Ventilation & Airflow</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Input
                label="Number of Ventilation Points"
                id="numVents"
                name="numVents"
                type="number"
                value={formik.values.numVents}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.numVents && formik.errors.numVents ? formik.errors.numVents : undefined}
                disabled={isLoading}
                helperText="Valid range: 1-10,000"
              />
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vent Placement
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    'Ceiling-Center',
                    'Ceiling-Perimeter',
                    'Upper-Walls',
                    'Lower-Walls',
                    'Floor-Level'
                  ].map((placement) => (
                    <label key={placement} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={formik.values.ventPlacements?.includes(placement) || false}
                        onChange={() => handleVentPlacementChange(placement)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        disabled={isLoading}
                      />
                      <span className="ml-2 text-sm text-gray-700">{placement}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="mt-4">
                <label htmlFor="ventilationStrategy" className="block text-sm font-medium text-gray-700 mb-1">
                  Ventilation Strategy
                </label>
                <select
                  id="ventilationStrategy"
                  name="ventilationStrategy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.ventilationStrategy || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="">Select ventilation strategy</option>
                  <option value="Cross-Ventilation">Cross-Ventilation</option>
                  <option value="Positive Pressure">Positive Pressure</option>
                  <option value="Negative Pressure">Negative Pressure</option>
                  <option value="Neutral Sealed">Neutral Sealed</option>
                </select>
              </div>
            </div>
            
            <div>
              <div className="mb-4">
                <div className="flex items-center">
                  <input
                    id="hvacSystemPresent"
                    name="hvacSystemPresent"
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={formik.values.hvacSystemPresent}
                    onChange={formik.handleChange}
                    disabled={isLoading}
                  />
                  <label htmlFor="hvacSystemPresent" className="ml-2 block text-sm text-gray-700">
                    HVAC System Present
                  </label>
                </div>
              </div>
              
              {formik.values.hvacSystemPresent && (
                <div className="mb-4">
                  <label htmlFor="hvacSystemType" className="block text-sm font-medium text-gray-700 mb-1">
                    HVAC System Type
                  </label>
                  <select
                    id="hvacSystemType"
                    name="hvacSystemType"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={formik.values.hvacSystemType || ''}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    disabled={isLoading}
                  >
                    <option value="">Select HVAC type</option>
                    <option value="Centralized">Centralized</option>
                    <option value="Distributed">Distributed</option>
                    <option value="Evaporative Cooling">Evaporative Cooling</option>
                    <option value="None">None</option>
                  </select>
                </div>
              )}
              
              <div className="mt-4">
                <div className="flex items-center">
                  <input
                    id="hasDeadZones"
                    name="hasDeadZones"
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={formik.values.hasDeadZones}
                    onChange={formik.handleChange}
                    disabled={isLoading}
                  />
                  <label htmlFor="hasDeadZones" className="ml-2 block text-sm text-gray-700">
                    Has Dead Zones (poor air circulation)
                  </label>
                </div>
                
                {formik.values.hasDeadZones && (
                  <div className="mt-2 ml-6">
                    <Input
                      label="Number of Dead Zones"
                      id="quantityDeadzones"
                      name="quantityDeadzones"
                      type="number"
                      value={formik.values.quantityDeadzones}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      error={formik.touched.quantityDeadzones && formik.errors.quantityDeadzones ? formik.errors.quantityDeadzones : undefined}
                      disabled={isLoading}
                      helperText="Valid range: 1-25"
                    />
                  </div>
                )}
              </div>
              
              <div className="mt-4">
                <Input
                  label="Regularly Opened Ports/Doors"
                  id="numRegularlyOpenedPorts"
                  name="numRegularlyOpenedPorts"
                  type="number"
                  value={formik.values.numRegularlyOpenedPorts}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.numRegularlyOpenedPorts && formik.errors.numRegularlyOpenedPorts ? formik.errors.numRegularlyOpenedPorts : undefined}
                  disabled={isLoading}
                  helperText="Number of doors or ports regularly opened"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Environmental Controls Section */}
        <div className="mt-6">
          <h4 className="text-md font-medium text-gray-700 mb-3">Environmental Controls</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="mb-4">
                <label htmlFor="irrigationSystemType" className="block text-sm font-medium text-gray-700 mb-1">
                  Irrigation System
                </label>
                <select
                  id="irrigationSystemType"
                  name="irrigationSystemType"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.irrigationSystemType || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="">Select irrigation system</option>
                  <option value="Drip">Drip</option>
                  <option value="Sprinkler">Sprinkler</option>
                  <option value="Hydroponic">Hydroponic</option>
                  <option value="Manual">Manual</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label htmlFor="lightingSystem" className="block text-sm font-medium text-gray-700 mb-1">
                  Lighting System
                </label>
                <select
                  id="lightingSystem"
                  name="lightingSystem"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.lightingSystem || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="">Select lighting system</option>
                  <option value="Natural Light Only">Natural Light Only</option>
                  <option value="LED">LED</option>
                  <option value="HPS">HPS</option>
                  <option value="Fluorescent">Fluorescent</option>
                </select>
              </div>
            </div>
            
            <div>
              <div className="mb-4">
                <label htmlFor="microbialRiskZone" className="block text-sm font-medium text-gray-700 mb-1">
                  Microbial Risk Zone
                </label>
                <select
                  id="microbialRiskZone"
                  name="microbialRiskZone"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formik.values.microbialRiskZone || 'Medium'}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  disabled={isLoading}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interior Working Surface Types
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Stainless Steel',
                    'Unfinished Concrete',
                    'Wood',
                    'Plastic',
                    'Granite',
                    'Other Non-Absorbative'
                  ].map((surfaceType) => (
                    <label key={surfaceType} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={formik.values.interiorWorkingSurfaceTypes?.includes(surfaceType) || false}
                        onChange={() => handleSurfaceTypeChange(surfaceType)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        disabled={isLoading}
                      />
                      <span className="ml-2 text-sm text-gray-700">{surfaceType}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Gasifier settings */}
      <div className="border-b border-gray-200 pb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Gasifier Settings</h3>
        
        <div className="mb-4">
          <Input
            label="Minimum Efficacious Gasifier Density (sq ft/bag)"
            id="minEfficaciousGasifierDensity"
            name="minEfficaciousGasifierDensity"
            type="number"
            value={formik.values.minEfficaciousGasifierDensity}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.minEfficaciousGasifierDensity && formik.errors.minEfficaciousGasifierDensity ? formik.errors.minEfficaciousGasifierDensity : undefined}
            disabled={isLoading}
            helperText="The number of square feet that one gasifier bag can effectively cover"
          />
        </div>
      </div>
      
      {/* Petri Templates Section */}
      <div className="border-b border-gray-200 pb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Petri Dish Templates</h3>
        
        {petriTemplates.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-600">No petri dish templates defined</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={handleAddPetriTemplate}
              disabled={isLoading}
            >
              Add Petri Template
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {petriTemplates.map((template, index) => (
              <NewSitePetriTemplateForm
                key={index}
                index={index}
                template={template}
                onUpdate={(updatedTemplate) => handleUpdatePetriTemplate(index, updatedTemplate)}
                onRemove={() => handleRemovePetriTemplate(index)}
                testId={`petri-template-${index}`}
              />
            ))}
            
            <div className="flex justify-center mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddPetriTemplate}
                icon={<Plus size={16} />}
                disabled={isLoading}
              >
                Add Petri Template
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Gasifier Templates Section */}
      <div className="border-b border-gray-200 pb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Gasifier Templates</h3>
        
        {gasifierTemplates.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-600">No gasifier templates defined</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={handleAddGasifierTemplate}
              disabled={isLoading}
            >
              Add Gasifier Template
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {gasifierTemplates.map((template, index) => (
              <NewSiteGasifierTemplateForm
                key={index}
                index={index}
                template={template}
                onUpdate={(updatedTemplate) => handleUpdateGasifierTemplate(index, updatedTemplate)}
                onRemove={() => handleRemoveGasifierTemplate(index)}
                testId={`gasifier-template-${index}`}
              />
            ))}
            
            <div className="flex justify-center mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddGasifierTemplate}
                icon={<Plus size={16} />}
                disabled={isLoading}
              >
                Add Gasifier Template
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Form Actions */}
      <div className="flex justify-end space-x-3">
        <Button 
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          icon={<X size={16} />}
        >
          Cancel
        </Button>
        <Button 
          type="submit"
          variant="primary"
          isLoading={isLoading}
          disabled={!formik.isValid || isLoading}
          icon={<Check size={16} />}
        >
          Save Template
        </Button>
      </div>
    </form>
  );
};

export default SiteTemplateForm;