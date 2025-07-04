import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Trash2, MapPin, ChevronDown, ChevronUp, SplitSquareVertical } from 'lucide-react';
import Button from '../common/Button';
import ImageUploadField from '../common/ImageUploadField';
import { PetriPlacement, PetriPlacementDynamics } from '../../lib/types';
import { createLogger } from '../../utils/logger';

// Create a component-specific logger
const logger = createLogger('PetriForm');

interface PetriFormProps {
  id: string;
  formId: string;
  index: number;
  siteId: string;
  submissionSessionId: string;
  onUpdate: (formId: string, data: {
    petriCode: string;
    imageFile: File | null;
    imageUrl?: string;
    tempImageKey?: string;
    plantType: string;
    fungicideUsed: 'Yes' | 'No';
    surroundingWaterSchedule: string;
    notes: string;
    placement?: string | null;
    placement_dynamics?: string | null;
    outdoor_temperature?: number;
    outdoor_humidity?: number;
    isValid: boolean;
    hasData: boolean;
    hasImage: boolean;
    observationId?: string;
    isDirty: boolean;
    is_image_split?: boolean;
    is_split_source?: boolean;
    split_processed?: boolean;
    phase_observation_settings?: any;
    main_petri_id?: string;
  }) => void;
  onRemove: () => void;
  showRemoveButton: boolean;
  initialData?: {
    petriCode: string;
    imageUrl?: string;
    tempImageKey?: string;
    plantType: string;
    fungicideUsed: 'Yes' | 'No';
    surroundingWaterSchedule: string;
    notes: string;
    placement?: PetriPlacement;
    placement_dynamics?: PetriPlacementDynamics;
    observationId?: string;
    outdoor_temperature?: number;
    outdoor_humidity?: number;
    is_image_split?: boolean;
    is_split_source?: boolean;
    split_processed?: boolean;
    phase_observation_settings?: any;
    main_petri_id?: string;
  };
  disabled?: boolean;
  observationId?: string;
  submissionOutdoorTemperature?: number;
  submissionOutdoorHumidity?: number;
}

export interface PetriFormRef {
  validate: () => Promise<boolean>;
  petriCode: string;
  resetDirty: () => void;
}

const waterScheduleOptions = [
  'Daily',
  'Every Other Day',
  'Every Third Day',
  'Twice Daily',
  'Thrice Daily'
] as const;

const petriPlacementOptions: PetriPlacement[] = [
  'Center-Center',
  'Center-Right', 
  'Center-Left', 
  'Front-Left', 
  'Front-Right', 
  'Front-Center', 
  'Back-Center', 
  'Back-Right', 
  'Back-Left'
];

const PetriFormSchema = Yup.object().shape({
  petriCode: Yup.string()
    .required('Petri code is required'),
  fungicideUsed: Yup.string()
    .oneOf(['Yes', 'No'], 'Please select Yes or No')
    .required('This field is required'),
  surroundingWaterSchedule: Yup.string()
    .oneOf([...waterScheduleOptions], 'Please select a valid watering schedule')
    .required('Surrounding water schedule is required'),
  notes: Yup.string()
    .max(200, 'Notes must be less than 200 characters'),
  placement: Yup.string()
    .nullable()
    .oneOf([...petriPlacementOptions, null], 'Please select a valid placement')
});

const PetriForm = forwardRef<PetriFormRef, PetriFormProps>(({ 
  id,
  formId, 
  index, 
  siteId,
  submissionSessionId,
  onUpdate, 
  onRemove,
  showRemoveButton,
  initialData,
  disabled = false,
  observationId,
  submissionOutdoorTemperature,
  submissionOutdoorHumidity
}, ref) => {
  // Don't render child split petri forms (only show the source/parent form)
  if (initialData?.is_image_split && !initialData?.is_split_source && initialData?.main_petri_id) {
    return null;
  }

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [tempImageKey, setTempImageKey] = useState<string | undefined>(initialData?.tempImageKey);
  const [imageUrl, setImageUrl] = useState<string | undefined>(initialData?.imageUrl);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  const formik = useFormik({
    initialValues: {
      petriCode: initialData?.petriCode || '',
      fungicideUsed: initialData?.fungicideUsed || 'No' as 'Yes' | 'No',
      surroundingWaterSchedule: initialData?.surroundingWaterSchedule || '',
      notes: initialData?.notes || '',
      placement: initialData?.placement || null,
      // Only use values from initialData, not from submission
      outdoor_temperature: initialData?.outdoor_temperature || null,
      outdoor_humidity: initialData?.outdoor_humidity || null,
      is_image_split: initialData?.is_image_split || false,
      is_split_source: initialData?.is_split_source || false,
      split_processed: initialData?.split_processed || false,
      phase_observation_settings: initialData?.phase_observation_settings || null,
      main_petri_id: initialData?.main_petri_id || null
    },
    validationSchema: PetriFormSchema,
    validateOnMount: !!initialData,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: () => {},
  });

  useImperativeHandle(ref, () => ({
    validate: async () => {
      const errors = await formik.validateForm();
      
      Object.keys(formik.values).forEach(field => {
        formik.setFieldTouched(field, true);
      });
      
      // Check for image only if we don't already have one
      if (!hasImage) {
        return false;
      }
      
      return Object.keys(errors).length === 0;
    },
    petriCode: formik.values.petriCode,
    resetDirty: () => {
      setIsDirty(false);
    }
  }));
  
  const hasImage = !!imageFile || !!(initialData?.observationId && initialData?.imageUrl) || !!tempImageKey;
  
  // Check if form has basic data to be considered for saving as draft
  const hasData = !!observationId || !!initialData?.observationId || 
                  !!formik.values.petriCode || 
                  !!formik.values.surroundingWaterSchedule || 
                  formik.values.fungicideUsed !== 'No' || 
                  !!formik.values.notes;
  
  // Form is valid if it has petri code, surrounding water schedule, fungicide used, and image
  const isValid = !!formik.values.petriCode && 
                 !!formik.values.surroundingWaterSchedule && 
                 !!formik.values.fungicideUsed &&
                 hasImage;
  
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Field change handler to mark form as dirty
  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    formik.handleChange(e);
    setIsDirty(true);
  };

  // Handle checkbox and select field changes with dirty tracking
  const handleFieldValueChange = (field: string, value: any) => {
    formik.setFieldValue(field, value);
    setIsDirty(true);
  };

  // Handle image change from ImageUploadField
  const handleImageChange = (data: { 
    file: File | null;
    tempImageKey?: string;
    imageUrl?: string;
    outdoor_temperature?: number;
    outdoor_humidity?: number;
    isDirty: boolean;
  }) => {
    logger.debug('handleImageChange called for petri observation:', {
      hasFile: !!data.file,
      fileSize: data.file?.size,
      tempImageKey: data.tempImageKey,
      imageUrl: !!data.imageUrl ? '[present]' : '[not present]',
      formId,
      outdoor_temperature: data.outdoor_temperature,
      outdoor_humidity: data.outdoor_humidity,
      submissionOutdoorTemperature,
      submissionOutdoorHumidity
    });
    
    setImageFile(data.file);
    setTempImageKey(data.tempImageKey);
    setImageUrl(data.imageUrl);
    
    // Use environmental data from image upload field if available, otherwise fall back to submission values
    const temperatureValue = 
      data.outdoor_temperature !== undefined ? data.outdoor_temperature : 
      submissionOutdoorTemperature !== undefined ? submissionOutdoorTemperature : 
      null;
    
    const humidityValue = 
      data.outdoor_humidity !== undefined ? data.outdoor_humidity : 
      submissionOutdoorHumidity !== undefined ? submissionOutdoorHumidity : 
      null;
    
    // Set the temperature with fallback logic
    formik.setFieldValue('outdoor_temperature', temperatureValue);
    
    // Set the humidity with fallback logic
    formik.setFieldValue('outdoor_humidity', humidityValue);
    
    logger.debug(`Setting environmental data for petri observation:`, {
      temperatureValue,
      humidityValue,
      usingFallback: data.outdoor_temperature === undefined || data.outdoor_humidity === undefined
    });
    
    if (data.isDirty) {
      setIsDirty(true);
    }
  };

  useEffect(() => {
    // Only update if there's data to report or this is a form with initial data
    if (hasData || initialData) {
      logger.debug(`useEffect updating parent with:`, { 
        petriCode: formik.values.petriCode,
        initialPetriCode: formik.initialValues.petriCode,
        hasImageFile: !!imageFile,
        hasInitialImageUrl: !!(initialData?.observationId && initialData?.imageUrl),
        hasTempImageKey: !!tempImageKey,
        initialImageUrl: initialData?.imageUrl,
        tempImageKey,
        imageFile: imageFile ? {
          name: imageFile.name,
          size: imageFile.size,
          type: imageFile.type
        } : null,
        isValid,
        hasData,
        hasImage,
        observationId: observationId || initialData?.observationId,
        isDirty,
        outdoor_temperature: formik.values.outdoor_temperature,
        initialOutdoor_temperature: formik.initialValues.outdoor_temperature,
        outdoor_humidity: formik.values.outdoor_humidity,
        initialOutdoor_humidity: formik.initialValues.outdoor_humidity,
        is_image_split: formik.values.is_image_split,
        initialIs_image_split: formik.initialValues.is_image_split,
        is_split_source: formik.values.is_split_source,
        initialIs_split_source: formik.initialValues.is_split_source,
        main_petri_id: formik.values.main_petri_id,
        phase_observation_settings: formik.values.phase_observation_settings
      });
      
      onUpdate(formId, {
        petriCode: formik.values.petriCode,
        imageFile,
        imageUrl: initialData?.observationId ? initialData?.imageUrl : undefined,
        tempImageKey,
        initialPetriCode: formik.initialValues.petriCode,
        plantType: initialData?.plantType || 'Other Fresh Perishable',
        fungicideUsed: formik.values.fungicideUsed,
        initialImageUrl: initialData?.imageUrl,
        surroundingWaterSchedule: formik.values.surroundingWaterSchedule,
        notes: formik.values.notes,
        initialPlantType: initialData?.plantType,
        placement: formik.values.placement,
        initialFungicideUsed: formik.initialValues.fungicideUsed,
        placement_dynamics: initialData?.placement_dynamics,
        initialSurroundingWaterSchedule: formik.initialValues.surroundingWaterSchedule,
        outdoor_temperature: formik.values.outdoor_temperature || undefined,
        initialNotes: formik.initialValues.notes,
        outdoor_humidity: formik.values.outdoor_humidity || undefined,
        initialPlacement: formik.initialValues.placement,
        isValid,
        initialPlacement_dynamics: initialData?.placement_dynamics,
        hasData,
        initialOutdoor_temperature: formik.initialValues.outdoor_temperature,
        hasImage,
        initialOutdoor_humidity: formik.initialValues.outdoor_humidity,
        observationId: observationId || initialData?.observationId,
        isDirty,
        is_image_split: formik.values.is_image_split,
        is_split_source: formik.values.is_split_source,
        split_processed: formik.values.split_processed,
        initialSplit_processed: formik.initialValues.split_processed,
        initialIs_image_split: formik.initialValues.is_image_split,
        phase_observation_settings: formik.values.phase_observation_settings,
        initialIs_split_source: formik.initialValues.is_split_source,
        initialMain_petri_id: formik.initialValues.main_petri_id,
        initialSplit_processed: formik.initialValues.split_processed,
        main_petri_id: formik.values.main_petri_id // Include the main_petri_id field to prevent it from being cleared
        initialPhase_observation_settings: formik.initialValues.phase_observation_settings,
        initialPhase_observation_settings: formik.initialValues.phase_observation_settings
        initialMain_petri_id: formik.initialValues.main_petri_id
      });
    }
  }, [
    formik.values.petriCode,
    formik.values.fungicideUsed,
    formik.values.surroundingWaterSchedule,
    formik.values.notes,
    formik.values.placement,
    formik.values.outdoor_temperature,
    formik.values.outdoor_humidity,
    formik.values.is_image_split,
    formik.values.is_split_source,
    formik.values.split_processed,
    formik.values.phase_observation_settings,
    formik.values.main_petri_id,
    imageFile,
    imageUrl,
    tempImageKey,
    isValid,
    hasData,
    hasImage,
    initialData?.observationId,
    initialData?.imageUrl,
    initialData?.placement_dynamics,
    initialData?.plantType,
    initialData?.main_petri_id,
    observationId,
    isDirty,
    onUpdate,
    formId
  ]);

  // Show a message for split image if this is a split source
  const isSplitSource = formik.values.is_image_split && formik.values.is_split_source;

  return (
    <div id={id} className="border border-gray-200 rounded-lg p-3 bg-gray-50" data-testid={`petri-form-${formId}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <h4 className="font-medium text-gray-900">Petri Labeled: {formik.values.petriCode}</h4>
          {/* Toggle expand/collapse button */}
          <button 
            type="button"
            onClick={toggleExpanded}
            className="ml-2 p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
        </div>
        
        {showRemoveButton && !disabled && (
          <Button 
            type="button" 
            variant="danger" 
            size="sm"
            icon={<Trash2 size={16} />}
            onClick={onRemove}
            className="!py-1"
            testId={`remove-petri-button-${formId}`}
          >
            Remove
          </Button>
        )}
      </div>

      {/* Show split image info banner if applicable */}
      {isSplitSource && (
        <div className="bg-primary-50 border border-primary-100 rounded-md p-2 mb-3 text-sm text-primary-700 flex items-center">
          <SplitSquareVertical size={16} className="mr-1.5" />
          This Is A Side-By-Side Station! Always Turn Your Camera Sideways For Landscape Centered Photos
        </div>
      )}
      
      {/* Always visible: Two-column layout for image and basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Column 1: Image uploader with preview inside */}
        <ImageUploadField
          label="Petri Image"
          initialImageUrl={initialData?.imageUrl}
          initialTempImageKey={initialData?.tempImageKey}
          submissionSessionId={submissionSessionId}
          imageId={formId}
          onChange={handleImageChange}
          disabled={disabled}
          testId={`petri-image-upload-${formId}`}
        />

        {/* Column 2: Code and Placement */}
        <div className="space-y-2">
          <div>
            <label htmlFor={`petriCode-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Petri Code
            </label>
            <div className="relative">
              <input
                id={`petriCode-${formId}`}
                name="petriCode"
                type="text"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="Enter petri code"
                value={formik.values.petriCode}
                onChange={handleFieldChange}
                onBlur={formik.handleBlur}
                disabled={disabled}
                data-testid={`petri-code-input-${formId}`}
              />
            </div>
            {formik.touched.petriCode && formik.errors.petriCode && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.petriCode}</p>
            )}
          </div>
          
          <div>
            <label htmlFor={`placement-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Placement
            </label>
            <div className="relative">
              <div className="flex items-center">
                <MapPin size={16} className="text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <select
                  id={`placement-${formId}`}
                  name="placement"
                  className={`w-full pl-9 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  value={formik.values.placement || ''}
                  onChange={handleFieldChange}
                  onBlur={formik.handleBlur}
                  disabled={disabled}
                  data-testid={`petri-placement-select-${formId}`}
                >
                  <option value="">Select placement</option>
                  {petriPlacementOptions.map((placement) => (
                    <option key={placement} value={placement}>{placement}</option>
                  ))}
                </select>
              </div>
            </div>
            {formik.touched.placement && formik.errors.placement && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.placement}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Additional fields that are shown only when expanded */}
      {isExpanded && (
        <div className="space-y-2 animate-fade-in mt-3">
          <div>
            <label htmlFor={`fungicideUsed-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Fungicide Used Within Last 3 Days?
            </label>
            <div className="flex space-x-4" data-testid={`fungicide-radio-group-${formId}`}>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name={`fungicideUsed-${formId}`}
                  value="Yes"
                  checked={formik.values.fungicideUsed === 'Yes'}
                  onChange={() => handleFieldValueChange('fungicideUsed', 'Yes')}
                  onBlur={formik.handleBlur}
                  disabled={disabled}
                  className={`h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded ${disabled ? 'cursor-not-allowed' : ''}`}
                  data-testid={`fungicide-yes-${formId}`}
                />
                <span className="ml-2">Yes</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name={`fungicideUsed-${formId}`}
                  value="No"
                  checked={formik.values.fungicideUsed === 'No'}
                  onChange={() => handleFieldValueChange('fungicideUsed', 'No')}
                  onBlur={formik.handleBlur}
                  disabled={disabled}
                  className={`h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded ${disabled ? 'cursor-not-allowed' : ''}`}
                  data-testid={`fungicide-no-${formId}`}
                />
                <span className="ml-2">No</span>
              </label>
            </div>
            {formik.touched.fungicideUsed && formik.errors.fungicideUsed && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.fungicideUsed}</p>
            )}
          </div>
          
          <div>
            <label htmlFor={`surroundingWaterSchedule-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Water Schedule For Surrounding
            </label>
            <select
              id={`surroundingWaterSchedule-${formId}`}
              name="surroundingWaterSchedule"
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={formik.values.surroundingWaterSchedule}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              disabled={disabled}
              data-testid={`water-schedule-select-${formId}`}
            >
              <option value="">Select water schedule</option>
              {waterScheduleOptions.map(schedule => (
                <option key={schedule} value={schedule}>{schedule}</option>
              ))}
            </select>
            {formik.touched.surroundingWaterSchedule && formik.errors.surroundingWaterSchedule && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.surroundingWaterSchedule}</p>
            )}
          </div>
          
          <div>
            <label htmlFor={`notes-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Observation Notes
            </label>
            <textarea
              id={`notes-${formId}`}
              name="notes"
              rows={2}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder="Optional notes"
              value={formik.values.notes}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              maxLength={200}
              disabled={disabled}
              data-testid={`notes-textarea-${formId}`}
            ></textarea>
            <p className="mt-1 text-xs text-gray-500 text-right">
              {formik.values.notes.length}/200 characters
            </p>
          </div>
        </div>
      )}

      {/* Hidden fields for plant type - hardcoded for now */}
      <input 
        type="hidden"
        name="plantType"
        value="Other Fresh Perishable"
        data-testid={`plant-type-hidden-${formId}`}
      />

      {/* Hidden fields for outdoor environmental data - not shown in UI */}
      <input 
        type="hidden"
        name="outdoor_temperature"
        value={formik.values.outdoor_temperature || ''}
      />
      <input 
        type="hidden"
        name="outdoor_humidity"
        value={formik.values.outdoor_humidity || ''}
      />

      {/* Hidden fields for split image data - not shown in UI */}
      <input 
        type="hidden"
        name="is_image_split"
        value={formik.values.is_image_split ? 'true' : 'false'}
      />
      <input 
        type="hidden"
        name="is_split_source"
        value={formik.values.is_split_source ? 'true' : 'false'}
      />
      <input 
        type="hidden"
        name="split_processed"
        value={formik.values.split_processed ? 'true' : 'false'}
      />
      <input 
        type="hidden"
        name="main_petri_id"
        value={formik.values.main_petri_id || ''}
      />
    </div>
  );
});

PetriForm.displayName = 'PetriForm';

export default PetriForm;