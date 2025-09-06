import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle, 
  Share2, 
  AlertTriangle, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Thermometer, 
  Droplets, 
  Wind, 
  Ruler, 
  Sun, 
  Cloud, 
  CloudRain, 
  FileText, 
  Calendar,
  User
} from 'lucide-react';
import { format, formatDistanceToNow, differenceInSeconds, set } from 'date-fns';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import { useAuthStore } from '../stores/authStore';
import PetriForm, { PetriFormRef } from '../components/submissions/PetriForm';
import GasifierForm, { GasifierFormRef } from '../components/submissions/GasifierForm';
import { toast } from 'react-toastify';
import { v4 as uuidv4 } from 'uuid';
import TemplateWarningModal from '../components/submissions/TemplateWarningModal';
import ConfirmSubmissionModal from '../components/submissions/ConfirmSubmissionModal';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import offlineStorage from '../utils/offlineStorage';
import useOfflineSession from '../hooks/useOfflineSession';
import sessionManager from '../lib/sessionManager';
import { useSessionStore } from '../stores/sessionStore';
import useUserRole from '../hooks/useUserRole';
import PermissionModal from '../components/common/PermissionModal';
import SessionShareModal from '../components/submissions/SessionShareModal';
import SubmissionOverviewCard from '../components/submissions/SubmissionOverviewCard';
import { useSubmissions } from '../hooks/useSubmissions';
import { createLogger } from '../utils/logger';

// Create a component-specific logger
const logger = createLogger('SubmissionEditPage');

const SubmissionEditPage = () => {
  const { programId, siteId, submissionId } = useParams<{ programId: string; siteId: string; submissionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { 
    selectedProgram, 
    selectedSite,
    setSelectedProgram,
    setSelectedSite
  } = usePilotProgramStore();
  const { setCurrentSessionId } = useSessionStore();
  
  // Add the useSubmissions hook to get access to updateSubmission function
  const { updateSubmission, loading: submissionLoading } = useSubmissions(siteId);
  
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [petriObservations, setPetriObservations] = useState<any[]>([]);
  const [filteredPetriObservations, setFilteredPetriObservations] = useState<any[]>([]);
  const [gasifierObservations, setGasifierObservations] = useState<any[]>([]);
  
  // Form reference arrays for validating and accessing forms
  const [petriForms, setPetriForms] = useState<{ id: string; ref: React.RefObject<PetriFormRef>; isValid: boolean; isDirty: boolean; observationId?: string; tempImageKey?: string; }[]>([]);
  const [gasifierForms, setGasifierForms] = useState<{ id: string; ref: React.RefObject<GasifierFormRef>; isValid: boolean; isDirty: boolean; observationId?: string; tempImageKey?: string; }[]>([]);
  
  // Add state variables to store complete form data objects
  const [petriObservationData, setPetriObservationData] = useState<{[key: string]: any}>({});
  const [gasifierObservationData, setGasifierObservationData] = useState<{[key: string]: any}>({});
  
  const [isPetriAccordionOpen, setIsPetriAccordionOpen] = useState(true);
  const [isGasifierAccordionOpen, setIsGasifierAccordionOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateWarning, setShowTemplateWarning] = useState<'Petri' | 'Gasifier' | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // Session state
  const [session, setSession] = useState<any>(null);
  const [expectedPetriCount, setExpectedPetriCount] = useState(0);
  const [expectedGasifierCount, setExpectedGasifierCount] = useState(0);
  const [completedPetriCount, setCompletedPetriCount] = useState(0);
  const [completedGasifierCount, setCompletedGasifierCount] = useState(0);
  const [isSessionExpiring, setIsSessionExpiring] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Add state for creator information
  const [creatorEmail, setCreatorEmail] = useState<string | undefined>(undefined);
  const [creatorName, setCreatorName] = useState<string | undefined>(undefined);
  
  const { canEditSubmission } = useUserRole({ programId });
  const isOnline = useOnlineStatus();
  
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use the offline session hook to load and manage session data
  const { 
    session: offlineSession, 
    saveSession, 
    isLoading: offlineLoading,
    error: offlineError,
    isOnline: isNetworkOnline
  } = useOfflineSession({
    sessionId: session?.session_id,
    submissionId
  });

  // Look for temp images and assign them to the correct observations
  const assignTempImagesToForms = async (currentSessionId: string) => {
    try {
      logger.debug('Checking for temp images in IndexedDB...');
      
      // Get all temp image keys
      const imageKeys = await offlineStorage.listTempImageKeys();
      
      // Filter keys for current session
      const sessionImageKeys = imageKeys.filter(key => key.startsWith(currentSessionId));
      
      if (sessionImageKeys.length > 0) {
        logger.debug(`Found ${sessionImageKeys.length} temp images for submission ${currentSessionId}: ${JSON.stringify(sessionImageKeys)}`);
        
        // Look for matching petri observations
        for (const form of petriForms) {
          // Check if any key contains both the session ID and the form ID
          const matchingKey = sessionImageKeys.find(key => 
            key.includes(form.id)
          );
          
          if (matchingKey) {
            logger.debug(`Found matching temp image key for petri observation ${form.id}: ${matchingKey}`);
            
            // Update the form to use this temp image key
            setPetriForms(prevForms => 
              prevForms.map(f => 
                f.id === form.id 
                  ? { ...f, tempImageKey: matchingKey } 
                  : f
              )
            );
          }
        }
        
        // Look for matching gasifier observations (similar logic)
        for (const form of gasifierForms) {
          const matchingKey = sessionImageKeys.find(key => 
            key.includes(form.id)
          );
          
          if (matchingKey) {
            logger.debug(`Found matching temp image key for gasifier observation ${form.id}: ${matchingKey}`);
            
            // Update the form to use this temp image key
            setGasifierForms(prevForms => 
              prevForms.map(f => 
                f.id === form.id 
                  ? { ...f, tempImageKey: matchingKey } 
                  : f
              )
            );
          }
        }
      }
    } catch (error) {
      logger.error('Error checking for temp images:', error);
    }
  };

  // Filter observations to exclude child split records (those with main_petri_id set but not is_split_source)
  const filterPetriObservations = useCallback((observations: any[]) => {
    return observations.filter(obs => 
      // Include normal observations (not split)
      !obs.is_image_split ||
      // Include split source observations (the main record)
      (obs.is_image_split && obs.is_split_source) ||
      // Include split child observations only if they don't have a main_petri_id
      (obs.is_image_split && !obs.main_petri_id)
    );
  }, []);

  // Load submission, observations, and session data
  useEffect(() => {
    const loadSubmissionData = async () => {
      if (!programId || !siteId || !submissionId) return;
      
      setLoading(true);
      
      try {
        // Fetch submission with session data
        const { submission: submissionData, session: sessionData, creator } = 
          await sessionManager.getSubmissionWithSession(submissionId);
        
        if (!submissionData) {
          toast.error('Submission not found');
          navigate(`/programs/${programId}/sites/${siteId}`);
          return;
        }
        
        setSubmission(submissionData);
        setSession(sessionData);
        
        // Store creator information if available
        if (creator) {
          setCreatorEmail(creator.email);
          setCreatorName(creator.full_name);
        }
        
        // If we have a session, set it in the session store
        if (sessionData) {
          setCurrentSessionId(sessionData.session_id);
          
          // Look for temporary images from this session
          await assignTempImagesToForms(sessionData.session_id);
        }
        
        // Update title in browser
        document.title = `Submission #${submissionData.global_submission_id || ''} - GRMTek Sporeless`;
        
               // Fetch petri observations
        const { data: petriData, error: petriError } = await supabase
          .from('petri_observations')
          .select('*')
          .eq('submission_id', submissionId)
          .order('petri_code', { ascending: true }); // Add this line to sort by order_index
   
          
        if (petriError) throw petriError;
        
        // Fetch gasifier observations
        const { data: gasifierData, error: gasifierError } = await supabase
          .from('gasifier_observations')
          .select('*')
          .eq('submission_id', submissionId)
          .order('order_index', { ascending: true }); // Add this line to sort by order_index
          
        if (gasifierError) throw gasifierError;
        
        // Set full petri observation data
        setPetriObservations(petriData || []);
        
        // Filter out child split records that have a main_petri_id but aren't split sources
        const filtered = filterPetriObservations(petriData || []);
        setFilteredPetriObservations(filtered);
        
        // Set gasifier observations
        setGasifierObservations(gasifierData || []);
        
        // Fetch all temporary image keys for this session
        let tempImageKeys: string[] = [];
        try {
          tempImageKeys = await offlineStorage.listTempImageKeys();
          logger.debug(`Found ${tempImageKeys.length} temp image keys total`);
        } catch (error) {
          logger.error('Error fetching temp image keys:', error);
        }
        
        // Get the session ID to use for filtering temp image keys
        const sessionIdForFiltering = sessionData?.session_id || submissionId;
        const sessionTempImageKeys = tempImageKeys.filter(key => key.startsWith(sessionIdForFiltering));
        logger.debug(`Found ${sessionTempImageKeys.length} temp image keys for session ${sessionIdForFiltering}`);
        
        // Initialize petri form refs - only for filtered observations
        const petriFormRefs = filtered.map(obs => {
          const formRef = React.createRef<PetriFormRef>();
          
          // Find matching temp image key for this observation
          const matchingKey = sessionTempImageKeys.find(key => 
            key.includes(obs.observation_id)
          );
          
          return { 
            id: obs.observation_id, 
            ref: formRef, 
            isValid: !!obs.image_url,
            isDirty: false,
            observationId: obs.observation_id,
            tempImageKey: matchingKey
          };
        });
        setPetriForms(petriFormRefs);
        setCompletedPetriCount(filtered.filter(obs => !!obs.image_url).length);
        
        // Initialize gasifier form refs
        const gasifierFormRefs = (gasifierData || []).map(obs => {
          const formRef = React.createRef<GasifierFormRef>();
          
          // Find matching temp image key for this observation
          const matchingKey = sessionTempImageKeys.find(key => 
            key.includes(obs.observation_id)
          );
          
          return { 
            id: obs.observation_id, 
            ref: formRef, 
            isValid: !!obs.image_url,
            isDirty: false,
            observationId: obs.observation_id,
            tempImageKey: matchingKey
          };
        });
        setGasifierForms(gasifierFormRefs);
        setCompletedGasifierCount(gasifierData?.filter(obs => !!obs.image_url).length || 0);
        
        // Initialize petriObservationData state - include all split image fields
        const initialPetriData: {[key: string]: any} = {};
        filtered.forEach(observation => {
          // Find matching temp image key for this observation
          const matchingKey = sessionTempImageKeys.find(key => 
            key.includes(observation.observation_id)
          );
          
          initialPetriData[observation.observation_id] = {
            formId: observation.observation_id,
            petriCode: observation.petri_code,
            imageFile: null,
            imageUrl: observation.image_url,
            tempImageKey: matchingKey,
            plantType: observation.plant_type,
            fungicideUsed: observation.fungicide_used,
            surroundingWaterSchedule: observation.surrounding_water_schedule,
            notes: observation.notes || '',
            placement: observation.placement,
            placement_dynamics: observation.placement_dynamics,
            observationId: observation.observation_id,
            isValid: !!observation.image_url,
            hasData: true,
            hasImage: !!observation.image_url || !!matchingKey,
            isDirty: false,
            outdoor_temperature: observation.outdoor_temperature,
            outdoor_humidity: observation.outdoor_humidity,
            // Include all split image fields
            is_image_split: observation.is_image_split,
            is_split_source: observation.is_split_source,
            split_processed: observation.split_processed,
            phase_observation_settings: observation.phase_observation_settings,
            main_petri_id: observation.main_petri_id
          };
        });
        setPetriObservationData(initialPetriData);
        
        // Initialize gasifierObservationData state
        const initialGasifierData: {[key: string]: any} = {};
        gasifierData?.forEach(observation => {
          // Find matching temp image key for this observation
          const matchingKey = sessionTempImageKeys.find(key => 
            key.includes(observation.observation_id)
          );
          
          initialGasifierData[observation.observation_id] = {
            formId: observation.observation_id,
            gasifierCode: observation.gasifier_code,
            imageFile: null,
            imageUrl: observation.image_url,
            tempImageKey: matchingKey,
            chemicalType: observation.chemical_type,
            measure: observation.measure,
            anomaly: observation.anomaly,
            placementHeight: observation.placement_height,
            directionalPlacement: observation.directional_placement,
            placementStrategy: observation.placement_strategy,
            notes: observation.notes || '',
            observationId: observation.observation_id,
            isValid: !!observation.image_url,
            hasData: true,
            hasImage: !!observation.image_url || !!matchingKey,
            isDirty: false,
            outdoor_temperature: observation.outdoor_temperature,
            outdoor_humidity: observation.outdoor_humidity
          };
        });
        setGasifierObservationData(initialGasifierData);
        
        // Get expected counts from site defaults
        if (!selectedSite) {
          // Load site data
          const { data: siteData, error: siteError } = await supabase
            .from('sites')
            .select('*')
            .eq('site_id', siteId)
            .single();
            
          if (siteError) throw siteError;
          
          setSelectedSite(siteData);
          
          setExpectedPetriCount(
            siteData?.petri_defaults 
              ? (Array.isArray(siteData.petri_defaults) ? siteData.petri_defaults.length : 0) 
              : 0
          );
          
          setExpectedGasifierCount(
            siteData?.gasifier_defaults 
              ? (Array.isArray(siteData.gasifier_defaults) ? siteData.gasifier_defaults.length : 0) 
              : 0
          );
        } else {
          setExpectedPetriCount(
            selectedSite.petri_defaults 
              ? (Array.isArray(selectedSite.petri_defaults) ? selectedSite.petri_defaults.length : 0) 
              : 0
          );
          
          setExpectedGasifierCount(
            selectedSite.gasifier_defaults 
              ? (Array.isArray(selectedSite.gasifier_defaults) ? selectedSite.gasifier_defaults.length : 0) 
              : 0
          );
        }
      } catch (error) {
        logger.error('Error loading submission data:', error);
        toast.error('Failed to load submission data');
      } finally {
        setLoading(false);
      }
    };

    loadSubmissionData();
  }, [programId, siteId, submissionId, selectedSite, navigate, setCurrentSessionId, filterPetriObservations]);
  
  // Add a petri form
  const addPetriForm = () => {
    const newFormId = uuidv4();
    const formRef = React.createRef<PetriFormRef>();
    setPetriForms([...petriForms, { id: newFormId, ref: formRef, isValid: false, isDirty: true }]);
    
    // If there are petri defaults in the site, show a warning
    if (selectedSite?.petri_defaults && Array.isArray(selectedSite.petri_defaults) && selectedSite.petri_defaults.length > 0) {
      setShowTemplateWarning('Petri');
    }
  };
  
  // Remove a petri form
  const removePetriForm = (id: string) => {
    setPetriForms(petriForms.filter(form => form.id !== id));
    
    // Remove the form data from petriObservationData
    const updatedData = { ...petriObservationData };
    delete updatedData[id];
    setPetriObservationData(updatedData);
  };
  
  // Add a gasifier form
  const addGasifierForm = () => {
    const newFormId = uuidv4();
    const formRef = React.createRef<GasifierFormRef>();
    setGasifierForms([...gasifierForms, { id: newFormId, ref: formRef, isValid: false, isDirty: true }]);
    
    // If there are gasifier defaults in the site, show a warning
    if (selectedSite?.gasifier_defaults && Array.isArray(selectedSite.gasifier_defaults) && selectedSite.gasifier_defaults.length > 0) {
      setShowTemplateWarning('Gasifier');
    }
  };
  
  // Remove a gasifier form
  const removeGasifierForm = (id: string) => {
    setGasifierForms(gasifierForms.filter(form => form.id !== id));
    
    // Remove the form data from gasifierObservationData
    const updatedData = { ...gasifierObservationData };
    delete updatedData[id];
    setGasifierObservationData(updatedData);
  };
  
  // Handle form submission
  const handleSave = async () => {
    if (!programId || !siteId || !submissionId) return;
    
    setIsSaving(true);
    
    try {
      // Use the observation data from the state variables
      // Get data from petri forms
      const validPetriData = Object.values(petriObservationData)
        .filter(data => data.hasData || data.observationId) // Only include forms with data or existing observations
        .map(data => ({
          petriCode: data.petriCode,
          imageFile: data.imageFile,
          imageUrl: data.imageUrl,
          plantType: data.plantType || 'Other Fresh Perishable',
          fungicideUsed: data.fungicideUsed,
          surroundingWaterSchedule: data.surroundingWaterSchedule,
          notes: data.notes,
          placement: data.placement,
          placement_dynamics: data.placement_dynamics,
          observationId: data.observationId,
          isValid: data.isValid,
          outdoor_temperature: data.outdoor_temperature,
          outdoor_humidity: data.outdoor_humidity,
          formId: data.formId,
          tempImageKey: data.tempImageKey,
          // Include all split image fields
          is_image_split: data.is_image_split,
          is_split_source: data.is_split_source,
          split_processed: data.split_processed,
          phase_observation_settings: data.phase_observation_settings,
          main_petri_id: data.main_petri_id
        }));
      
      // Get data from gasifier forms
      const validGasifierData = Object.values(gasifierObservationData)
        .filter(data => data.hasData || data.observationId) // Only include forms with data or existing observations
        .map(data => ({
          gasifierCode: data.gasifierCode,
          imageFile: data.imageFile,
          imageUrl: data.imageUrl,
          chemicalType: data.chemicalType,
          measure: data.measure,
          anomaly: data.anomaly,
          notes: data.notes,
          placementHeight: data.placementHeight,
          directionalPlacement: data.directionalPlacement,
          placementStrategy: data.placementStrategy,
          observationId: data.observationId,
          isValid: data.isValid,
          outdoor_temperature: data.outdoor_temperature,
          outdoor_humidity: data.outdoor_humidity,
          formId: data.formId,
          tempImageKey: data.tempImageKey,
        }));
      
      // If online, update the submission using the hook function
      if (isOnline) {
        const result = await updateSubmission(
          submissionId,
          submission.temperature,
          submission.humidity,
          submission.airflow,
          submission.odor_distance,
          submission.weather,
          submission.notes,
          validPetriData,
          validGasifierData,
          undefined,
          submission.indoor_temperature,
          submission.indoor_humidity_new
        );
        
        if (!result) {
          throw new Error("Failed to update submission");
        }
        
        // Update the session activity time
        if (session?.session_id) {
          await sessionManager.updateSessionActivity(session.session_id);
        }
        
        // Update observation IDs if they were created/changed during save
        if (result.updatedPetriObservations) {
          const petriIdMap = new Map(result.updatedPetriObservations.map(p => [p.clientId, p.observationId]));
          
          // Update the observation IDs in petriObservationData
          const updatedPetriData = { ...petriObservationData };
          for (const [clientId, observationId] of petriIdMap.entries()) {
            if (updatedPetriData[clientId]) {
              updatedPetriData[clientId] = {
                ...updatedPetriData[clientId],
                observationId,
                isDirty: false
              };
            }
          }
          setPetriObservationData(updatedPetriData);
        }
        
        if (result.updatedGasifierObservations) {
          const gasifierIdMap = new Map(result.updatedGasifierObservations.map(g => [g.clientId, g.observationId]));
          
          // Update the observation IDs in gasifierObservationData
          const updatedGasifierData = { ...gasifierObservationData };
          for (const [clientId, observationId] of gasifierIdMap.entries()) {
            if (updatedGasifierData[clientId]) {
              updatedGasifierData[clientId] = {
                ...updatedGasifierData[clientId],
                observationId,
                isDirty: false
              };
            }
          }
          setGasifierObservationData(updatedGasifierData);
        }
        
        // Reset dirty flags for all forms
        petriForms.forEach(form => {
          if (form.ref.current?.resetDirty) {
            form.ref.current.resetDirty();
          }
        });
        
        gasifierForms.forEach(form => {
          if (form.ref.current?.resetDirty) {
            form.ref.current.resetDirty();
          }
        });
        
        // Update form state to reflect dirty flag reset
        setPetriForms(forms => forms.map(form => ({...form, isDirty: false})));
        setGasifierForms(forms => forms.map(form => ({...form, isDirty: false})));
        
        toast.success('Submission saved successfully');
      } else {
        // If offline, store the changes locally
        await offlineStorage.saveSubmissionOffline(
          submission,
          validPetriData,
          validGasifierData
        );
        
        toast.info('Changes saved locally and will sync when online');
      }
    } catch (error) {
      logger.error('Error saving submission:', error);
      toast.error('Failed to save submission');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle form completion (marking as done)
  const handleComplete = async () => {
    // First, check if any forms are dirty and save if needed
    const hasDirtyForms = 
      petriForms.some(form => form.isDirty) ||
      gasifierForms.some(form => form.isDirty);
    
    if (hasDirtyForms) {
      const confirmed = window.confirm('You have unsaved changes. Save them before completing?');
      if (confirmed) {
        await handleSave();
      }
    }
    
    // Now check if we have the expected number of observations
    const validPetriCount = petriForms.filter(f => f.isValid).length;
    const validGasifierCount = gasifierForms.filter(f => f.isValid).length;
    
    const hasMissingObservations = 
      (expectedPetriCount > 0 && validPetriCount < expectedPetriCount) ||
      (expectedGasifierCount > 0 && validGasifierCount < expectedGasifierCount);
    
    if (hasMissingObservations) {
      // Show confirmation modal
      setShowConfirmModal(true);
      return;
    }
    
    // If all observations are present or confirmed, complete the session
    await completeSession();
  };
  
  // Complete the session
  const completeSession = async () => {
    if (!session?.session_id) {
      toast.error('No active session to complete');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const result = await sessionManager.completeSubmissionSession(session.session_id);
      
      if (result.success) {
        toast.success('Submission completed successfully!');
        // Update session data
        setSession(result.session);
        // Navigate back to submissions list
        navigate(`/programs/${programId}/sites/${siteId}`);
      } else {
        throw new Error(result.message || 'Failed to complete session');
      }
    } catch (error) {
      logger.error('Error completing session:', error);
      toast.error('Failed to complete submission');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle cancelling the submission
  const handleCancel = async () => {
    if (!session?.session_id) {
      navigate(`/programs/${programId}/sites/${siteId}`);
      return;
    }
    
    const confirmed = window.confirm(
      'Are you sure you want to cancel this submission? All changes will be lost and the submission will be deleted.'
    );
    
    if (!confirmed) return;
    
    setIsSaving(true);
    
    try {
      const { success, message } = await sessionManager.cancelSubmissionSession(session.session_id);
      
      if (success) {
        toast.success('Submission cancelled');
        // Navigate back to submissions list
        navigate(`/programs/${programId}/sites/${siteId}`);
      } else {
        throw new Error(message || 'Failed to cancel session');
      }
    } catch (error) {
      logger.error('Error cancelling session:', error);
      toast.error('Failed to cancel submission');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle sharing the submission
  const handleShare = async () => {
    if (!canEditSubmission) {
      setPermissionMessage("You don't have permission to share this submission with others.");
      setShowPermissionModal(true);
      return;
    }
    
    // Show sharing modal
    setShowShareModal(true);
  };
  
  // Update completed petri count
  useEffect(() => {
    const completedCount = petriForms.filter(form => form.isValid).length;
    setCompletedPetriCount(completedCount);
  }, [petriForms]);
  
  // Update completed gasifier count
  useEffect(() => {
    const completedCount = gasifierForms.filter(form => form.isValid).length;
    setCompletedGasifierCount(completedCount);
  }, [gasifierForms]);

  // Handle session expiration checking
  useEffect(() => {
    const checkSessionExpiration = () => {
      if (!session?.session_start_time) return;
      
      const sessionStart = new Date(session.session_start_time);
      const expirationTime = new Date(sessionStart);
      expirationTime.setHours(23, 59, 59, 999);
      
      const now = new Date();
      const hoursRemaining = (expirationTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      setIsSessionExpiring(hoursRemaining <= 1 && hoursRemaining > 0);
      setIsSessionExpired(now > expirationTime);
    };
    
    // Check immediately
    checkSessionExpiration();
    
    // Set up timer to check every minute
    sessionTimerRef.current = setInterval(checkSessionExpiration, 60 * 1000);
    
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
  }, [session]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!submission) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Submission not found</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
        >
          Go Back
        </Button>
      </div>
    );
  }

  // Check if session is in a state where editing is not allowed
  const isSessionReadOnly = 
    session && ['Completed', 'Cancelled', 'Expired', 'Expired-Complete', 'Expired-Incomplete'].includes(session.session_status);

  // Helper function to render the weather icon based on the weather value
  const renderWeatherIcon = (weather: string) => {
    switch(weather.toLowerCase()) {
      case 'clear':
        return <Sun className="text-yellow-500 mr-2" size={18} />;
      case 'cloudy':
        return <Cloud className="text-gray-500 mr-2" size={18} />;
      case 'rain':
        return <CloudRain className="text-blue-500 mr-2" size={18} />;
      default:
        return <Sun className="text-yellow-500 mr-2" size={18} />;
    }
  };

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
        <div className="flex-grow">
          <h1 className="text-2xl font-bold text-gray-900">
            {submission.global_submission_id 
              ? `Submission #${submission.global_submission_id}` 
              : 'Edit Submission'}
          </h1>
          <p className="text-gray-600 mt-1">
            {selectedSite?.name} - {format(new Date(submission.created_at), 'PPp')}
          </p>
        </div>
        
        <div className="hidden md:flex space-x-2">
          {!isSessionReadOnly && (
            <>
              <Button
                variant="danger"
                onClick={handleCancel}
                isLoading={isSaving}
                disabled={!canEditSubmission}
                icon={<XCircle size={16} />}
                testId="cancel-submission-button"
              >
                Cancel
              </Button>

              <Button
                variant="outline"
                onClick={handleShare}
                icon={<Share2 size={16} />}
                testId="share-submission-button"
              >
                Share
              </Button>
              
              <Button
                variant="outline"
                onClick={handleSave}
                isLoading={isSaving}
                disabled={!canEditSubmission}
                icon={<Save size={16} />}
                testId="save-submission-button"
              >
                Save
              </Button>
              
              <Button
                variant="primary"
                onClick={handleComplete}
                isLoading={isSaving}
                disabled={
                  !canEditSubmission ||
                  completedPetriCount < filteredPetriObservations.length ||
                  completedGasifierCount < gasifierObservations.length
                }
                icon={<CheckCircle size={16} />}
                testId="complete-submission-button"
              >
                Complete
              </Button>
            </>
          )}
          
          {isSessionReadOnly && (
            <Button
              variant="outline"
              onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
              icon={<ArrowLeft size={16} />}
            >
              Back to Submissions
            </Button>
          )}
        </div>
      </div>
      
      {isSessionExpired && !isSessionReadOnly && (
        <div className="bg-error-50 border-l-4 border-error-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-error-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-error-800">Session Expired</h3>
              <div className="mt-2 text-sm text-error-700">
                <p>
                  This session has expired. You must complete your submission before midnight on the day it was started.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {isSessionExpiring && !isSessionReadOnly && (
        <div className="bg-warning-50 border-l-4 border-warning-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-warning-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-warning-800">Session Expiring Soon</h3>
              <div className="mt-2 text-sm text-warning-700">
                <p>
                  This session will expire at midnight tonight. Please complete your submission before then.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Combined Submission Overview Card - Session details & progress */}
      <SubmissionOverviewCard
        session={session}
        submissionCreatedAt={submission?.created_at}
        openedByUserEmail={creatorEmail}
        openedByUserName={creatorName}
        onShare={handleShare}
        canShare={canEditSubmission && !isSessionReadOnly}
        petrisComplete={completedPetriCount}
        petrisTotal={filteredPetriObservations.length}
        gasifiersComplete={completedGasifierCount}
        gasifiersTotal={gasifierObservations.length}
      />

      {/* Two-column layout for Petri and Gasifier observations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Petri Observations */}
        <Card>
          <CardHeader className="flex justify-between items-center cursor-pointer" onClick={() => setIsPetriAccordionOpen(!isPetriAccordionOpen)}>
            <h2 className="font-medium">Petri Observations</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">{completedPetriCount}/{filteredPetriObservations.length} Complete</span>
              {isPetriAccordionOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CardHeader>
          {isPetriAccordionOpen && (
            <CardContent>
              <div className="space-y-4">
                {petriForms.map((form, index) => {
                  // Find the corresponding observation data
                  const observation = petriObservations.find(obs => obs.observation_id === form.id);
                  
                  // Skip rendering if this is a child split record
                  if (observation?.is_image_split && !observation?.is_split_source && observation?.main_petri_id) {
                    return null;
                  }
                  
                  logger.debug(`Rendering PetriForm ${form.id}`, { 
                    tempImageKey: form.tempImageKey || 'undefined',
                    is_image_split: observation?.is_image_split,
                    is_split_source: observation?.is_split_source,
                    main_petri_id: observation?.main_petri_id
                  });
                  
                  return (
                    <PetriForm
                      key={form.id}
                      id={`petri-form-${form.id}`}
                      formId={form.id}
                      index={index + 1}
                      siteId={siteId!}
                      submissionSessionId={session?.session_id || submissionId!}
                      ref={form.ref}
                      onUpdate={(formId, data) => {
                        // Store complete data in petriObservationData
                        setPetriObservationData(prevData => ({
                          ...prevData,
                          [form.id]: {
                            ...data,
                            formId: form.id
                          }
                        }));
                        
                        // Update form validation state
                        setPetriForms(prevForms => 
                          prevForms.map(f => 
                            f.id === form.id 
                              ? { ...f, isValid: data.isValid, isDirty: data.isDirty || f.isDirty } 
                              : f
                          )
                        );
                        
                        logger.debug(`Petri form ${form.id} updated with data:`, { 
                          petriCode: data.petriCode,
                          hasImageFile: !!data.imageFile,
                          tempImageKey: data.tempImageKey,
                          isValid: data.isValid,
                          isDirty: data.isDirty,
                          hasImage: data.hasImage,
                          is_image_split: data.is_image_split,
                          is_split_source: data.is_split_source,
                          main_petri_id: data.main_petri_id
                        });
                      }}
                      onRemove={() => removePetriForm(form.id)}
                      showRemoveButton={petriForms.length > 1}
                      initialData={observation ? {
                        petriCode: observation.petri_code,
                        imageUrl: observation.image_url,
                        tempImageKey: form.tempImageKey, // Pass the tempImageKey from form state
                        plantType: observation.plant_type,
                        fungicideUsed: observation.fungicide_used,
                        surroundingWaterSchedule: observation.surrounding_water_schedule,
                        notes: observation.notes || '',
                        placement: observation.placement,
                        placement_dynamics: observation.placement_dynamics,
                        observationId: observation.observation_id,
                        outdoor_temperature: observation.outdoor_temperature,
                        outdoor_humidity: observation.outdoor_humidity,
                        // Include all split image fields
                        is_image_split: observation.is_image_split,
                        is_split_source: observation.is_split_source,
                        split_processed: observation.split_processed,
                        phase_observation_settings: observation.phase_observation_settings,
                        main_petri_id: observation.main_petri_id
                      } : undefined}
                      disabled={isSessionReadOnly}
                      observationId={form.observationId}
                      submissionOutdoorTemperature={submission.temperature}
                      submissionOutdoorHumidity={submission.humidity}
                    />
                  );
                })}
                
                {!isSessionReadOnly && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      onClick={addPetriForm}
                      disabled={isSaving}
                      testId="add-petri-form-button"
                    >
                      Add Petri Sample
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
        
        {/* Gasifier Observations */}
        <Card>
          <CardHeader className="flex justify-between items-center cursor-pointer" onClick={() => setIsGasifierAccordionOpen(!isGasifierAccordionOpen)}>
            <h2 className="font-medium">Gasifier Observations</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">{completedGasifierCount}/{gasifierObservations.length} Complete</span>
              {isGasifierAccordionOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CardHeader>
          {isGasifierAccordionOpen && (
            <CardContent>
              <div className="space-y-4">
                {gasifierForms.map((form, index) => (
                  <GasifierForm
                    key={form.id}
                    id={`gasifier-form-${form.id}`}
                    formId={form.id}
                    index={index + 1}
                    siteId={siteId!}
                    submissionSessionId={session?.session_id || submissionId!}
                    ref={form.ref}
                    onUpdate={(formId, data) => {
                      // Store complete data in gasifierObservationData
                      setGasifierObservationData(prevData => ({
                        ...prevData,
                        [form.id]: {
                          ...data,
                          formId: form.id
                        }
                      }));
                      
                      // Update form validation state
                      setGasifierForms(prevForms => 
                        prevForms.map(f => 
                          f.id === form.id 
                            ? { ...f, isValid: data.isValid, isDirty: data.isDirty || f.isDirty } 
                            : f
                        )
                      );
                      
                      logger.debug(`Gasifier form ${form.id} updated with data:`, { 
                        gasifierCode: data.gasifierCode,
                        hasImageFile: !!data.imageFile,
                        tempImageKey: data.tempImageKey,
                        isValid: data.isValid,
                        isDirty: data.isDirty,
                        hasImage: data.hasImage
                      });
                    }}
                    onRemove={() => removeGasifierForm(form.id)}
                    showRemoveButton={gasifierForms.length > 1}
                    initialData={gasifierObservations.find(obs => obs.observation_id === form.id) ? {
                      gasifierCode: gasifierObservations.find(obs => obs.observation_id === form.id).gasifier_code,
                      imageUrl: gasifierObservations.find(obs => obs.observation_id === form.id).image_url,
                      tempImageKey: form.tempImageKey, // Pass the tempImageKey from form state
                      chemicalType: gasifierObservations.find(obs => obs.observation_id === form.id).chemical_type,
                      measure: gasifierObservations.find(obs => obs.observation_id === form.id).measure,
                      anomaly: gasifierObservations.find(obs => obs.observation_id === form.id).anomaly,
                      placementHeight: gasifierObservations.find(obs => obs.observation_id === form.id).placement_height,
                      directionalPlacement: gasifierObservations.find(obs => obs.observation_id === form.id).directional_placement,
                      placementStrategy: gasifierObservations.find(obs => obs.observation_id === form.id).placement_strategy,
                      notes: gasifierObservations.find(obs => obs.observation_id === form.id).notes || '',
                      observationId: gasifierObservations.find(obs => obs.observation_id === form.id).observation_id,
                      outdoor_temperature: gasifierObservations.find(obs => obs.observation_id === form.id).outdoor_temperature,
                      outdoor_humidity: gasifierObservations.find(obs => obs.observation_id === form.id).outdoor_humidity
                    } : undefined}
                    disabled={isSessionReadOnly}
                    observationId={form.observationId}
                    submissionOutdoorTemperature={submission.temperature}
                    submissionOutdoorHumidity={submission.humidity}
                  />
                ))}
                
                {!isSessionReadOnly && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      onClick={addGasifierForm}
                      disabled={isSaving}
                      testId="add-gasifier-form-button"
                    >
                      Add Gasifier Sample
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Submission details - Now moved below the observations with icons */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-medium">Submission Details</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Outdoor Environment</h3>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Thermometer className="text-error-500 mr-2" size={18} />
                  <div className="text-sm">
                    <span className="text-gray-500">Outdoor:</span> 
                    <span className="ml-1 font-medium">{submission.temperature}°F</span>
                    <span className="mx-1 text-gray-400">|</span>
                    <span className="text-gray-500">Indoor:</span> 
                    <span className="ml-1 font-medium">
                      {submission.indoor_temperature ? `${submission.indoor_temperature}°F` : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center">
                  <Droplets className="text-secondary-500 mr-2" size={18} />
                  <div className="text-sm">
                    <span className="text-gray-500">Outdoor:</span> 
                    <span className="ml-1 font-medium">{submission.humidity}%</span>
                    <span className="mx-1 text-gray-400">|</span>
                    <span className="text-gray-500">Indoor:</span> 
                    <span className="ml-1 font-medium">
                      {submission.indoor_humidity ? `${submission.indoor_humidity}%` : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center">
                  {renderWeatherIcon(submission.weather)}
                  <div className="text-sm">
                    <span className="text-gray-500">Weather:</span> 
                    <span className="ml-1 font-medium">{submission.weather}</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <Wind className="text-primary-500 mr-2" size={18} />
                  <div className="text-sm">
                    <span className="text-gray-500">Airflow:</span> 
                    <span className="ml-1 font-medium">{submission.airflow}</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <Ruler className="text-primary-500 mr-2" size={18} />
                  <div className="text-sm">
                    <span className="text-gray-500">Odor Distance:</span> 
                    <span className="ml-1 font-medium">{submission.odor_distance}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Details</h3>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Calendar className="text-primary-500 mr-2" size={18} />
                  <span className="text-sm">
                    {format(new Date(submission.created_at), 'PPp')}
                  </span>
                </div>
                {submission.created_by && (
                  <div className="flex items-center">
                    <User className="text-primary-500 mr-2" size={18} />
                    <span className="text-sm">
                      {submission.created_by_name || 'User'}
                    </span>
                  </div>
                )}
                {session?.last_activity_time && (
                  <div className="flex items-center">
                    <Calendar className="text-primary-500 mr-2" size={18} />
                    <div className="text-sm">
                      <span className="text-gray-500">Last activity:</span>
                      <span className="ml-1 font-medium">
                        {format(new Date(session.last_activity_time), 'Pp')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Observations Summary */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Observations</h3>
              <div className="space-y-2">
                <div className="p-2 bg-primary-50 rounded-md border border-primary-100">
                  <div className="flex justify-between">
                    <span className="text-sm text-primary-800">Petri Samples:</span>
                    <span className="font-medium">{filteredPetriObservations.length}</span>
                  </div>
                </div>
                <div className="p-2 bg-accent-50 rounded-md border border-accent-100">
                  <div className="flex justify-between">
                    <span className="text-sm text-accent-800">Gasifier Samples:</span>
                    <span className="font-medium">{gasifierObservations.length}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {submission.notes && (
              <div className="md:col-span-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border border-gray-100">
                  {submission.notes}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Action buttons for mobile (fixed at bottom) */}
      {!isSessionReadOnly && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex space-x-2 z-10">
          <Button
            variant="outline"
            onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            variant="danger"
            onClick={handleCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            isLoading={isSaving}
            className="flex-1"
            disabled={!canEditSubmission}
          >
            Save
          </Button>
          <Button
            variant="primary"
            onClick={handleComplete}
            isLoading={isSaving}
            className="flex-1"
            disabled={
              !canEditSubmission ||
              completedPetriCount < filteredPetriObservations.length ||
              completedGasifierCount < gasifierObservations.length
            }
          >
            Complete
          </Button>
        </div>
      )}
      
      {/* Template warning modal */}
      <TemplateWarningModal
        isOpen={!!showTemplateWarning}
        onClose={() => setShowTemplateWarning(null)}
        onConfirm={() => {}}
        entityType={showTemplateWarning || 'Petri'}
      />
      
      {/* Confirmation modal for incomplete submissions */}
      <ConfirmSubmissionModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={completeSession}
        currentPetriCount={petriForms.filter(f => f.isValid).length}
        currentGasifierCount={gasifierForms.filter(f => f.isValid).length}
        expectedPetriCount={expectedPetriCount}
        expectedGasifierCount={expectedGasifierCount}
        siteName={selectedSite?.name || ''}
      />
      
      {/* Permission modal */}
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        message={permissionMessage}
      />
      
      {/* Share modal */}
      {showShareModal && session && (
        <SessionShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          sessionId={session.session_id}
          programId={programId!}
        />
      )}
    </div>
  );
};

export default SubmissionEditPage;