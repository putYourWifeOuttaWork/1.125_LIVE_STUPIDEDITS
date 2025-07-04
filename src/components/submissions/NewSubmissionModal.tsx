import React, { useState, useEffect, useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { X, Plus, ChevronDown, ChevronUp, Check, AlertTriangle, CloudRain, Sun, Cloud, Thermometer, Droplets } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import { v4 as uuidv4 } from 'uuid';
import PetriForm, { PetriFormRef } from './PetriForm';
import GasifierForm, { GasifierFormRef } from './GasifierForm';
import { useSubmissions } from '../../hooks/useSubmissions';
import { toast } from 'react-toastify';
import { Site, PetriDefaults, GasifierDefaults } from '../../lib/types';
import ConfirmSubmissionModal from './ConfirmSubmissionModal';
import useWeather from '../../hooks/useWeather';
import useCompanies from '../../hooks/useCompanies';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import offlineStorage from '../../utils/offlineStorage';
import ObservationListManager from '../forms/ObservationListManager';
import TemplateWarningModal from './TemplateWarningModal';
import { createLogger } from '../../utils/logger';

// Create a logger for validation
const logger = createLogger('ValidationScroll');

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
});

interface NewSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  programId: string;
  onSubmissionCreated?: (submission: any) => void;
  existingSubmission?: any;
  existingPetriObservations?: any[];
  existingGasifierObservations?: any[];
  selectedSite?: Site;
  companyDefaultWeather?: 'Clear' | 'Cloudy' | 'Rain';
  initialWeather?: 'Clear' | 'Cloudy' | 'Rain';
  initialTemperature?: number;
  initialHumidity?: number;
  weatherData?: any;
  isWeatherLoading?: boolean;
}

const NewSubmissionModal = ({ 
  isOpen, 
  onClose, 
  siteId, 
  siteName,
  programId,
  onSubmissionCreated,
  existingSubmission,
  existingPetriObservations = [],
  existingGasifierObservations = [],
  selectedSite,
  companyDefaultWeather = 'Clear',
  initialWeather,
  initialTemperature,
  initialHumidity,
  weatherData,
  isWeatherLoading
}: NewSubmissionModalProps) => {
  const { createSubmission, updateSubmission, loading } = useSubmissions(siteId);
  const [petriForms, setPetriForms] = useState<{ id: string; ref: React.RefObject<PetriFormRef>; isValid: boolean; hasImage: boolean; isDirty: boolean; observationId?: string; }[]>([]);
  const [gasifierForms, setGasifierForms] = useState<{ id: string; ref: React.RefObject<GasifierFormRef>; isValid: boolean; hasImage: boolean; isDirty: boolean; observationId?: string; }[]>([]);
  const [submissionSessionId] = useState(`session-${Date.now()}`);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTemplateWarning, setShowTemplateWarning] = useState<'Petri' | 'Gasifier' | null>(null);
  const [isPetriAccordionOpen, setIsPetriAccordionOpen] = useState(true);
  const [isGasifierAccordionOpen, setIsGasifierAccordionOpen] = useState(true);
  const [isSiteDataAccordionOpen, setIsSiteDataAccordionOpen] = useState(true);
  const [allPetriFormsValid, setAllPetriFormsValid] = useState(false);
  const [allGasifierFormsValid, setAllGasifierFormsValid] = useState(false);
  const [allSiteDataValid, setAllSiteDataValid] = useState(false);
  const [petriData, setPetriData] = useState<any[]>([]);
  const [gasifierData, setGasifierData] = useState<any[]>([]);
  const [expectedPetriCount, setExpectedPetriCount] = useState(0);
  const [expectedGasifierCount, setExpectedGasifierCount] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const [initialValidationDone, setInitialValidationDone] = useState(false);
  const isOnline = useOnlineStatus();
  
  // Initialize form with default values or existing submission data
  const formik = useFormik({
    initialValues: {
      temperature: existingSubmission?.temperature || initialTemperature || 70,
      humidity: existingSubmission?.humidity || initialHumidity || 50,
      indoor_temperature: existingSubmission?.indoor_temperature || '',
      indoor_humidity: existingSubmission?.indoor_humidity || '',
      airflow: existingSubmission?.airflow || 'Open',
      odorDistance: existingSubmission?.odor_distance || '5-10ft',
      weather: existingSubmission?.weather || initialWeather || companyDefaultWeather || 'Clear',
      notes: existingSubmission?.notes || '',
    },
    validationSchema: SubmissionSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // Validate all petri forms
        const petriValidationPromises = petriForms.map(form => form.ref.current?.validate());
        const petriValidationResults = await Promise.all(petriValidationPromises);
        const allPetriValid = petriValidationResults.every(result => result);
        
        // Validate all gasifier forms
        const gasifierValidationPromises = gasifierForms.map(form => form.ref.current?.validate());
        const gasifierValidationResults = await Promise.all(gasifierValidationPromises);
        const allGasifierValid = gasifierValidationResults.every(result => result);
        
        if (!allPetriValid || !allGasifierValid) {
          // Find the first invalid form and scroll to it
          const firstInvalidPetriIndex = petriValidationResults.findIndex(result => !result);
          const firstInvalidGasifierIndex = gasifierValidationResults.findIndex(result => !result);
          
          if (firstInvalidPetriIndex !== -1) {
            setIsPetriAccordionOpen(true);
            const formElement = document.getElementById(`petri-form-${petriForms[firstInvalidPetriIndex].id}`);
            if (formElement) {
              logger.debug(`Scrolling to invalid petri form at index ${firstInvalidPetriIndex}`);
              formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Try to focus the first input element within the form
              const firstInput = formElement.querySelector('input, select, textarea');
              if (firstInput && firstInput instanceof HTMLElement) {
                setTimeout(() => {
                  firstInput.focus();
                }, 300);
              }
            }
            toast.error('Please complete all required fields in the Petri samples');
          } else if (firstInvalidGasifierIndex !== -1) {
            setIsGasifierAccordionOpen(true);
            const formElement = document.getElementById(`gasifier-form-${gasifierForms[firstInvalidGasifierIndex].id}`);
            if (formElement) {
              logger.debug(`Scrolling to invalid gasifier form at index ${firstInvalidGasifierIndex}`);
              formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Try to focus the first input element within the form
              const firstInput = formElement.querySelector('input, select, textarea');
              if (firstInput && firstInput instanceof HTMLElement) {
                setTimeout(() => {
                  firstInput.focus();
                }, 300);
              }
            }
            toast.error('Please complete all required fields in the Gasifier samples');
          }
          
          return;
        }
        
        // Check site data validation
        const siteDataErrors = Object.keys(formik.errors);
        if (siteDataErrors.length > 0) {
          setIsSiteDataAccordionOpen(true);
          
          // Find the first error field and scroll to it
          const firstErrorField = siteDataErrors[0];
          logger.debug(`Form has ${siteDataErrors.length} errors. First error: ${firstErrorField}`);
          
          // Touch the field to show the error
          formik.setFieldTouched(firstErrorField, true);
          
          // Scroll to the field
          setTimeout(() => {
            const errorElement = document.getElementById(firstErrorField);
            if (errorElement) {
              logger.debug(`Scrolling to invalid field: ${firstErrorField}`);
              errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              errorElement.focus();
            } else {
              // If element not found directly, try with id prefix for radio buttons
              const siteDataSection = document.getElementById('site-data-section');
              if (siteDataSection) {
                logger.debug(`Scrolling to site data section`);
                siteDataSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          }, 100);
          
          toast.error('Please correct the errors in the Site Data section');
          return;
        }
        
        // Check if we have fewer samples than expected
        const currentPetriCount = petriData.filter(p => p.isValid).length;
        const currentGasifierCount = gasifierData.filter(g => g.isValid).length;
        
        if (currentPetriCount < expectedPetriCount || currentGasifierCount < expectedGasifierCount) {
          setShowConfirmModal(true);
          return;
        }
        
        await submitData(values);
      } catch (error) {
        console.error('Error in form submission:', error);
        toast.error('An error occurred while submitting the form');
      }
    },
    validateOnMount: !!existingSubmission, // Validate immediately for existing submissions
  });
  
  // Function to submit the data
  const submitData = async (values: any) => {
    try {
      // Clean up any temporary images that might be left over
      try {
        await offlineStorage.clearTempImagesForSubmission(submissionSessionId);
      } catch (err) {
        console.error('Error cleaning up temp images:', err);
      }
      
      // Parse indoor temperature and humidity values
      const indoorTemperature = values.indoor_temperature ? parseFloat(values.indoor_temperature) : null;
      const indoorHumidity = values.indoor_humidity ? parseFloat(values.indoor_humidity) : null;
      
      if (existingSubmission) {
        // Update existing submission
        const updated = await updateSubmission(
          existingSubmission.submission_id,
          parseFloat(values.temperature),
          parseFloat(values.humidity),
          values.airflow,
          values.odorDistance,
          values.weather,
          values.notes || null,
          petriData,
          gasifierData,
          undefined,
          indoorTemperature,
          indoorHumidity
        );
        
        if (updated) {
          toast.success('Submission updated successfully!');
          if (onSubmissionCreated) {
            onSubmissionCreated(updated);
          }
          onClose();
        }
      } else {
        // Create new submission
        const created = await createSubmission(
          parseFloat(values.temperature),
          parseFloat(values.humidity),
          values.airflow,
          values.odorDistance,
          values.weather,
          values.notes || null,
          petriData,
          gasifierData,
          undefined,
          indoorTemperature,
          indoorHumidity
        );
        
        if (created) {
          toast.success('Submission created successfully!');
          if (onSubmissionCreated) {
            onSubmissionCreated(created);
          }
          onClose();
        }
      }
    } catch (error) {
      console.error('Error submitting data:', error);
      toast.error('An error occurred while submitting the data');
    }
  };
  
  // Initialize petri forms from existing observations or defaults
  useEffect(() => {
    if (!isOpen) return;
    
    let initialPetriForms: { id: string; ref: React.RefObject<PetriFormRef>; isValid: boolean; hasImage: boolean; isDirty: boolean; observationId?: string; }[] = [];
    
    // If we have existing observations, create forms for them
    if (existingPetriObservations && existingPetriObservations.length > 0) {
      initialPetriForms = existingPetriObservations.map(obs => {
        const formRef = React.createRef<PetriFormRef>();
        return { 
          id: obs.observation_id, 
          ref: formRef, 
          isValid: true,
          hasImage: !!obs.image_url,
          isDirty: false,
          observationId: obs.observation_id
        };
      });
    } 
    // Otherwise, if we have site defaults, create forms for them
    else if (selectedSite?.petri_defaults && selectedSite.petri_defaults.length > 0) {
      initialPetriForms = (selectedSite.petri_defaults as PetriDefaults[]).map(() => {
        const formRef = React.createRef<PetriFormRef>();
        return { 
          id: uuidv4(), 
          ref: formRef, 
          isValid: false,
          hasImage: false,
          isDirty: false
        };
      });
    } 
    // Otherwise, create one empty form
    else {
      const formRef = React.createRef<PetriFormRef>();
      initialPetriForms = [{ 
        id: uuidv4(), 
        ref: formRef, 
        isValid: false,
        hasImage: false,
        isDirty: false
      }];
    }
    
    setPetriForms(initialPetriForms);
    setExpectedPetriCount(selectedSite?.petri_defaults?.length || 0);
  }, [isOpen, existingPetriObservations, selectedSite?.petri_defaults]);
  
  // Initialize gasifier forms from existing observations or defaults
  useEffect(() => {
    if (!isOpen) return;
    
    let initialGasifierForms: { id: string; ref: React.RefObject<GasifierFormRef>; isValid: boolean; hasImage: boolean; isDirty: boolean; observationId?: string; }[] = [];
    
    // If we have existing observations, create forms for them
    if (existingGasifierObservations && existingGasifierObservations.length > 0) {
      initialGasifierForms = existingGasifierObservations.map(obs => {
        const formRef = React.createRef<GasifierFormRef>();
        return { 
          id: obs.observation_id, 
          ref: formRef, 
          isValid: true,
          hasImage: !!obs.image_url,
          isDirty: false,
          observationId: obs.observation_id
        };
      });
    } 
    // Otherwise, if we have site defaults, create forms for them
    else if (selectedSite?.gasifier_defaults && Array.isArray(selectedSite.gasifier_defaults) && selectedSite.gasifier_defaults.length > 0) {
      initialGasifierForms = (selectedSite.gasifier_defaults as GasifierDefaults[]).map(() => {
        const formRef = React.createRef<GasifierFormRef>();
        return { 
          id: uuidv4(), 
          ref: formRef, 
          isValid: false,
          hasImage: false,
          isDirty: false
        };
      });
    } 
    // Otherwise, create one empty form
    else {
      const formRef = React.createRef<GasifierFormRef>();
      initialGasifierForms = [{ 
        id: uuidv4(), 
        ref: formRef, 
        isValid: false,
        hasImage: false,
        isDirty: false
      }];
    }
    
    setGasifierForms(initialGasifierForms);
    setExpectedGasifierCount(selectedSite?.gasifier_defaults?.length || 0);
  }, [isOpen, existingGasifierObservations, selectedSite?.gasifier_defaults]);
  
  // Initialize form values from site defaults if available
  useEffect(() => {
    if (!isOpen || !selectedSite || existingSubmission) return;
    
    // Prepare values object with current form values
    const updatedValues = { ...formik.values };
    
    // IMPORTANT FIX: Prioritize initialTemperature and initialHumidity from Weather API
    // Only use site defaults if Weather API values are not available
    
    // For temperature: prefer API value, fall back to site default
    if (initialTemperature !== undefined && initialTemperature !== null) {
      updatedValues.temperature = initialTemperature.toString();
    } else if (selectedSite.default_temperature) {
      updatedValues.temperature = selectedSite.default_temperature.toString();
    }
    
    // For humidity: prefer API value, fall back to site default
    if (initialHumidity !== undefined && initialHumidity !== null) {
      updatedValues.humidity = initialHumidity.toString();
    } else if (selectedSite.default_humidity) {
      updatedValues.humidity = selectedSite.default_humidity.toString();
    }
    
    // Check if site has submission defaults for other fields
    if (selectedSite.submission_defaults) {
      const defaults = selectedSite.submission_defaults;
      
      // Set other default values (but not temperature or humidity which we handled above)
      if (defaults.indoor_temperature) {
        updatedValues.indoor_temperature = defaults.indoor_temperature.toString();
      } else if (selectedSite.default_indoor_temperature) {
        updatedValues.indoor_temperature = selectedSite.default_indoor_temperature.toString();
      }
      
      if (defaults.indoor_humidity) {
        updatedValues.indoor_humidity = defaults.indoor_humidity.toString();
      } else if (selectedSite.default_indoor_humidity) {
        updatedValues.indoor_humidity = selectedSite.default_indoor_humidity.toString();
      }
      
      if (defaults.airflow) {
        updatedValues.airflow = defaults.airflow;
      }
      
      if (defaults.odor_distance) {
        updatedValues.odorDistance = defaults.odor_distance;
      }
      
      // For weather, prioritize initialWeather, then site default, then company default
      if (initialWeather) {
        updatedValues.weather = initialWeather;
      } else if (defaults.weather) {
        updatedValues.weather = defaults.weather;
      } else if (selectedSite.default_weather) {
        updatedValues.weather = selectedSite.default_weather;
      } else if (companyDefaultWeather) {
        updatedValues.weather = companyDefaultWeather;
      }
      
      if (defaults.notes) {
        updatedValues.notes = defaults.notes;
      }
    } else {
      // Handle case where submission_defaults is not available but individual defaults are
      if (selectedSite.default_indoor_temperature) {
        updatedValues.indoor_temperature = selectedSite.default_indoor_temperature.toString();
      }
      
      if (selectedSite.default_indoor_humidity) {
        updatedValues.indoor_humidity = selectedSite.default_indoor_humidity.toString();
      }
      
      // For weather, prioritize initialWeather, then site default, then company default
      if (initialWeather) {
        updatedValues.weather = initialWeather;
      } else if (selectedSite.default_weather) {
        updatedValues.weather = selectedSite.default_weather;
      } else if (companyDefaultWeather) {
        updatedValues.weather = companyDefaultWeather;
      }
    }
    
    // Fix: Only update form values if they're different from current values
    // Convert to JSON strings for deep comparison
    const currentValuesStr = JSON.stringify(formik.values);
    const updatedValuesStr = JSON.stringify(updatedValues);
    
    if (currentValuesStr !== updatedValuesStr) {
      formik.setValues(updatedValues);
    }
  }, [isOpen, selectedSite, existingSubmission, initialWeather, companyDefaultWeather, initialTemperature, initialHumidity, formik]);

  // Initial validation for existing submissions
  useEffect(() => {
    if (isOpen && existingSubmission && !initialValidationDone) {
      // Validate all form data immediately for existing submissions
      Promise.all([
        formik.validateForm(),
        ...petriForms.map(form => form.ref.current?.validate() || Promise.resolve(false)),
        ...gasifierForms.map(form => form.ref.current?.validate() || Promise.resolve(false)),
      ]).then(() => {
        // Mark all formik fields as touched to show any validation errors
        Object.keys(formik.values).forEach(key => {
          formik.setFieldTouched(key, true, false);
        });
        
        // Update the initial validation flag
        setInitialValidationDone(true);
      });
    }
  }, [isOpen, existingSubmission, formik, petriForms, gasifierForms, initialValidationDone]);
  
  // Create a function for adding a new petri form
  const addPetriForm = () => {
    const newFormId = uuidv4();
    const formRef = React.createRef<PetriFormRef>();
    setPetriForms([...petriForms, { id: newFormId, ref: formRef, isValid: false, hasImage: false, isDirty: true }]);
    
    // If there are petri defaults in the site, show a warning
    if (selectedSite?.petri_defaults && Array.isArray(selectedSite.petri_defaults) && selectedSite.petri_defaults.length > 0) {
      setShowTemplateWarning('Petri');
    }
  };
  
  // Create a function for adding a new gasifier form
  const addGasifierForm = () => {
    const newFormId = uuidv4();
    const formRef = React.createRef<GasifierFormRef>();
    setGasifierForms([...gasifierForms, { id: newFormId, ref: formRef, isValid: false, hasImage: false, isDirty: true }]);
    
    // If there are gasifier defaults in the site, show a warning
    if (selectedSite?.gasifier_defaults && Array.isArray(selectedSite.gasifier_defaults) && selectedSite.gasifier_defaults.length > 0) {
      setShowTemplateWarning('Gasifier');
    }
  };
  
  // Update petri data when a form changes
  const handlePetriUpdate = (formId: string, data: any) => {
    // Update the petriData state
    setPetriData(prevData => {
      const existingIndex = prevData.findIndex(item => item.formId === formId);
      if (existingIndex >= 0) {
        const newData = [...prevData];
        newData[existingIndex] = { ...data, formId };
        return newData;
      } else {
        return [...prevData, { ...data, formId }];
      }
    });
    
    // Update the form's validity in the petriForms state
    setPetriForms(prevForms => {
      return prevForms.map(form => {
        if (form.id === formId) {
          return { 
            ...form, 
            isValid: data.isValid, 
            hasImage: data.hasImage,
            isDirty: data.isDirty,
            observationId: data.observationId // Ensure observationId is properly stored
          };
        }
        return form;
      });
    });
  };
  
  // Update gasifier data when a form changes
  const handleGasifierUpdate = (formId: string, data: any) => {
    // Update the gasifierData state
    setGasifierData(prevData => {
      const existingIndex = prevData.findIndex(item => item.formId === formId);
      if (existingIndex >= 0) {
        const newData = [...prevData];
        newData[existingIndex] = { ...data, formId };
        return newData;
      } else {
        return [...prevData, { ...data, formId }];
      }
    });
    
    // Update the form's validity in the gasifierForms state
    setGasifierForms(prevForms => {
      return prevForms.map(form => {
        if (form.id === formId) {
          return { 
            ...form, 
            isValid: data.isValid, 
            hasImage: data.hasImage,
            isDirty: data.isDirty,
            observationId: data.observationId // Ensure observationId is properly stored
          };
        }
        return form;
      });
    });
  };
  
  // Create a reusable renderPetriForm function for ObservationListManager
  const renderPetriForm = (
    observation: any, 
    index: number, 
    onUpdate: (data: any) => void, 
    onRemove: () => void, 
    showRemoveButton: boolean, 
    disabled: boolean
  ) => {
    // Get initial data from existing observations or site defaults
    const initialData = existingPetriObservations && existingPetriObservations[index-1] 
      ? {
          petriCode: existingPetriObservations[index-1].petri_code,
          imageUrl: existingPetriObservations[index-1].image_url,
          plantType: existingPetriObservations[index-1].plant_type,
          fungicideUsed: existingPetriObservations[index-1].fungicide_used,
          surroundingWaterSchedule: existingPetriObservations[index-1].surrounding_water_schedule,
          notes: existingPetriObservations[index-1].notes || '',
          observationId: existingPetriObservations[index-1].observation_id,
          placement: existingPetriObservations[index-1].placement,
          placement_dynamics: existingPetriObservations[index-1].placement_dynamics
        } 
      : selectedSite?.petri_defaults && selectedSite.petri_defaults[index-1] 
        ? {
            petriCode: (selectedSite.petri_defaults[index-1] as PetriDefaults).petri_code,
            plantType: (selectedSite.petri_defaults[index-1] as PetriDefaults).plant_type,
            fungicideUsed: (selectedSite.petri_defaults[index-1] as PetriDefaults).fungicide_used,
            surroundingWaterSchedule: (selectedSite.petri_defaults[index-1] as PetriDefaults).surrounding_water_schedule,
            notes: (selectedSite.petri_defaults[index-1] as PetriDefaults).notes || '',
            placement: (selectedSite.petri_defaults[index-1] as PetriDefaults).placement,
            placement_dynamics: (selectedSite.petri_defaults[index-1] as PetriDefaults).placement_dynamics
          } 
        : undefined;
    
    return (
      <PetriForm
        key={observation.id}
        id={`petri-form-${observation.id}`}
        formId={observation.id}
        index={index}
        siteId={siteId}
        submissionSessionId={submissionSessionId}
        ref={observation.ref}
        onUpdate={onUpdate}
        onRemove={onRemove}
        showRemoveButton={showRemoveButton}
        initialData={initialData}
        disabled={disabled}
        observationId={observation.observationId}
      />
    );
  };
  
  // Create a reusable renderGasifierForm function for ObservationListManager
  const renderGasifierForm = (
    observation: any, 
    index: number, 
    onUpdate: (data: any) => void, 
    onRemove: () => void, 
    showRemoveButton: boolean, 
    disabled: boolean
  ) => {
    // Get initial data from existing observations or site defaults
    let initialData = undefined;
    
    if (existingGasifierObservations && existingGasifierObservations[index-1]) {
      // Use existing observation data if available
      initialData = {
        gasifierCode: existingGasifierObservations[index-1].gasifier_code,
        imageUrl: existingGasifierObservations[index-1].image_url,
        chemicalType: existingGasifierObservations[index-1].chemical_type,
        measure: existingGasifierObservations[index-1].measure,
        anomaly: existingGasifierObservations[index-1].anomaly,
        placementHeight: existingGasifierObservations[index-1].placement_height,
        directionalPlacement: existingGasifierObservations[index-1].directional_placement,
        placementStrategy: existingGasifierObservations[index-1].placement_strategy,
        notes: existingGasifierObservations[index-1].notes || '',
        observationId: existingGasifierObservations[index-1].observation_id
      };
    } else if (selectedSite?.gasifier_defaults && Array.isArray(selectedSite.gasifier_defaults) && selectedSite.gasifier_defaults.length > index-1) {
      // Use site default data if available
      const defaultData = selectedSite.gasifier_defaults[index-1] as GasifierDefaults;
      initialData = {
        gasifierCode: defaultData.gasifier_code,
        chemicalType: defaultData.chemical_type,
        placementHeight: defaultData.placement_height,
        directionalPlacement: defaultData.directional_placement,
        placementStrategy: defaultData.placement_strategy,
        notes: defaultData.notes || '',
        anomaly: false,
        measure: null
      };
    }
    
    return (
      <GasifierForm
        key={observation.id}
        id={`gasifier-form-${observation.id}`}
        formId={observation.id}
        index={index}
        siteId={siteId}
        submissionSessionId={submissionSessionId}
        ref={observation.ref}
        onUpdate={onUpdate}
        onRemove={onRemove}
        showRemoveButton={showRemoveButton}
        initialData={initialData}
        disabled={disabled}
        observationId={observation.observationId}
      />
    );
  };
  
  // Create empty observation form objects
  const createEmptyPetriObservation = () => {
    const id = uuidv4();
    const ref = React.createRef<PetriFormRef>();
    return { id, ref, isValid: false, hasImage: false, isDirty: false };
  };
  
  const createEmptyGasifierObservation = () => {
    const id = uuidv4();
    const ref = React.createRef<GasifierFormRef>();
    return { id, ref, isValid: false, hasImage: false, isDirty: false };
  };
  
  // Check if all petri forms are valid
  useEffect(() => {
    const allValid = petriForms.length > 0 && petriForms.every(form => form.isValid);
    setAllPetriFormsValid(allValid);
  }, [petriForms]);
  
  // Check if all gasifier forms are valid
  useEffect(() => {
    const allValid = gasifierForms.length > 0 && gasifierForms.every(form => form.isValid);
    setAllGasifierFormsValid(allValid);
  }, [gasifierForms]);
  
  // Check if site data is valid - modified to handle existing submission cases better
  useEffect(() => {
    // For existing submissions, rely on formik.isValid
    if (existingSubmission) {
      setAllSiteDataValid(formik.isValid);
    } else {
      // For new submissions, check if form is valid and has been touched
      const isValid = formik.isValid && Object.keys(formik.touched).length > 0;
      setAllSiteDataValid(isValid);
    }
  }, [formik.isValid, formik.touched, existingSubmission]);
  
  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  // Prevent scrolling of the body when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  // Validate form and scroll to first error
  const validateAndScrollToError = () => {
    let hasErrors = false;
    let errorField: string | null = null;
    
    // Validate site data
    const siteDataErrors = Object.keys(formik.errors);
    if (siteDataErrors.length > 0) {
      hasErrors = true;
      errorField = siteDataErrors[0];
      setIsSiteDataAccordionOpen(true);
      
      logger.debug(`Found ${siteDataErrors.length} site data errors. First error: ${errorField}`);
      
      // Touch the field to show the error
      formik.setFieldTouched(errorField, true);
      
      // Scroll to the field
      setTimeout(() => {
        const errorElement = document.getElementById(errorField!);
        if (errorElement) {
          logger.debug(`Scrolling to site data field: ${errorField}`);
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          errorElement.focus();
        } else {
          // If element not found directly, try scrolling to the section
          const siteDataSection = document.getElementById('site-data-section');
          if (siteDataSection) {
            logger.debug(`Scrolling to site data section`);
            siteDataSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }, 100);
      
      return hasErrors;
    }
    
    return hasErrors;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto" data-testid="new-submission-modal">
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 flex justify-between items-center p-4">
          <h2 className="text-xl font-semibold">
            {existingSubmission ? 'Edit Submission' : 'New Submission'} - {siteName}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close modal"
            data-testid="close-submission-modal"
            type="button"
          >
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={formik.handleSubmit} className="p-4">
          {/* Petri Samples Section */}
          <div className="mb-6 border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full p-4 bg-gray-50 flex justify-between items-center text-left"
              onClick={() => setIsPetriAccordionOpen(!isPetriAccordionOpen)}
              data-testid="petri-accordion-toggle"
              aria-expanded={isPetriAccordionOpen}
              aria-controls="petri-observations-panel"
            >
              <div className="flex items-center">
                <span className="font-medium">Petri Samples</span>
                <span className={`ml-2 text-sm px-2 py-0.5 rounded-full ${
                  allPetriFormsValid ? 'bg-success-100 text-success-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {petriForms.filter(form => form.isValid).length}/{petriForms.length} Valid
                </span>
              </div>
              {isPetriAccordionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            <div 
              id="petri-observations-panel" 
              aria-labelledby="petri-observations-header"
              hidden={!isPetriAccordionOpen}
            >
              <ObservationListManager
                observations={petriForms}
                setObservations={setPetriForms}
                isAccordionOpen={isPetriAccordionOpen}
                setIsAccordionOpen={setIsPetriAccordionOpen}
                addButtonText="Add Petri Sample"
                templateWarningEntityType="Petri"
                onShowTemplateWarning={setShowTemplateWarning}
                disabled={false}
                createEmptyObservation={createEmptyPetriObservation}
                renderFormComponent={(observation, index, onUpdate, onRemove, showRemoveButton, disabled) => {
                  return renderPetriForm(
                    observation, 
                    index, 
                    (data) => handlePetriUpdate(observation.id, data),
                    onRemove,
                    showRemoveButton,
                    disabled
                  );
                }}
                testId="petri-observations-manager"
              />
            </div>
          </div>
          
          {/* Gasifier Samples Section */}
          <div className="mb-6 border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full p-4 bg-gray-50 flex justify-between items-center text-left"
              onClick={() => setIsGasifierAccordionOpen(!isGasifierAccordionOpen)}
              data-testid="gasifier-accordion-toggle"
              aria-expanded={isGasifierAccordionOpen}
              aria-controls="gasifier-observations-panel"
            >
              <div className="flex items-center">
                <span className="font-medium">Gasifier Samples</span>
                <span className={`ml-2 text-sm px-2 py-0.5 rounded-full ${
                  allGasifierFormsValid ? 'bg-success-100 text-success-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {gasifierForms.filter(form => form.isValid).length}/{gasifierForms.length} Valid
                </span>
              </div>
              {isGasifierAccordionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            <div 
              id="gasifier-observations-panel" 
              aria-labelledby="gasifier-observations-header"
              hidden={!isGasifierAccordionOpen}
            >
              <ObservationListManager
                observations={gasifierForms}
                setObservations={setGasifierForms}
                isAccordionOpen={isGasifierAccordionOpen}
                setIsAccordionOpen={setIsGasifierAccordionOpen}
                addButtonText="Add Gasifier Sample"
                templateWarningEntityType="Gasifier"
                onShowTemplateWarning={setShowTemplateWarning}
                disabled={false}
                createEmptyObservation={createEmptyGasifierObservation}
                renderFormComponent={(observation, index, onUpdate, onRemove, showRemoveButton, disabled) => {
                  return renderGasifierForm(
                    observation, 
                    index, 
                    (data) => handleGasifierUpdate(observation.id, data),
                    onRemove,
                    showRemoveButton,
                    disabled
                  );
                }}
                testId="gasifier-observations-manager"
              />
            </div>
          </div>
          
          {/* Site Data Section */}
          <div id="site-data-section" className="mb-6 border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full p-4 bg-gray-50 flex justify-between items-center text-left"
              onClick={() => setIsSiteDataAccordionOpen(!isSiteDataAccordionOpen)}
              data-testid="site-data-accordion-toggle"
              aria-expanded={isSiteDataAccordionOpen}
              aria-controls="site-data-panel"
            >
              <div className="flex items-center">
                <span className="font-medium">Site Data</span>
                <span className={`ml-2 text-sm px-2 py-0.5 rounded-full ${
                  allSiteDataValid ? 'bg-success-100 text-success-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {allSiteDataValid ? <Check size={12} className="mr-1" /> : null}
                  {allSiteDataValid ? 'Valid' : 'Incomplete'}
                </span>
              </div>
              {isSiteDataAccordionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            <div 
              id="site-data-panel" 
              aria-labelledby="site-data-header"
              hidden={!isSiteDataAccordionOpen}
            >
              <div className="p-4 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                        data-testid="airflow-select"
                        aria-invalid={formik.touched.airflow && !!formik.errors.airflow}
                        aria-describedby={formik.touched.airflow && formik.errors.airflow ? "airflow-error" : undefined}
                      >
                        <option value="Open">Open</option>
                        <option value="Closed">Closed</option>
                      </select>
                      {formik.touched.airflow && formik.errors.airflow && (
                        <p id="airflow-error" className="mt-1 text-sm text-error-600">{formik.errors.airflow}</p>
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
                        data-testid="odor-distance-select"
                        aria-invalid={formik.touched.odorDistance && !!formik.errors.odorDistance}
                        aria-describedby={formik.touched.odorDistance && formik.errors.odorDistance ? "odor-distance-error" : undefined}
                      >
                        <option value="5-10ft">5-10 ft</option>
                        <option value="10-25ft">10-25 ft</option>
                        <option value="25-50ft">25-50 ft</option>
                        <option value="50-100ft">50-100 ft</option>
                        <option value=">100ft">More than 100 ft</option>
                      </select>
                      {formik.touched.odorDistance && formik.errors.odorDistance && (
                        <p id="odor-distance-error" className="mt-1 text-sm text-error-600">{formik.errors.odorDistance}</p>
                      )}
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
                      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="weather-group-label">
                        <button
                          type="button"
                          onClick={() => formik.setFieldValue('weather', 'Clear')}
                          className={`flex flex-col items-center p-3 rounded-md transition-colors ${
                            formik.values.weather === 'Clear'
                              ? 'bg-yellow-100 border-yellow-200 border text-yellow-800'
                              : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                          }`}
                          data-testid="weather-clear-button"
                          aria-checked={formik.values.weather === 'Clear'}
                          role="radio"
                          id="weather-clear"
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
                          data-testid="weather-cloudy-button"
                          aria-checked={formik.values.weather === 'Cloudy'}
                          role="radio"
                          id="weather-cloudy"
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
                          data-testid="weather-rain-button"
                          aria-checked={formik.values.weather === 'Rain'}
                          role="radio"
                          id="weather-rain"
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
                    {weatherData && !isWeatherLoading && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <p className="text-sm font-medium text-gray-700">Current Weather:</p>
                        <div className="flex items-center mt-1">
                          <div className="text-sm">
                            <span className="text-gray-600">{weatherData.temp}°F, {weatherData.RelativeHumidity || weatherData.humidity}% humidity</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
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
                    data-testid="notes-textarea"
                    aria-invalid={formik.touched.notes && !!formik.errors.notes}
                    aria-describedby={formik.touched.notes && formik.errors.notes ? "notes-error" : undefined}
                  ></textarea>
                  {formik.touched.notes && formik.errors.notes && (
                    <p id="notes-error" className="mt-1 text-sm text-error-600">{formik.errors.notes}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button 
              type="button"
              variant="outline"
              onClick={onClose}
              testId="cancel-submission-button"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              variant="primary"
              isLoading={loading}
              disabled={!(formik.isValid && (petriForms.some(form => form.isValid) || gasifierForms.some(form => form.isValid)))}
              testId="submit-submission-button"
              onClick={() => {
                // Pre-validate to show errors before submit
                if (!formik.isValid) {
                  // Make sure all fields are touched to show errors
                  Object.keys(formik.values).forEach(field => {
                    formik.setFieldTouched(field, true);
                  });
                  
                  // Check if validation scrolling is needed
                  const needsScroll = validateAndScrollToError();
                  if (needsScroll) {
                    logger.debug('Validation errors found, form submission prevented');
                    return false; // Prevent form submission if errors found
                  }
                }
                
                return true; // Allow form submission if no errors
              }}
            >
              {existingSubmission ? 'Update Submission' : 'Create Submission'}
            </Button>
          </div>
        </form>
        
        <ConfirmSubmissionModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={() => submitData(formik.values)}
          currentPetriCount={petriData.filter(p => p.isValid).length}
          currentGasifierCount={gasifierData.filter(g => g.isValid).length}
          expectedPetriCount={expectedPetriCount}
          expectedGasifierCount={expectedGasifierCount}
          siteName={siteName}
        />
        
        <TemplateWarningModal
          isOpen={!!showTemplateWarning}
          onClose={() => setShowTemplateWarning(null)}
          onConfirm={() => {}}
          entityType={showTemplateWarning || 'Petri'}
        />
      </div>
    </div>
  );
};

export default NewSubmissionModal;