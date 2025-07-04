import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { ArrowLeft, AlertTriangle, Clock, Users, Check, X, Share2, Triangle as ExclamationTriangle, Plus, FilePlus } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { useSites } from '../hooks/useSites';
import { useSubmissions } from '../hooks/useSubmissions';
import { useAuthStore } from '../stores/authStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import LoadingScreen from '../components/common/LoadingScreen';
import PermissionModal from '../components/common/PermissionModal';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import ConfirmSubmissionModal from '../components/submissions/ConfirmSubmissionModal';
import TemplateWarningModal from '../components/submissions/TemplateWarningModal';
import SessionShareModal from '../components/submissions/SessionShareModal';
import SubmissionOverviewCard from '../components/submissions/SubmissionOverviewCard';
import PetriForm, { PetriFormRef } from '../components/submissions/PetriForm';
import GasifierForm, { GasifierFormRef } from '../components/submissions/GasifierForm';
import ObservationListManager, { ObservationFormState } from '../components/forms/ObservationListManager';
import useUserRole from '../hooks/useUserRole';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-toastify';
import sessionManager from '../lib/sessionManager';
import { useSessionStore } from '../stores/sessionStore';
import SyncStatus from '../components/common/SyncStatus';
import { ChemicalType, DirectionalPlacement, PlacementHeight, PlacementStrategy } from '../lib/types';
import { PetriFormData, GasifierFormData } from '../utils/submissionUtils';
import { createLogger } from '../utils/logger';

// Create a component-specific logger
const logger = createLogger('SubmissionEditPage');

// Validation schema for the submission form
const SubmissionSchema = Yup.object().shape({
  temperature: Yup.number()
    .required('Temperature is required')
    .min(-30, 'Temperature must be at least -30°F')
    .max(120, 'Temperature must be at most 120°F'),
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
    .max(255, 'Notes must be less than 255 characters')
});

// Extending the ObservationFormState for petri observations
interface PetriFormState extends ObservationFormState {
  petriCode: string;
  fungicideUsed: 'Yes' | 'No';
  surroundingWaterSchedule: string;
  placement?: string | null;
  is_split_source?: boolean;
}

// Extending the ObservationFormState for gasifier observations
interface GasifierFormState extends ObservationFormState {
  gasifierCode: string;
  chemicalType: ChemicalType;
  measure: number | null;
  anomaly: boolean;
  placementHeight?: PlacementHeight | null;
  directionalPlacement?: DirectionalPlacement | null;
  placementStrategy?: PlacementStrategy | null;
}

const SubmissionEditPage = () => {
  const navigate = useNavigate();
  const { programId, siteId, submissionId } = useParams<{ programId: string; siteId: string; submissionId: string }>();
  const { user } = useAuthStore();
  const { selectedProgram, selectedSite, setSelectedProgram, setSelectedSite } = usePilotProgramStore();
  const { 
    submissions, 
    fetchSubmissions, 
    fetchSubmissionPetriObservations, 
    fetchSubmissionGasifierObservations,
    updateSubmission
  } = useSubmissions(siteId);
  const { fetchSite, fetchPilotProgram } = useSites(programId);
  const { canEditSubmission, canCreateSubmission } = useUserRole({ programId });
  const isOnline = useOnlineStatus();
  
  // Session management
  const { setCurrentSessionId } = useSessionStore();
  
  // State for forms and modals
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [petriObservations, setPetriObservations] = useState<any[]>([]);
  const [gasifierObservations, setGasifierObservations] = useState<any[]>([]);
  const [petriFormStates, setPetriFormStates] = useState<PetriFormState[]>([]);
  const [gasifierFormStates, setGasifierFormStates] = useState<GasifierFormState[]>([]);
  const [isPetriAccordionOpen, setIsPetriAccordionOpen] = useState(true);
  const [isGasifierAccordionOpen, setIsGasifierAccordionOpen] = useState(true);
  const [showPetriTemplateWarning, setShowPetriTemplateWarning] = useState(false);
  const [showGasifierTemplateWarning, setShowGasifierTemplateWarning] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error' | 'reconnecting'>('synced');
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);
  const [isSessionCancelled, setIsSessionCancelled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // References to the form components for validation
  const petriFormRefs = useRef<{ [id: string]: PetriFormRef }>({});
  const gasifierFormRefs = useRef<{ [id: string]: GasifierFormRef }>({});
  
  // Load submission and related data
  const loadData = useCallback(async () => {
    if (!programId || !siteId || !submissionId) {
      navigate('/programs');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      logger.debug(`Loading submission data for ${submissionId}`);
      
      // Ensure we have the program and site data
      if (!selectedProgram || selectedProgram.program_id !== programId) {
        const program = await fetchPilotProgram(programId);
        if (program) {
          setSelectedProgram(program);
        } else {
          navigate('/programs');
          return;
        }
      }
      
      if (!selectedSite || selectedSite.site_id !== siteId) {
        const site = await fetchSite(siteId);
        if (site) {
          setSelectedSite(site);
        } else {
          navigate(`/programs/${programId}/sites`);
          return;
        }
      }
      
      // Get the submission and session data using the sessionManager utility
      const { submission: submissionData, session: sessionData } = await sessionManager.getSubmissionWithSession(submissionId);
      
      if (!submissionData) {
        logger.error(`Submission ${submissionId} not found`);
        toast.error('Submission not found');
        navigate(`/programs/${programId}/sites/${siteId}`);
        return;
      }
      
      logger.debug(`Submission loaded:`, {
        id: submissionData.submission_id, 
        site: submissionData.site_id, 
        program: submissionData.program_id,
        hasSession: !!sessionData
      });
      
      setSubmission(submissionData);
      setSession(sessionData);
      
      // Update the current session ID in the session store
      if (sessionData) {
        setCurrentSessionId(sessionData.session_id);
        
        // Check if the session is already completed or cancelled
        if (sessionData.session_status === 'Completed') {
          setIsSessionCompleted(true);
        } else if (sessionData.session_status === 'Cancelled') {
          setIsSessionCancelled(true);
        }
      }
      
      // Fetch petri observations
      const petriData = await fetchSubmissionPetriObservations(submissionId);
      logger.debug(`Loaded ${petriData.length} petri observations`);
      setPetriObservations(petriData);
      
      // Fetch gasifier observations
      const gasifierData = await fetchSubmissionGasifierObservations(submissionId);
      logger.debug(`Loaded ${gasifierData.length} gasifier observations`);
      setGasifierObservations(gasifierData);
      
      // Check if the user can edit the submission
      if (!canEditSubmission) {
        logger.debug('User does not have permission to edit this submission');
      }
      
      // Initialize form states for existing observations
      initializeFormStates(petriData, gasifierData);
    } catch (err) {
      logger.error('Error loading submission data:', err);
      setError('Failed to load submission data. Please try again later.');
      toast.error('Error loading submission data');
    } finally {
      setIsLoading(false);
    }
  }, [
    programId, 
    siteId, 
    submissionId, 
    navigate, 
    fetchPilotProgram, 
    fetchSite, 
    setSelectedProgram, 
    setSelectedSite, 
    selectedProgram, 
    selectedSite,
    fetchSubmissionPetriObservations,
    fetchSubmissionGasifierObservations,
    canEditSubmission,
    setCurrentSessionId
  ]);
  
  // Initialize form states from fetched observations
  const initializeFormStates = (petriData: any[], gasifierData: any[]) => {
    // Initialize petri form states
    const petriStates = petriData.filter(p => !p.main_petri_id).map(petri => {
      // Only include petri observations that aren't children of a split image
      return {
        id: uuidv4(),
        observationId: petri.observation_id,
        petriCode: petri.petri_code,
        fungicideUsed: petri.fungicide_used,
        surroundingWaterSchedule: petri.surrounding_water_schedule,
        placement: petri.placement,
        is_split_source: petri.is_split_source,
        isValid: true, // Assume existing records are valid
        isDirty: false, // Not modified yet
        hasImage: !!petri.image_url,
        hasData: true, // Existing record has data
      } as PetriFormState;
    });
    
    setPetriFormStates(petriStates);
    
    // Initialize gasifier form states
    const gasifierStates = gasifierData.map(gasifier => ({
      id: uuidv4(),
      observationId: gasifier.observation_id,
      gasifierCode: gasifier.gasifier_code,
      chemicalType: gasifier.chemical_type as ChemicalType,
      measure: gasifier.measure,
      anomaly: gasifier.anomaly,
      placementHeight: gasifier.placement_height as PlacementHeight,
      directionalPlacement: gasifier.directional_placement as DirectionalPlacement,
      placementStrategy: gasifier.placement_strategy as PlacementStrategy,
      isValid: true, // Assume existing records are valid
      isDirty: false, // Not modified yet
      hasImage: !!gasifier.image_url,
      hasData: true, // Existing record has data
    } as GasifierFormState));
    
    setGasifierFormStates(gasifierStates);
  };
  
  // Load data when component mounts
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Configure formik for the main submission form
  const formik = useFormik({
    initialValues: {
      temperature: submission?.temperature || 70,
      humidity: submission?.humidity || 50,
      indoor_temperature: submission?.indoor_temperature || '',
      indoor_humidity: submission?.indoor_humidity || '',
      airflow: submission?.airflow || 'Open',
      odorDistance: submission?.odor_distance || '5-10ft',
      weather: submission?.weather || 'Clear',
      notes: submission?.notes || '',
    },
    validationSchema: SubmissionSchema,
    enableReinitialize: true,
    onSubmit: async (values) => {
      if (!siteId || !submissionId) return;
      
      // Validate petri and gasifier forms
      const petriFormsValid = await validatePetriForms();
      const gasifierFormsValid = await validateGasifierForms();
      
      if (!petriFormsValid || !gasifierFormsValid) {
        toast.error('Please fix the errors in the forms before submitting');
        return;
      }
      
      // Process forms to extract observation data
      const petriObservationForms = await processPetriForms();
      const gasifierObservationForms = await processGasifierForms();
      
      // Check if expected number of forms match
      const hasAllExpectedForms = checkFormCompleteness();
      
      if (!hasAllExpectedForms) {
        // Show confirmation if not all expected forms are present
        setShowCompleteConfirm(true);
        return;
      }
      
      await submitForm(values, petriObservationForms, gasifierObservationForms, true);
    }
  });
  
  // Process and validate petri forms
  const validatePetriForms = async (): Promise<boolean> => {
    logger.debug(`Validating ${petriFormStates.length} petri forms`);
    
    let allValid = true;
    
    for (const formState of petriFormStates) {
      const ref = petriFormRefs.current[formState.id];
      
      if (ref) {
        const isValid = await ref.validate();
        if (!isValid) {
          allValid = false;
        }
      }
    }
    
    return allValid;
  };
  
  // Process and validate gasifier forms
  const validateGasifierForms = async (): Promise<boolean> => {
    logger.debug(`Validating ${gasifierFormStates.length} gasifier forms`);
    
    let allValid = true;
    
    for (const formState of gasifierFormStates) {
      const ref = gasifierFormRefs.current[formState.id];
      
      if (ref) {
        const isValid = await ref.validate();
        if (!isValid) {
          allValid = false;
        }
      }
    }
    
    return allValid;
  };
  
  // Process petri forms to get data for submission
  const processPetriForms = async (): Promise<PetriFormData[]> => {
    const result: PetriFormData[] = [];
    
    for (const formState of petriFormStates) {
      // Get the ref for this form
      const ref = petriFormRefs.current[formState.id];
      
      if (!ref) continue;
      
      // Find the corresponding observation in the form states
      const observationFormState = petriFormStates.find(fs => fs.id === formState.id);
      if (!observationFormState) continue;
      
      // Add to result
      result.push({
        formId: formState.id,
        petriCode: ref.petriCode,
        imageFile: null, // Will be populated by the individual form components
        imageUrl: undefined, // Will be populated by the individual form components
        plantType: 'Other Fresh Perishable',
        fungicideUsed: observationFormState.fungicideUsed || 'No',
        surroundingWaterSchedule: observationFormState.surroundingWaterSchedule || 'Daily',
        notes: '',
        placement: observationFormState.placement || null,
        placement_dynamics: null,
        isValid: observationFormState.isValid,
        hasData: observationFormState.hasData,
        hasImage: observationFormState.hasImage,
        observationId: observationFormState.observationId,
        isDirty: observationFormState.isDirty
      });
    }
    
    return result;
  };
  
  // Process gasifier forms to get data for submission
  const processGasifierForms = async (): Promise<GasifierFormData[]> => {
    const result: GasifierFormData[] = [];
    
    for (const formState of gasifierFormStates) {
      // Get the ref for this form
      const ref = gasifierFormRefs.current[formState.id];
      
      if (!ref) continue;
      
      // Find the corresponding observation in the form states
      const observationFormState = gasifierFormStates.find(fs => fs.id === formState.id);
      if (!observationFormState) continue;
      
      // Add to result
      result.push({
        formId: formState.id,
        gasifierCode: ref.gasifierCode,
        imageFile: null, // Will be populated by the individual form components
        imageUrl: undefined, // Will be populated by the individual form components
        chemicalType: observationFormState.chemicalType,
        measure: observationFormState.measure,
        anomaly: observationFormState.anomaly,
        placementHeight: observationFormState.placementHeight || null,
        directionalPlacement: observationFormState.directionalPlacement || null,
        placementStrategy: observationFormState.placementStrategy || null,
        notes: '',
        isValid: observationFormState.isValid,
        hasData: observationFormState.hasData,
        hasImage: observationFormState.hasImage,
        observationId: observationFormState.observationId,
        isDirty: observationFormState.isDirty
      });
    }
    
    return result;
  };
  
  // Check if all expected forms are present and valid
  const checkFormCompleteness = (): boolean => {
    if (!selectedSite) return true;
    
    // Check number of petri observations
    const expectedPetris = selectedSite.total_petris || 0;
    const actualPetris = petriFormStates.filter(form => form.isValid).length;
    
    // Check number of gasifier observations
    const expectedGasifiers = selectedSite.total_gasifiers || 0;
    const actualGasifiers = gasifierFormStates.filter(form => form.isValid).length;
    
    logger.debug(`Form completeness check:`, {
      expectedPetris,
      actualPetris,
      expectedGasifiers,
      actualGasifiers
    });
    
    // Return true if all expected forms are present and valid
    return actualPetris >= expectedPetris && actualGasifiers >= expectedGasifiers;
  };
  
  // Handle form submission
  const submitForm = async (
    formValues: typeof formik.values, 
    petriObservationForms: PetriFormData[], 
    gasifierObservationForms: GasifierFormData[],
    completeSession: boolean = false
  ) => {
    if (!programId || !siteId || !submissionId) return;
    
    setIsSubmitting(true);
    
    try {
      // Update the submission
      const result = await updateSubmission(
        submissionId,
        Number(formValues.temperature),
        Number(formValues.humidity),
        formValues.airflow as 'Open' | 'Closed',
        formValues.odorDistance as '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
        formValues.weather as 'Clear' | 'Cloudy' | 'Rain',
        formValues.notes || null,
        petriObservationForms,
        gasifierObservationForms,
        formValues.indoor_temperature ? Number(formValues.indoor_temperature) : null,
        formValues.indoor_humidity ? Number(formValues.indoor_humidity) : null
      );
      
      if (result) {
        if (completeSession && session) {
          // Complete the session
          const completionResult = await sessionManager.completeSubmissionSession(session.session_id);
          
          if (completionResult.success) {
            setIsSessionCompleted(true);
            toast.success('Submission completed successfully');
            
            // Navigate back to the submissions list
            navigate(`/programs/${programId}/sites/${siteId}`);
          } else {
            toast.error('Failed to complete submission: ' + (completionResult.message || 'Unknown error'));
          }
        } else {
          toast.success('Submission saved successfully');
          
          // Refresh the data
          loadData();
          
          // Reset dirty flags on all forms
          resetFormDirtyFlags();
        }
      } else {
        toast.error('Failed to save submission');
      }
    } catch (error) {
      logger.error('Error submitting form:', error);
      toast.error('Error saving submission');
    } finally {
      setIsSubmitting(false);
      setShowCompleteConfirm(false);
    }
  };
  
  // Handle saving without completing
  const handleSaveDraft = async () => {
    // Process forms to extract observation data
    const petriObservationForms = await processPetriForms();
    const gasifierObservationForms = await processGasifierForms();
    
    // Submit without completing the session
    await submitForm(formik.values, petriObservationForms, gasifierObservationForms, false);
  };
  
  // Handle completing the submission after confirmation
  const handleCompleteConfirmed = async () => {
    // Process forms to extract observation data
    const petriObservationForms = await processPetriForms();
    const gasifierObservationForms = await processGasifierForms();
    
    // Submit and complete the session
    await submitForm(formik.values, petriObservationForms, gasifierObservationForms, true);
  };
  
  // Handle cancelling the session
  const handleCancelSession = async () => {
    if (!session) return;
    
    try {
      const result = await sessionManager.cancelSubmissionSession(session.session_id);
      
      if (result) {
        setIsSessionCancelled(true);
        toast.success('Session cancelled successfully');
        
        // Navigate back to the submissions list
        navigate(`/programs/${programId}/sites/${siteId}`);
      } else {
        toast.error('Failed to cancel session');
      }
    } catch (error) {
      logger.error('Error cancelling session:', error);
      toast.error('Error cancelling session');
    } finally {
      setShowCancelConfirm(false);
    }
  };
  
  // Handle sharing the session
  const handleShareSession = () => {
    if (!session) return;
    
    setShowShareModal(true);
  };
  
  // Handle escalating the session
  const handleEscalateSession = async () => {
    if (!session || !programId) return;
    
    try {
      const result = await sessionManager.escalateSubmissionSession(session.session_id, programId);
      
      if (result.success) {
        toast.success('Session escalated to program admin successfully');
        
        // Reload data to reflect the new session status
        loadData();
      } else {
        toast.error('Failed to escalate session: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      logger.error('Error escalating session:', error);
      toast.error('Error escalating session');
    }
  };
  
  // Create a new petri observation form
  const createEmptyPetriObservation = (): PetriFormState => {
    return {
      id: uuidv4(),
      petriCode: `P${(petriFormStates.length + 1).toString().padStart(2, '0')}`,
      fungicideUsed: 'No' as 'Yes' | 'No',
      surroundingWaterSchedule: 'Daily',
      placement: null,
      isValid: false,
      isDirty: true,
      hasImage: false,
      hasData: true
    };
  };
  
  // Create a new gasifier observation form
  const createEmptyGasifierObservation = (): GasifierFormState => {
    return {
      id: uuidv4(),
      gasifierCode: `G${(gasifierFormStates.length + 1).toString().padStart(2, '0')}`,
      chemicalType: 'CLO2',
      measure: null,
      anomaly: false,
      placementHeight: null,
      directionalPlacement: null,
      placementStrategy: null,
      isValid: false,
      isDirty: true,
      hasImage: false,
      hasData: true
    };
  };
  
  // Update a petri form's state
  const handleUpdatePetriForm = (formId: string, data: any) => {
    setPetriFormStates(prev => 
      prev.map(form => 
        form.id === formId 
          ? { 
              ...form, 
              ...data,
              // Only override these specific properties if they're in the data
              petriCode: data.petriCode !== undefined ? data.petriCode : form.petriCode,
              fungicideUsed: data.fungicideUsed !== undefined ? data.fungicideUsed : form.fungicideUsed,
              surroundingWaterSchedule: data.surroundingWaterSchedule !== undefined ? data.surroundingWaterSchedule : form.surroundingWaterSchedule,
              placement: data.placement !== undefined ? data.placement : form.placement,
              is_split_source: data.is_split_source !== undefined ? data.is_split_source : form.is_split_source,
              isValid: data.isValid !== undefined ? data.isValid : form.isValid,
              isDirty: data.isDirty !== undefined ? data.isDirty : form.isDirty,
              hasImage: data.hasImage !== undefined ? data.hasImage : form.hasImage,
              observationId: data.observationId || form.observationId
            } 
          : form
      )
    );
  };
  
  // Update a gasifier form's state
  const handleUpdateGasifierForm = (formId: string, data: any) => {
    setGasifierFormStates(prev => 
      prev.map(form => 
        form.id === formId 
          ? { 
              ...form, 
              ...data,
              // Only override these specific properties if they're in the data
              gasifierCode: data.gasifierCode !== undefined ? data.gasifierCode : form.gasifierCode,
              chemicalType: data.chemicalType !== undefined ? data.chemicalType : form.chemicalType,
              measure: data.measure !== undefined ? data.measure : form.measure,
              anomaly: data.anomaly !== undefined ? data.anomaly : form.anomaly,
              placementHeight: data.placementHeight !== undefined ? data.placementHeight : form.placementHeight,
              directionalPlacement: data.directionalPlacement !== undefined ? data.directionalPlacement : form.directionalPlacement,
              placementStrategy: data.placementStrategy !== undefined ? data.placementStrategy : form.placementStrategy,
              isValid: data.isValid !== undefined ? data.isValid : form.isValid,
              isDirty: data.isDirty !== undefined ? data.isDirty : form.isDirty,
              hasImage: data.hasImage !== undefined ? data.hasImage : form.hasImage,
              observationId: data.observationId || form.observationId
            } 
          : form
      )
    );
  };
  
  // Reset dirty flags on all forms after successful save
  const resetFormDirtyFlags = () => {
    // Reset petri forms
    petriFormStates.forEach(form => {
      const ref = petriFormRefs.current[form.id];
      if (ref) {
        ref.resetDirty();
      }
    });
    
    // Reset gasifier forms
    gasifierFormStates.forEach(form => {
      const ref = gasifierFormRefs.current[form.id];
      if (ref) {
        ref.resetDirty();
      }
    });
    
    // Update form states
    setPetriFormStates(prev => prev.map(form => ({ ...form, isDirty: false })));
    setGasifierFormStates(prev => prev.map(form => ({ ...form, isDirty: false })));
  };
  
  // Check if any forms are dirty (modified)
  const hasUnsavedChanges = (): boolean => {
    const formikDirty = formik.dirty;
    const petriDirty = petriFormStates.some(form => form.isDirty);
    const gasifierDirty = gasifierFormStates.some(form => form.isDirty);
    
    return formikDirty || petriDirty || gasifierDirty;
  };
  
  // Warn about unsaved changes before navigating away
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [formik.dirty, petriFormStates, gasifierFormStates]);
  
  // Count valid observations
  const countValidObservations = () => {
    const validPetris = petriFormStates.filter(form => form.isValid).length;
    const validGasifiers = gasifierFormStates.filter(form => form.isValid).length;
    
    return {
      petrisComplete: validPetris,
      petrisTotal: selectedSite?.total_petris || 0,
      gasifiersComplete: validGasifiers,
      gasifiersTotal: selectedSite?.total_gasifiers || 0
    };
  };
  
  // Render a petri form component
  const renderPetriForm = (
    observation: PetriFormState, 
    index: number, 
    onUpdate: (data: any) => void,
    onRemove: () => void,
    showRemoveButton: boolean,
    disabled: boolean
  ) => {
    // Find the matching petri observation from the fetched data
    const observationData = observation.observationId
      ? petriObservations.find(p => p.observation_id === observation.observationId)
      : null;
      
    return (
      <PetriForm
        key={observation.id}
        id={`petri-form-${observation.id}`}
        formId={observation.id}
        index={index}
        siteId={siteId || ''}
        submissionSessionId={session?.session_id || submissionId || ''}
        onUpdate={onUpdate}
        onRemove={onRemove}
        showRemoveButton={showRemoveButton}
        initialData={observationData ? {
          petriCode: observationData.petri_code,
          imageUrl: observationData.image_url,
          plantType: observationData.plant_type,
          fungicideUsed: observationData.fungicide_used,
          surroundingWaterSchedule: observationData.surrounding_water_schedule,
          notes: observationData.notes || '',
          placement: observationData.placement,
          placement_dynamics: observationData.placement_dynamics,
          observationId: observationData.observation_id,
          outdoor_temperature: observationData.outdoor_temperature,
          outdoor_humidity: observationData.outdoor_humidity,
          is_image_split: observationData.is_image_split,
          is_split_source: observationData.is_split_source,
          split_processed: observationData.split_processed,
          phase_observation_settings: observationData.phase_observation_settings,
          main_petri_id: observationData.main_petri_id
        } : undefined}
        disabled={disabled}
        ref={ref => {
          if (ref) {
            petriFormRefs.current[observation.id] = ref;
          }
        }}
        submissionOutdoorTemperature={submission?.temperature}
        submissionOutdoorHumidity={submission?.humidity}
      />
    );
  };
  
  // Render a gasifier form component
  const renderGasifierForm = (
    observation: GasifierFormState, 
    index: number, 
    onUpdate: (data: any) => void,
    onRemove: () => void,
    showRemoveButton: boolean,
    disabled: boolean
  ) => {
    // Find the matching gasifier observation from the fetched data
    const observationData = observation.observationId
      ? gasifierObservations.find(g => g.observation_id === observation.observationId)
      : null;
      
    return (
      <GasifierForm
        key={observation.id}
        id={`gasifier-form-${observation.id}`}
        formId={observation.id}
        index={index}
        siteId={siteId || ''}
        submissionSessionId={session?.session_id || submissionId || ''}
        onUpdate={onUpdate}
        onRemove={onRemove}
        showRemoveButton={showRemoveButton}
        initialData={observationData ? {
          gasifierCode: observationData.gasifier_code,
          imageUrl: observationData.image_url,
          chemicalType: observationData.chemical_type,
          measure: observationData.measure,
          anomaly: observationData.anomaly,
          placementHeight: observationData.placement_height,
          directionalPlacement: observationData.directional_placement,
          placementStrategy: observationData.placement_strategy,
          notes: observationData.notes || '',
          observationId: observationData.observation_id,
          outdoor_temperature: observationData.outdoor_temperature,
          outdoor_humidity: observationData.outdoor_humidity
        } : undefined}
        disabled={disabled}
        ref={ref => {
          if (ref) {
            gasifierFormRefs.current[observation.id] = ref;
          }
        }}
        submissionOutdoorTemperature={submission?.temperature}
        submissionOutdoorHumidity={submission?.humidity}
      />
    );
  };
  
  // Get form properties for read-only rendering
  const formsDisabled = !canEditSubmission || isSessionCompleted || isSessionCancelled;
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (error) {
    return (
      <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded relative">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }
  
  if (!submission) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Submission not found. Please select a submission first.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
        >
          Go to Submissions
        </Button>
      </div>
    );
  }
  
  // Calculate observation counts
  const { petrisComplete, petrisTotal, gasifiersComplete, gasifiersTotal } = countValidObservations();

  return (
    <div className="animate-fade-in">
      {/* Header with back button */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Submission</h1>
          <p className="text-gray-600 mt-1">
            {selectedSite?.name} - {submission.global_submission_id ? `Submission #${submission.global_submission_id}` : 'New Submission'}
          </p>
        </div>
      </div>

      {/* Session information card */}
      <SubmissionOverviewCard
        session={session}
        submissionCreatedAt={submission.created_at}
        openedByUserEmail={session?.opened_by_user_email}
        openedByUserName={session?.opened_by_user_name}
        onShare={canEditSubmission ? handleShareSession : undefined}
        canShare={canEditSubmission && !isSessionCompleted && !isSessionCancelled}
        petrisComplete={petrisComplete}
        petrisTotal={petrisTotal}
        gasifiersComplete={gasifiersComplete}
        gasifiersTotal={gasifiersTotal}
      />

      {/* Main Submission Form */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold">Submission Details</h2>
        </CardHeader>
        <form onSubmit={formik.handleSubmit}>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-700">Outdoor Environment</h3>
                
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
                    disabled={formsDisabled}
                    testId="temperature-input"
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
                    disabled={formsDisabled}
                    testId="humidity-input"
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
                      disabled={formsDisabled}
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
                      disabled={formsDisabled}
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
                    disabled={formsDisabled}
                    helperText="Valid range: 32-120°F"
                    testId="indoor-temperature-input"
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
                    disabled={formsDisabled}
                    helperText="Valid range: 1-100%"
                    testId="indoor-humidity-input"
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
                      disabled={formsDisabled}
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
                disabled={formsDisabled}
              ></textarea>
              {formik.touched.notes && formik.errors.notes && (
                <p className="mt-1 text-sm text-error-600">{formik.errors.notes}</p>
              )}
            </div>
          </CardContent>
          
          {!formsDisabled && (
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCancelConfirm(true)}
                disabled={isSubmitting}
                icon={<X size={16} />}
                testId="cancel-submission-button"
              >
                Cancel Submission
              </Button>
              
              <div className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isSubmitting || !hasUnsavedChanges()}
                  testId="save-draft-button"
                >
                  Save Draft
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  icon={<Check size={16} />}
                  testId="complete-submission-button"
                >
                  Complete Submission
                </Button>
              </div>
            </CardFooter>
          )}
        </form>
      </Card>

      {/* Petri Observations Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Petri Samples ({petriFormStates.filter(form => form.isValid).length}/{petrisTotal || '0'})
            </h2>
            <div className="flex space-x-2">
              {!formsDisabled && (
                <Button
                  type="button"
                  variant={isPetriAccordionOpen ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setIsPetriAccordionOpen(!isPetriAccordionOpen)}
                  icon={<FilePlus size={16} />}
                >
                  {isPetriAccordionOpen ? 'Hide Petri Samples' : 'Show Petri Samples'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ObservationListManager
            observations={petriFormStates}
            setObservations={setPetriFormStates}
            isAccordionOpen={isPetriAccordionOpen}
            setIsAccordionOpen={setIsPetriAccordionOpen}
            addButtonText="Add Petri Sample"
            templateWarningEntityType="Petri"
            onShowTemplateWarning={(entityType) => setShowPetriTemplateWarning(true)}
            disabled={formsDisabled}
            createEmptyObservation={createEmptyPetriObservation}
            renderFormComponent={renderPetriForm}
            testId="petri-observation-manager"
          />
        </CardContent>
      </Card>

      {/* Gasifier Observations Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              Gasifier Samples ({gasifierFormStates.filter(form => form.isValid).length}/{gasifiersTotal || '0'})
            </h2>
            <div className="flex space-x-2">
              {!formsDisabled && (
                <Button
                  type="button"
                  variant={isGasifierAccordionOpen ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setIsGasifierAccordionOpen(!isGasifierAccordionOpen)}
                  icon={<FilePlus size={16} />}
                >
                  {isGasifierAccordionOpen ? 'Hide Gasifier Samples' : 'Show Gasifier Samples'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ObservationListManager
            observations={gasifierFormStates}
            setObservations={setGasifierFormStates}
            isAccordionOpen={isGasifierAccordionOpen}
            setIsAccordionOpen={setIsGasifierAccordionOpen}
            addButtonText="Add Gasifier Sample"
            templateWarningEntityType="Gasifier"
            onShowTemplateWarning={(entityType) => setShowGasifierTemplateWarning(true)}
            disabled={formsDisabled}
            createEmptyObservation={createEmptyGasifierObservation}
            renderFormComponent={renderGasifierForm}
            testId="gasifier-observation-manager"
          />
        </CardContent>
      </Card>
      
      {/* Display completed/cancelled session message */}
      {(isSessionCompleted || isSessionCancelled) && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-6">
          <p className="text-gray-700 flex items-center">
            <AlertTriangle className="text-warning-500 mr-2" size={20} />
            <span>
              This submission is {isSessionCompleted ? 'complete' : 'cancelled'} and cannot be edited.
            </span>
          </p>
          <div className="flex justify-end mt-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
            >
              Back to Submissions
            </Button>
          </div>
        </div>
      )}
      
      {/* Warning for offline users */}
      {!isOnline && !isSessionCompleted && !isSessionCancelled && (
        <div className="bg-warning-50 border border-warning-200 p-4 rounded-lg mb-6">
          <p className="text-warning-700 flex items-center">
            <AlertTriangle className="text-warning-500 mr-2" size={20} />
            <span>
              You are currently offline. Changes will be saved locally and synced when you reconnect.
            </span>
          </p>
        </div>
      )}
      
      {/* Session Share Modal */}
      <SessionShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        sessionId={session?.session_id || ''}
        programId={programId || ''}
      />
      
      {/* Petri Template Warning Modal */}
      <TemplateWarningModal
        isOpen={showPetriTemplateWarning}
        onClose={() => setShowPetriTemplateWarning(false)}
        onConfirm={() => setShowPetriTemplateWarning(false)}
        entityType="Petri"
      />
      
      {/* Gasifier Template Warning Modal */}
      <TemplateWarningModal
        isOpen={showGasifierTemplateWarning}
        onClose={() => setShowGasifierTemplateWarning(false)}
        onConfirm={() => setShowGasifierTemplateWarning(false)}
        entityType="Gasifier"
      />
      
      {/* Complete Confirmation Modal */}
      <ConfirmSubmissionModal
        isOpen={showCompleteConfirm}
        onClose={() => setShowCompleteConfirm(false)}
        onConfirm={handleCompleteConfirmed}
        currentPetriCount={petriFormStates.filter(form => form.isValid).length}
        currentGasifierCount={gasifierFormStates.filter(form => form.isValid).length}
        expectedPetriCount={petrisTotal}
        expectedGasifierCount={gasifiersTotal}
        siteName={selectedSite?.name || ''}
      />
      
      {/* Cancel Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancelSession}
        title="Cancel Submission"
        message="Are you sure you want to cancel this submission? This will discard all progress and the submission will be incomplete."
        confirmText="Cancel Submission"
      />
      
      {/* Permission Modal */}
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        message="You don't have permission to edit this submission. Please contact your program administrator for access."
      />
      
      {/* Sync Status */}
      {syncStatus !== 'synced' && (
        <SyncStatus status={syncStatus} />
      )}
    </div>
  );
};

export default SubmissionEditPage;