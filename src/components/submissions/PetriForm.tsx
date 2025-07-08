import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Trash2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '../common/Button';
import ImageUploadField from '../common/ImageUploadField';
import { ChemicalType, PlacementHeight, DirectionalPlacement, PlacementStrategy } from '../../lib/types';
import { createLogger } from '../../utils/logger';

// Create a component-specific logger
const logger = createLogger('GasifierForm');

interface GasifierFormProps {
  id: string;
  formId: string;
  index: number;
  siteId: string;
  submissionSessionId: string;
  onUpdate: (formId: string, data: {
    gasifierCode: string;
    imageFile: File | null;
    imageUrl?: string;
    tempImageKey?: string;
    chemicalType: ChemicalType;
    measure: number | null;
    anomaly: boolean;
    placementHeight?: PlacementHeight;
    directionalPlacement?: DirectionalPlacement;
    placementStrategy?: PlacementStrategy;
    notes: string;
    outdoor_temperature?: number;
    outdoor_humidity?: number;
    isValid: boolean;
    hasData: boolean;
    hasImage: boolean;
    observationId?: string;
    isDirty: boolean;
  }) => void;
  onRemove: () => void;
  showRemoveButton: boolean;
  initialData?: {
    gasifierCode: string;
    imageUrl?: string;
    tempImageKey?: string;
    chemicalType: ChemicalType;
    measure: number | null;
    anomaly: boolean;
    placementHeight?: PlacementHeight;
    directionalPlacement?: DirectionalPlacement;
    placementStrategy?: PlacementStrategy;
    notes: string;
    outdoor_temperature?: number;
    outdoor_humidity?: number;
    observationId?: string;
  };
  disabled?: boolean;
  observationId?: string;
  submissionOutdoorTemperature?: number;
  submissionOutdoorHumidity?: number;
}

export interface GasifierFormRef {
  validate: () => Promise<boolean>;
  gasifierCode: string;
  resetDirty: () => void;
}

const chemicalTypeOptions: ChemicalType[] = [
  'Geraniol',
  'CLO2',
  'Acetic Acid',
  'Citronella Blend',
  'Essential Oils Blend',
  '1-MCP',
  'Other'
];

const placementHeightOptions: PlacementHeight[] = ['High', 'Medium', 'Low'];

const directionalPlacementOptions: DirectionalPlacement[] = [
  'Front-Center',
  'Front-Left',
  'Front-Right',
  'Center-Center',
  'Center-Left',
  'Center-Right',
  'Back-Center',
  'Back-Left',
  'Back-Right'
];

const placementStrategyOptions: PlacementStrategy[] = [
  'Perimeter Coverage',
  'Centralized Coverage',
  'Centralized and Perimeter Coverage',
  'Targeted Coverage',
  'Spot Placement Coverage'
];

const GasifierFormSchema = Yup.object().shape({
  gasifierCode: Yup.string()
    .required('Gasifier code is required'),
  chemicalType: Yup.string()
    .required('Chemical type is required')
    .oneOf(chemicalTypeOptions, 'Please select a valid chemical type'),
  measure: Yup.number()
    .nullable()
    .min(0, 'Measure must be at least 0')
    .max(10, 'Measure must be at most 10'),
  anomaly: Yup.boolean()
    .required('Anomaly field is required'),
  placementHeight: Yup.string()
    .nullable()
    .oneOf([...placementHeightOptions, null], 'Please select a valid placement height'),
  directionalPlacement: Yup.string()
    .nullable()
    .oneOf([...directionalPlacementOptions, null], 'Please select a valid directional placement'),
  placementStrategy: Yup.string()
    .nullable()
    .oneOf([...placementStrategyOptions, null], 'Please select a valid placement strategy'),
  notes: Yup.string()
    .max(200, 'Notes must be less than 200 characters'),
});

const GasifierForm = forwardRef<GasifierFormRef, GasifierFormProps>(({ 
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [tempImageKey, setTempImageKey] = useState<string | undefined>(initialData?.tempImageKey);
  const [imageUrl, setImageUrl] = useState<string | undefined>(initialData?.imageUrl);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  const formik = useFormik({
    initialValues: {
      gasifierCode: initialData?.gasifierCode || '',
      chemicalType: initialData?.chemicalType || 'CLO2',
      measure: initialData?.measure || null,
      anomaly: initialData?.anomaly || false,
      placementHeight: initialData?.placementHeight || null,
      directionalPlacement: initialData?.directionalPlacement || null,
      placementStrategy: initialData?.placementStrategy || null,
      notes: initialData?.notes || '',
      // Only use values from initialData, not from submission
      outdoor_temperature: initialData?.outdoor_temperature || null,
      outdoor_humidity: initialData?.outdoor_humidity || null
    },
    validationSchema: GasifierFormSchema,
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
    gasifierCode: formik.values.gasifierCode,
    resetDirty: () => {
      setIsDirty(false);
    }
  }));
  
  const hasImage = !!imageFile || !!(initialData?.observationId && initialData?.imageUrl) || !!tempImageKey;
  
  // Check if form has basic data to be considered for saving as draft
  const hasData = !!observationId || !!initialData?.observationId || 
                  !!formik.values.gasifierCode || 
                  !!formik.values.chemicalType || 
                  formik.values.anomaly || 
                  !!formik.values.notes;
  
  // Form is valid if it has gasifier code, chemical type, and image
  const isValid = !!formik.values.gasifierCode && 
                  !!formik.values.chemicalType && 
                  hasImage;
  
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling to parent containers
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
    logger.debug('handleImageChange called for gasifier observation:', {
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
    
    logger.debug(`Setting environmental data for gasifier observation:`, {
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
        gasifierCode: formik.values.gasifierCode,
        initialGasifierCode: formik.initialValues.gasifierCode,
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
      });

      onUpdate(formId, {
        gasifierCode: formik.values.gasifierCode,
        initialGasifierCode: formik.initialValues.gasifierCode,
        imageFile,
        imageUrl: initialData?.observationId ? initialData?.imageUrl : undefined,
        initialImageUrl: initialData?.imageUrl,
        tempImageKey,
        chemicalType: formik.values.chemicalType,
        initialChemicalType: formik.initialValues.chemicalType,
        measure: formik.values.measure,
        initialMeasure: formik.initialValues.measure,
        anomaly: formik.values.anomaly,
        initialAnomaly: formik.initialValues.anomaly,
        placementHeight: formik.values.placementHeight as PlacementHeight,
        initialPlacementHeight: formik.initialValues.placementHeight as PlacementHeight,
        directionalPlacement: formik.values.directionalPlacement as DirectionalPlacement,
        initialDirectionalPlacement: formik.initialValues.directionalPlacement as DirectionalPlacement,
        placementStrategy: formik.values.placementStrategy as PlacementStrategy,
        initialPlacementStrategy: formik.initialValues.placementStrategy as PlacementStrategy,
        notes: formik.values.notes,
        initialNotes: formik.initialValues.notes,
        outdoor_temperature: formik.values.outdoor_temperature || undefined,
        initialOutdoor_temperature: formik.initialValues.outdoor_temperature,
        outdoor_humidity: formik.values.outdoor_humidity || undefined,
        initialOutdoor_humidity: formik.initialValues.outdoor_humidity,
        isValid,
        hasData,
        hasImage,
        observationId: observationId || initialData?.observationId,
        isDirty
      });
    }
  }, [
    formik.values.gasifierCode,
    formik.values.chemicalType,
    formik.values.measure,
    formik.values.anomaly,
    formik.values.placementHeight,
    formik.values.directionalPlacement,
    formik.values.placementStrategy,
    formik.values.notes,
    formik.values.outdoor_temperature,
    formik.values.outdoor_humidity,
    imageFile,
    imageUrl,
    tempImageKey,
    isValid,
    hasData,
    hasImage,
    initialData?.observationId,
    initialData?.imageUrl,
    observationId,
    isDirty,
    onUpdate,
    formId
  ]);

  return (
    <div id={id} className="border border-gray-200 rounded-lg p-3 bg-gray-50" data-testid={`gasifier-form-${formId}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <h4 className="font-medium text-gray-900">Gasifier Labeled: {formik.values.gasifierCode}</h4>
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
            testId={`remove-gasifier-button-${formId}`}
          >
            Remove
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Column 1: Image uploader with preview inside */}
        <ImageUploadField
          label="Gasifier Image"
          initialImageUrl={initialData?.imageUrl}
          initialTempImageKey={initialData?.tempImageKey}
          submissionSessionId={submissionSessionId}
          imageId={formId}
          onChange={handleImageChange}
          disabled={disabled}
          testId={`gasifier-image-upload-${formId}`}
        />

        {/* Column 2: Code and Placement Height */}
        <div className="space-y-2">
          <div>
            <label htmlFor={`gasifierCode-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Gasifier Code
            </label>
            <div className="relative">
              <input
                id={`gasifierCode-${formId}`}
                name="gasifierCode"
                type="text"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="Enter gasifier code"
                value={formik.values.gasifierCode}
                onChange={handleFieldChange}
                onBlur={formik.handleBlur}
                disabled={disabled}
                data-testid={`gasifier-code-input-${formId}`}
              />
            </div>
            {formik.touched.gasifierCode && formik.errors.gasifierCode && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.gasifierCode}</p>
            )}
          </div>
<div>
            <label htmlFor={`directionalPlacement-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Where This Bag Is Placed
            </label>
            <select
              id={`directionalPlacement-${formId}`}
              name="directionalPlacement"
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={formik.values.directionalPlacement || ''}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              disabled={disabled}
              data-testid={`directional-placement-select-${formId}`}
            >
              <option value="">Select directional placement</option>
              {directionalPlacementOptions.map((placement) => (
                <option key={placement} value={placement}>{placement}</option>
              ))}
            </select>
            {formik.touched.directionalPlacement && formik.errors.directionalPlacement && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.directionalPlacement}</p>
            )}
          </div>
         
        </div>
      </div>

      {/* Additional fields that are shown only when expanded */}
      {isExpanded && (
        <div className="space-y-2 animate-fade-in mt-3">
          <div>
            <label htmlFor={`chemicalType-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Chemical Type
            </label>
            <select
              id={`chemicalType-${formId}`}
              name="chemicalType"
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={formik.values.chemicalType}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              disabled={disabled}
              data-testid={`chemical-type-select-${formId}`}
            >
              {chemicalTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {formik.touched.chemicalType && formik.errors.chemicalType && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.chemicalType}</p>
            )}
          </div>
          
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={formik.values.anomaly}
                onChange={(e) => {
                  handleFieldValueChange('anomaly', e.target.checked);
                }}
                className={`h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded ${disabled ? 'cursor-not-allowed' : ''}`}
                disabled={disabled}
                data-testid={`anomaly-checkbox-${formId}`}
              />
              <span>Has Anomaly</span>
              <div className="relative inline-block" title="Check this box if this bag is broken or otherwise not working in a visible manner">
                <Info size={16} className="text-gray-400 hover:text-gray-600 cursor-help" />
              </div>
            </label>
          </div>
          
          <div>
            <label htmlFor={`placementHeight-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Placement Height
            </label>
            <select
              id={`placementHeight-${formId}`}
              name="placementHeight"
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={formik.values.placementHeight || ''}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              disabled={disabled}
              data-testid={`placement-height-select-${formId}`}
            >
              <option value="">Select placement height</option>
              {placementHeightOptions.map((height) => (
                <option key={height} value={height}>{height}</option>
              ))}
            </select>
            {formik.touched.placementHeight && formik.errors.placementHeight && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.placementHeight}</p>
            )}
          </div>
          
          <div>
            <label htmlFor={`placementStrategy-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Placement Strategy
            </label>
            <select
              id={`placementStrategy-${formId}`}
              name="placementStrategy"
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={formik.values.placementStrategy || ''}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              disabled={disabled}
              data-testid={`placement-strategy-select-${formId}`}
            >
              <option value="">Select placement strategy</option>
              {placementStrategyOptions.map((strategy) => (
                <option key={strategy} value={strategy}>{strategy}</option>
              ))}
            </select>
            {formik.touched.placementStrategy && formik.errors.placementStrategy && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.placementStrategy}</p>
            )}
          </div>
          
          <div className="mb-2">
            <label htmlFor={`measure-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
              Measure (0-10)
            </label>
            <input
              id={`measure-${formId}`}
              name="measure"
              type="number"
              min="0"
              max="10"
              step="0.1"
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder="Enter measure (optional)"
              value={formik.values.measure === null ? '' : formik.values.measure}
              onChange={handleFieldChange}
              onBlur={formik.handleBlur}
              disabled={disabled}
              data-testid={`measure-input-${formId}`}
            />
            {formik.touched.measure && formik.errors.measure && (
              <p className="mt-1 text-sm text-error-600">{formik.errors.measure}</p>
            )}
          </div>
          
          {formik.values.anomaly && (
            <div>
              <label htmlFor={`notes-${formId}`} className="block text-sm font-medium text-gray-700 mb-1">
                Observation Notes
              </label>
              <textarea
                id={`notes-${formId}`}
                name="notes"
                rows={2}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="Describe the anomaly"
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
          )}
        </div>
      )}

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
    </div>
  );
});

GasifierForm.displayName = 'GasifierForm';

export default GasifierForm;