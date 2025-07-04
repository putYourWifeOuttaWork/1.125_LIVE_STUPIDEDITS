import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import { PetriObservation, GasifierObservation } from '../lib/types';
import { createLogger } from './logger';

// Create a logger for the submissionUtils module
const logger = createLogger('submissionUtils');

// Types for observation data
export interface PetriFormData {
  formId: string;
  petriCode: string;
  initialPetriCode?: string;
  imageFile: File | null;
  imageUrl?: string;
  tempImageKey?: string;
  plantType: string;
  initialPlantType?: string;
  fungicideUsed: 'Yes' | 'No';
  initialFungicideUsed?: 'Yes' | 'No';
  surroundingWaterSchedule: string;
  initialSurroundingWaterSchedule?: string;
  notes: string;
  initialNotes?: string;
  placement?: string | null;
  initialPlacement?: string | null;
  placement_dynamics?: string | null;
  initialPlacement_dynamics?: string | null;
  outdoor_temperature?: number;
  initialOutdoor_temperature?: number;
  outdoor_humidity?: number;
  initialOutdoor_humidity?: number;
  observationId?: string;
  isValid: boolean;
  hasData: boolean;
  hasImage: boolean;
  isDirty: boolean;
  is_image_split?: boolean;
  initialIs_image_split?: boolean;
  is_split_source?: boolean;
  initialIs_split_source?: boolean;
  split_processed?: boolean;
  initialSplit_processed?: boolean;
  phase_observation_settings?: any;
  initialPhase_observation_settings?: any;
  main_petri_id?: string;
  initialMain_petri_id?: string;
}

export interface GasifierFormData {
  formId: string;
  gasifierCode: string;
  initialGasifierCode?: string;
  imageFile: File | null;
  imageUrl?: string;
  tempImageKey?: string;
  chemicalType: string;
  initialChemicalType?: string;
  measure: number | null;
  initialMeasure?: number | null;
  anomaly: boolean;
  initialAnomaly?: boolean;
  placementHeight?: string | null;
  initialPlacementHeight?: string | null;
  directionalPlacement?: string | null;
  initialDirectionalPlacement?: string | null;
  placementStrategy?: string | null;
  initialPlacementStrategy?: string | null;
  notes: string;
  initialNotes?: string;
  outdoor_temperature?: number;
  initialOutdoor_temperature?: number;
  outdoor_humidity?: number;
  initialOutdoor_humidity?: number;
  observationId?: string;
  isValid: boolean;
  hasData: boolean;
  hasImage: boolean;
  isDirty: boolean;
}

// Function to upload an image to Supabase storage
export const uploadImage = async (
  file: File, 
  siteId: string, 
  submissionId: string, 
  observationId: string,
  type: 'petri' | 'gasifier'
): Promise<string | null> => {
  try {
    logger.debug(`[uploadImage] Starting upload for ${type} observation: ${observationId}`, {
      fileSize: file.size,
      fileType: file.type,
      fileName: file.name
    });
    
    const fileName = `${siteId}/${submissionId}/${type}-${observationId}-${Date.now()}`;
    logger.debug(`[uploadImage] Using storage path: ${fileName}`);
    
    const { data: fileData, error: fileError } = await supabase.storage
      .from('petri-images')
      .upload(fileName, file);
      
    if (fileError) {
      logger.error(`Error uploading ${type} image:`, fileError);
      throw fileError;
    }
    
    logger.debug(`[uploadImage] Upload successful:`, fileData);
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('petri-images')
      .getPublicUrl(fileData.path);
    
    logger.debug(`[uploadImage] Got public URL:`, publicUrlData);
    
    logger.debug(`[uploadImage] Successfully uploaded image, got URL:`, 
      publicUrlData.publicUrl.substring(0, 50) + '...');
    
    return publicUrlData.publicUrl;
  } catch (error) {
    logger.error(`Error in uploadImage for ${type}:`, error);
    return null;
  }
};

function stripNewlinesFromObject(obj: any): any {
  if (typeof obj === "string") {
    return obj.replace(/[\n\r]/g, "");
  }
  if (Array.isArray(obj)) {
    return obj.map(stripNewlinesFromObject);
  }
  if (typeof obj === "object" && obj !== null) {
    const out: any = {};
    for (const k in obj) {
      if (obj.hasOwnProperty(k)) {
        out[k] = stripNewlinesFromObject(obj[k]);
      }
    }
    return out;
  }
  return obj;
}

const safeJsonb = (value: any): any => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  if (typeof value === "object") {
    try {
      return stripNewlinesFromObject(value);
    } catch (e) {
      logger.error("Invalid JSONB object:", e);
      return null;
    }
  }
  if (typeof value === "string") {
    try {
      const sanitized = value.replace(/[\n\r]/g, "");
      return JSON.parse(sanitized);
    } catch (e) {
      logger.error("Failed to parse JSON string:", e);
      return null;
    }
  }
  return null;
};


// Function to create or update a petri observation
export const updatePetriObservation = async (
  formData: PetriFormData, 
  submissionId: string,
  siteId: string
): Promise<{ success: boolean; observationId?: string; message?: string }> => {
  try {
    // More detailed logging of the entire formData object
    logger.debug('[updatePetriObservation] Starting with complete form data:', { 
      formData: {
        formId: formData.formId,
        petriCode: formData.petriCode,
        initialPetriCode: formData.initialPetriCode,
        hasImageFile: !!formData.imageFile,
        imageFileDetails: formData.imageFile ? {
          name: formData.imageFile.name,
          size: formData.imageFile.size,
          type: formData.imageFile.type
        } : null,
        hasExistingUrl: !!formData.imageUrl,
        imageUrl: formData.imageUrl ? formData.imageUrl.substring(0, 30) + '...' : undefined,
        hasTempKey: !!formData.tempImageKey,
        tempImageKey: formData.tempImageKey,
        plantType: formData.plantType,
        initialPlantType: formData.initialPlantType,
        fungicideUsed: formData.fungicideUsed,
        initialFungicideUsed: formData.initialFungicideUsed,
        surroundingWaterSchedule: formData.surroundingWaterSchedule,
        initialSurroundingWaterSchedule: formData.initialSurroundingWaterSchedule,
        placement: formData.placement,
        initialPlacement: formData.initialPlacement,
        placement_dynamics: formData.placement_dynamics,
        initialPlacement_dynamics: formData.initialPlacement_dynamics,
        notes: formData.notes ? formData.notes.substring(0, 30) + '...' : null,
        initialNotes: formData.initialNotes ? formData.initialNotes.substring(0, 30) + '...' : null,
        observationId: formData.observationId,
        is_image_split: formData.is_image_split,
        initialIs_image_split: formData.initialIs_image_split,
        is_split_source: formData.is_split_source,
        initialIs_split_source: formData.initialIs_split_source,
        split_processed: formData.split_processed,
        initialSplit_processed: formData.initialSplit_processed,
        phase_observation_settings: formData.phase_observation_settings,
        initialPhase_observation_settings: formData.initialPhase_observation_settings,
        main_petri_id: formData.main_petri_id,
        initialMain_petri_id: formData.initialMain_petri_id,
        outdoor_temperature: formData.outdoor_temperature,
        initialOutdoor_temperature: formData.initialOutdoor_temperature,
        outdoor_humidity: formData.outdoor_humidity,
        initialOutdoor_humidity: formData.initialOutdoor_humidity,
        isValid: formData.isValid,
        hasData: formData.hasData,
        hasImage: formData.hasImage,
        isDirty: formData.isDirty
      },
      submissionId,
      siteId
    });
    
    // Prepare data with correct handling of enum values
    // Use null for empty strings in optional enum fields
    const placement = formData.placement && formData.placement.trim() !== '' ? formData.placement : null;
    const placementDynamics = formData.placement_dynamics && formData.placement_dynamics.trim() !== '' ? formData.placement_dynamics : null;
    
    // Use default values for required enum fields if they're empty
    const plantType = formData.plantType && formData.plantType.trim() !== '' ? formData.plantType : 'Other Fresh Perishable';
    const fungicideUsed = formData.fungicideUsed || 'No';
    const surroundingWaterSchedule = formData.surroundingWaterSchedule && formData.surroundingWaterSchedule.trim() !== '' 
      ? formData.surroundingWaterSchedule : 'Daily';
    
    // Process JSONB data safely
    const phaseObservationSettings = safeJsonb(formData.phase_observation_settings);

    logger.debug('[updatePetriObservation] Processed enum values:', {
      placement,
      placementDynamics,
      plantType,
      fungicideUsed,
      surroundingWaterSchedule,
      phaseObservationSettings
    });
    
    // If we have an existing observation
    if (formData.observationId) {
      logger.debug(`[updatePetriObservation] Updating existing observation ${formData.observationId}`);
      
      // If there's a new image file, upload it
      let imageUrl = formData.imageUrl;
      
      if (formData.imageFile) {
        logger.debug('[updatePetriObservation] Uploading new image for existing observation');
        imageUrl = await uploadImage(formData.imageFile, siteId, submissionId, formData.formId, 'petri');
        
        if (!imageUrl) {
          logger.error('[updatePetriObservation] Failed to upload image');
          return { success: false, message: 'Failed to upload image' };
        }
        
        logger.debug(`[updatePetriObservation] Image upload succeeded, got URL: ${imageUrl.substring(0, 30)}...`);
      }

      // Build update payload with only changed fields
      const updatePayload: any = {};
      
      // Always include the last_updated_by_user_id
      updatePayload.last_updated_by_user_id = (await supabase.auth.getUser()).data.user?.id;
      
      // Check each field and only include if changed
      if (formData.petriCode !== formData.initialPetriCode) {
        updatePayload.petri_code = formData.petriCode;
      }
      
      // Handle image URL specially - include if new upload or explicitly cleared
      if (formData.imageFile || imageUrl !== formData.initialImageUrl) {
        updatePayload.image_url = imageUrl;
      }
      
      if (plantType !== formData.initialPlantType) {
        updatePayload.plant_type = plantType;
      }
      
      if (fungicideUsed !== formData.initialFungicideUsed) {
        updatePayload.fungicide_used = fungicideUsed;
      }
      
      if (surroundingWaterSchedule !== formData.initialSurroundingWaterSchedule) {
        updatePayload.surrounding_water_schedule = surroundingWaterSchedule;
      }
      
      if (placement !== formData.initialPlacement) {
        updatePayload.placement = placement;
      }
      
      if (placementDynamics !== formData.initialPlacement_dynamics) {
        updatePayload.placement_dynamics = placementDynamics;
      }
      
      if (formData.notes !== formData.initialNotes) {
        updatePayload.notes = formData.notes || null;
      }
      
      if (formData.outdoor_temperature !== formData.initialOutdoor_temperature) {
        updatePayload.outdoor_temperature = formData.outdoor_temperature || null;
      }
      
      if (formData.outdoor_humidity !== formData.initialOutdoor_humidity) {
        updatePayload.outdoor_humidity = formData.outdoor_humidity || null;
      }
      
      // Split image related fields - only update if explicitly changed
      // These are typically managed by the backend, not the frontend
      if (formData.is_image_split !== formData.initialIs_image_split) {
        updatePayload.is_image_split = formData.is_image_split || false;
      }
      
      if (formData.is_split_source !== formData.initialIs_split_source) {
        updatePayload.is_split_source = formData.is_split_source || false;
      }
      
      if (formData.split_processed !== formData.initialSplit_processed) {
        updatePayload.split_processed = formData.split_processed || false;
      }

      // Only update phase_observation_settings if it has changed and isn't null
      const initialPhaseSettings = safeJsonb(formData.initialPhase_observation_settings);
      if (JSON.stringify(phaseObservationSettings) !== JSON.stringify(initialPhaseSettings)) {
        updatePayload.phase_observation_settings = phaseObservationSettings;
      }
      
      if (formData.main_petri_id !== formData.initialMain_petri_id) {
        updatePayload.main_petri_id = formData.main_petri_id || null;
      }
      logger.debug('[updatePetriObservation] Updating existing observation with new data:', {
        ...updatePayload,
        observation_id: formData.observationId
      });
      
      // Skip update if no fields have changed (except last_updated_by_user_id)
      if (Object.keys(updatePayload).length <= 1) {
        logger.debug(`[updatePetriObservation] No fields changed, skipping update for ${formData.observationId}`);
        return { success: true, observationId: formData.observationId };
      }
      
      // Update the observation with correct enum handling
      const { data: updateData, error } = await supabase
        .from('petri_observations')
        .update(updatePayload)
        .eq('observation_id', formData.observationId)
        .select(); // Added select() to get the response data
        
      // Log the complete response from Supabase  
      logger.debug('[updatePetriObservation] Supabase update response:', {
        data: updateData,
        hasError: !!error,
        errorMessage: error ? error.message : null,
        errorDetails: error ? error.details : null
      });
      
      if (error) {
        logger.error('Error updating petri observation:', error);
        return { success: false, message: error.message };
      }
      
      logger.debug(`[updatePetriObservation] Successfully updated observation ${formData.observationId}`);
      return { success: true, observationId: formData.observationId };
    } 
    // Create a new observation
    else {
      logger.debug('[updatePetriObservation] Creating new petri observation');
      
      // If there's an image file, upload it
      let imageUrl = null;
      
      if (formData.imageFile) {
        logger.debug('[updatePetriObservation] Uploading new image for new observation');
        imageUrl = await uploadImage(formData.imageFile, siteId, submissionId, formData.formId, 'petri');
        
        if (!imageUrl) {
          logger.error('[updatePetriObservation] Failed to upload image');
          return { success: false, message: 'Failed to upload image' };
        }
        
        logger.debug(`[updatePetriObservation] Image upload succeeded, got URL: ${imageUrl.substring(0, 30)}...`);
      }

      // Log the insert operation data
      logger.debug('[updatePetriObservation] Creating new observation with data:', {
        submission_id: submissionId,
        site_id: siteId,
        petri_code: formData.petriCode,
        image_url: imageUrl ? `${imageUrl.substring(0, 30)}...` : null,
        plant_type: plantType,
        fungicide_used: fungicideUsed,
        surrounding_water_schedule: surroundingWaterSchedule,
        placement,
        placement_dynamics: placementDynamics,
        notes: formData.notes ? `${formData.notes.substring(0, 30)}...` : null,
        is_image_split: formData.is_image_split || false,
        is_split_source: formData.is_split_source || false,
        split_processed: formData.split_processed || false,
        phase_observation_settings: phaseObservationSettings ? JSON.stringify(phaseObservationSettings).substring(0, 30) + '...' : null,
        main_petri_id: formData.main_petri_id || null,
        outdoor_temperature: formData.outdoor_temperature || null,
        outdoor_humidity: formData.outdoor_humidity || null
      });
      
      // Insert new observation with correct enum handling
      const { data, error } = await supabase
        .from('petri_observations')
        .insert({
          submission_id: submissionId,
          site_id: siteId,
          petri_code: formData.petriCode,
          image_url: imageUrl,
          plant_type: plantType, // Use the properly handled value
          fungicide_used: fungicideUsed, // Use the properly handled value
          surrounding_water_schedule: surroundingWaterSchedule, // Use the properly handled value
          placement: placement, // Use the properly handled value (null if empty)
          placement_dynamics: placementDynamics, // Use the properly handled value (null if empty)
          notes: formData.notes || null,
          last_updated_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          outdoor_temperature: formData.outdoor_temperature || null,
          outdoor_humidity: formData.outdoor_humidity || null,
          // Split image properties
          is_image_split: formData.is_image_split || false,
          is_split_source: formData.is_split_source || false,
          split_processed: formData.split_processed || false,
          phase_observation_settings: phaseObservationSettings, // Safely processed JSONB
          main_petri_id: formData.main_petri_id || null
        })
        .select('observation_id')
        .single();
        
      // Log the complete response from Supabase
      logger.debug('[updatePetriObservation] Supabase insert response:', {
        data,
        hasError: !!error,
        errorMessage: error ? error.message : null,
        errorDetails: error ? error.details : null,
        errorCode: error ? error.code : null
      });
      
      if (error) {
        logger.error('Error creating petri observation:', error);
        return { success: false, message: error.message };
      }
      
      if (!data) {
        logger.error('[updatePetriObservation] Insert succeeded but no data returned');
        return { success: false, message: 'No observation ID returned from database' };
      }
      
      logger.debug('[updatePetriObservation] Created new observation with ID:', data.observation_id);
      
      return { success: true, observationId: data.observation_id };
    }
  } catch (error) {
    logger.error('Error in updatePetriObservation:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Function to create or update a gasifier observation
export const updateGasifierObservation = async (
  formData: GasifierFormData, 
  submissionId: string,
  siteId: string
): Promise<{ success: boolean; observationId?: string; message?: string }> => {
  try {
    // More detailed logging of the entire formData object
    logger.debug('[updateGasifierObservation] Starting with complete form data:', { 
      formData: {
        formId: formData.formId,
        gasifierCode: formData.gasifierCode,
        initialGasifierCode: formData.initialGasifierCode,
        hasImageFile: !!formData.imageFile,
        imageFileDetails: formData.imageFile ? {
          name: formData.imageFile.name,
          size: formData.imageFile.size,
          type: formData.imageFile.type
        } : null,
        hasExistingUrl: !!formData.imageUrl,
        imageUrl: formData.imageUrl ? formData.imageUrl.substring(0, 30) + '...' : undefined,
        hasTempKey: !!formData.tempImageKey,
        tempImageKey: formData.tempImageKey,
        chemicalType: formData.chemicalType,
        initialChemicalType: formData.initialChemicalType,
        measure: formData.measure,
        initialMeasure: formData.initialMeasure,
        anomaly: formData.anomaly,
        initialAnomaly: formData.initialAnomaly,
        placementHeight: formData.placementHeight,
        initialPlacementHeight: formData.initialPlacementHeight,
        directionalPlacement: formData.directionalPlacement,
        initialDirectionalPlacement: formData.initialDirectionalPlacement,
        placementStrategy: formData.placementStrategy,
        initialPlacementStrategy: formData.initialPlacementStrategy,
        notes: formData.notes ? formData.notes.substring(0, 30) + '...' : null,
        initialNotes: formData.initialNotes ? formData.initialNotes.substring(0, 30) + '...' : null,
        observationId: formData.observationId,
        outdoor_temperature: formData.outdoor_temperature,
        initialOutdoor_temperature: formData.initialOutdoor_temperature,
        outdoor_humidity: formData.outdoor_humidity,
        initialOutdoor_humidity: formData.initialOutdoor_humidity,
        isValid: formData.isValid,
        hasData: formData.hasData,
        hasImage: formData.hasImage,
        isDirty: formData.isDirty
      },
      submissionId,
      siteId
    });
    
    // Prepare data with correct handling of enum values
    // Use null for empty strings in optional enum fields
    const placementHeight = formData.placementHeight && formData.placementHeight.trim() !== '' ? formData.placementHeight : null;
    const directionalPlacement = formData.directionalPlacement && formData.directionalPlacement.trim() !== '' ? formData.directionalPlacement : null;
    const placementStrategy = formData.placementStrategy && formData.placementStrategy.trim() !== '' ? formData.placementStrategy : null;
    
    // Use default values for required enum fields if they're empty
    const chemicalType = formData.chemicalType && formData.chemicalType.trim() !== '' ? formData.chemicalType : 'CLO2';

    logger.debug('[updateGasifierObservation] Processed enum values:', {
      placementHeight,
      directionalPlacement,
      placementStrategy,
      chemicalType
    });
    
    // If we have an existing observation
    if (formData.observationId) {
      logger.debug(`[updateGasifierObservation] Updating existing observation ${formData.observationId}`);
      
      // If there's a new image file, upload it
      let imageUrl = formData.imageUrl;
      
      if (formData.imageFile) {
        logger.debug('[updateGasifierObservation] Uploading new image for existing observation');
        imageUrl = await uploadImage(formData.imageFile, siteId, submissionId, formData.formId, 'gasifier');
        
        if (!imageUrl) {
          logger.error('[updateGasifierObservation] Failed to upload image');
          return { success: false, message: 'Failed to upload image' };
        }
        
        logger.debug(`[updateGasifierObservation] Image upload succeeded, got URL: ${imageUrl.substring(0, 30)}...`);
      }

      // Build update payload with only changed fields
      const updatePayload: any = {};
      
      // Always include the last_updated_by_user_id
      updatePayload.last_updated_by_user_id = (await supabase.auth.getUser()).data.user?.id;
      
      // Check each field and only include if changed
      if (formData.gasifierCode !== formData.initialGasifierCode) {
        updatePayload.gasifier_code = formData.gasifierCode;
      }
      
      // Handle image URL specially - include if new upload or explicitly cleared
      if (formData.imageFile || imageUrl !== formData.imageUrl) {
        updatePayload.image_url = imageUrl;
      }
      
      if (chemicalType !== formData.initialChemicalType) {
        updatePayload.chemical_type = chemicalType;
      }
      
      if (formData.measure !== formData.initialMeasure) {
        updatePayload.measure = formData.measure;
      }
      
      if (formData.anomaly !== formData.initialAnomaly) {
        updatePayload.anomaly = formData.anomaly;
      }
      
      if (placementHeight !== formData.initialPlacementHeight) {
        updatePayload.placement_height = placementHeight;
      }
      
      if (directionalPlacement !== formData.initialDirectionalPlacement) {
        updatePayload.directional_placement = directionalPlacement;
      }
      
      if (placementStrategy !== formData.initialPlacementStrategy) {
        updatePayload.placement_strategy = placementStrategy;
      }
      
      if (formData.notes !== formData.initialNotes) {
        updatePayload.notes = formData.notes || null;
      }
      
      if (formData.outdoor_temperature !== formData.initialOutdoor_temperature) {
        updatePayload.outdoor_temperature = formData.outdoor_temperature || null;
      }
      
      if (formData.outdoor_humidity !== formData.initialOutdoor_humidity) {
        updatePayload.outdoor_humidity = formData.outdoor_humidity || null;
      }
      logger.debug('[updateGasifierObservation] Updating existing observation with data:', {
        ...updatePayload,
        observation_id: formData.observationId
      });
      
      // Skip update if no fields have changed (except last_updated_by_user_id)
      if (Object.keys(updatePayload).length <= 1) {
        logger.debug(`[updateGasifierObservation] No fields changed, skipping update for ${formData.observationId}`);
        return { success: true, observationId: formData.observationId };
      }

      // Update the observation with correct enum handling
      const { data: updateData, error } = await supabase
        .from('gasifier_observations')
        .update(updatePayload)
        .eq('observation_id', formData.observationId)
        .select(); // Added select() to get the response data
        
      // Log the complete response from Supabase  
      logger.debug('[updateGasifierObservation] Supabase update response:', {
        data: updateData,
        hasError: !!error,
        errorMessage: error ? error.message : null,
        errorDetails: error ? error.details : null
      });
      
      if (error) {
        logger.error('Error updating gasifier observation:', error);
        return { success: false, message: error.message };
      }
      
      logger.debug(`[updateGasifierObservation] Successfully updated observation ${formData.observationId}`);
      return { success: true, observationId: formData.observationId };
    } 
    // Create a new observation
    else {
      logger.debug('[updateGasifierObservation] Creating new gasifier observation');
      
      // If there's an image file, upload it
      let imageUrl = null;
      
      if (formData.imageFile) {
        logger.debug('[updateGasifierObservation] Uploading new image for new observation');
        imageUrl = await uploadImage(formData.imageFile, siteId, submissionId, formData.formId, 'gasifier');
        
        if (!imageUrl) {
          logger.error('[updateGasifierObservation] Failed to upload image');
          return { success: false, message: 'Failed to upload image' };
        }
        
        logger.debug(`[updateGasifierObservation] Image upload succeeded, got URL: ${imageUrl.substring(0, 30)}...`);
      }

      // Log the insert operation data
      logger.debug('[updateGasifierObservation] Creating new observation with data:', {
        submission_id: submissionId,
        site_id: siteId,
        gasifier_code: formData.gasifierCode,
        image_url: imageUrl ? `${imageUrl.substring(0, 30)}...` : null,
        chemical_type: chemicalType,
        measure: formData.measure,
        anomaly: formData.anomaly,
        placement_height: placementHeight,
        directional_placement: directionalPlacement,
        placement_strategy: placementStrategy,
        notes: formData.notes ? `${formData.notes.substring(0, 30)}...` : null,
        outdoor_temperature: formData.outdoor_temperature || null,
        outdoor_humidity: formData.outdoor_humidity || null
      });
      
      // Insert new observation with correct enum handling
      const { data, error } = await supabase
        .from('gasifier_observations')
        .insert({
          submission_id: submissionId,
          site_id: siteId,
          gasifier_code: formData.gasifierCode,
          image_url: imageUrl,
          chemical_type: chemicalType, // Use the properly handled value
          measure: formData.measure,
          anomaly: formData.anomaly,
          placement_height: placementHeight, // Use the properly handled value (null if empty)
          directional_placement: directionalPlacement, // Use the properly handled value (null if empty)
          placement_strategy: placementStrategy, // Use the properly handled value (null if empty)
          notes: formData.notes || null,
          last_updated_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          outdoor_temperature: formData.outdoor_temperature || null,
          outdoor_humidity: formData.outdoor_humidity || null
        })
        .select('observation_id')
        .single();
        
      // Log the complete response from Supabase
      logger.debug('[updateGasifierObservation] Supabase insert response:', {
        data,
        hasError: !!error,
        errorMessage: error ? error.message : null,
        errorDetails: error ? error.details : null,
        errorCode: error ? error.code : null
      });
      
      if (error) {
        logger.error('Error creating gasifier observation:', error);
        return { success: false, message: error.message };
      }
      
      if (!data) {
        logger.error('[updateGasifierObservation] Insert succeeded but no data returned');
        return { success: false, message: 'No observation ID returned from database' };
      }
      
      logger.debug('[updateGasifierObservation] Created new observation with ID:', data.observation_id);
      
      return { success: true, observationId: data.observation_id };
    }
  } catch (error) {
    logger.error('Error in updateGasifierObservation:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Function to process and update multiple petri observations
export const updatePetriObservations = async (
  petriObservations: PetriFormData[],
  submissionId: string,
  siteId: string
): Promise<{ success: boolean; updatedObservations: { clientId: string; observationId: string }[] }> => {
  logger.debug(`[updatePetriObservations] Processing ${petriObservations.length} petri observations`, 
    petriObservations.map(p => ({
      formId: p.formId,
      petriCode: p.petriCode,
      hasImage: p.hasImage,
      hasImageFile: !!p.imageFile,
      hasImageUrl: !!p.imageUrl,
      hasTempKey: !!p.tempImageKey,
      tempImageKey: p.tempImageKey,
      observationId: p.observationId,
      is_image_split: p.is_image_split,
      is_split_source: p.is_split_source,
      main_petri_id: p.main_petri_id,
      isValid: p.isValid
    }))
  );
  
  const updatedObservations: { clientId: string; observationId: string }[] = [];
  let success = true;
  
  // Process each observation in sequence (to avoid race conditions)
  for (const observation of petriObservations) {
    logger.debug(`[updatePetriObservations] Processing observation ${observation.formId}`, {
      petriCode: observation.petriCode,
      hasImage: observation.hasImage,
      hasObservationId: !!observation.observationId
    });
    
    const result = await updatePetriObservation(observation, submissionId, siteId);
    
    logger.debug(`[updatePetriObservations] Result for observation ${observation.formId}:`, {
      success: result.success,
      observationId: result.observationId,
      message: result.message
    });
    
    if (result.success && result.observationId) {
      updatedObservations.push({
        clientId: observation.formId,
        observationId: result.observationId
      });
    } else {
      success = false;
      logger.error(`Failed to update petri observation ${observation.formId}:`, result.message);
      toast.error(`Failed to update petri observation: ${result.message}`);
      break;
    }
  }
  
  logger.debug(`[updatePetriObservations] Overall result:`, {
    success,
    updatedCount: updatedObservations.length,
    totalCount: petriObservations.length,
    updatedObservations
  });
  
  return { success, updatedObservations };
};

// Function to process and update multiple gasifier observations
export const updateGasifierObservations = async (
  gasifierObservations: GasifierFormData[],
  submissionId: string,
  siteId: string
): Promise<{ success: boolean; updatedObservations: { clientId: string; observationId: string }[] }> => {
  logger.debug(`[updateGasifierObservations] Processing ${gasifierObservations.length} gasifier observations`,
    gasifierObservations.map(g => ({
      formId: g.formId,
      gasifierCode: g.gasifierCode,
      hasImage: g.hasImage,
      hasImageFile: !!g.imageFile,
      hasImageUrl: !!g.imageUrl,
      hasTempKey: !!g.tempImageKey,
      tempImageKey: g.tempImageKey,
      observationId: g.observationId,
      isValid: g.isValid
    }))
  );
  
  const updatedObservations: { clientId: string; observationId: string }[] = [];
  let success = true;
  
  // Process each observation in sequence (to avoid race conditions)
  for (const observation of gasifierObservations) {
    logger.debug(`[updateGasifierObservations] Processing observation ${observation.formId}`, {
      gasifierCode: observation.gasifierCode,
      hasImage: observation.hasImage,
      hasObservationId: !!observation.observationId
    });
    
    const result = await updateGasifierObservation(observation, submissionId, siteId);
    
    logger.debug(`[updateGasifierObservations] Result for observation ${observation.formId}:`, {
      success: result.success,
      observationId: result.observationId,
      message: result.message
    });
    
    if (result.success && result.observationId) {
      updatedObservations.push({
        clientId: observation.formId,
        observationId: result.observationId
      });
    } else {
      success = false;
      logger.error(`Failed to update gasifier observation ${observation.formId}:`, result.message);
      toast.error(`Failed to update gasifier observation: ${result.message}`);
      break;
    }
  }
  
  logger.debug(`[updateGasifierObservations] Overall result:`, {
    success,
    updatedCount: updatedObservations.length,
    totalCount: gasifierObservations.length,
    updatedObservations
  });
  
  return { success, updatedObservations };
};

// Function to notify Python app about petri observations that need to be split
export const notifySplitPetriProcessing = async (
  observationId: string
): Promise<boolean> => {
  try {
    logger.debug(`[notifySplitPetriProcessing] Notifying for observation: ${observationId}`);
    
    // This would be an HTTP call to your Python application
    // For now, just log it as this would be implemented separately
    logger.info(`Split petri processing notification would be sent for observation: ${observationId}`);
    
    // In a real implementation, this would post to your Python app endpoint
    // const response = await fetch('https://your-python-app/process-split', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ observationId })
    // });
    // 
    // return response.ok;
    
    // For now, just return success
    return true;
  } catch (error) {
    logger.error('Error notifying split petri processing:', error);
    return false;
  }
};