import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { ArrowLeft, Save, CheckCircle, Clock, AlertTriangle, Share2, X, Upload, Plus } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { useSites } from '../hooks/useSites';
import { useSubmissions } from '../hooks/useSubmissions';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { toast } from 'react-toastify';
import LoadingScreen from '../components/common/LoadingScreen';
import useWeather from '../hooks/useWeather';
import { PetriFormData, GasifierFormData } from '../utils/submissionUtils';
import PetriForm, { PetriFormRef } from '../components/submissions/PetriForm';
import GasifierForm, { GasifierFormRef } from '../components/submissions/GasifierForm';
import ObservationListManager, { ObservationFormState } from '../components/forms/ObservationListManager';
import { v4 as uuidv4 } from 'uuid';
import ConfirmSubmissionModal from '../components/submissions/ConfirmSubmissionModal';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import PermissionModal from '../components/common/PermissionModal';
import TemplateWarningModal from '../components/submissions/TemplateWarningModal';
import { useSessionStore } from '../stores/sessionStore';
import { SubmissionSession, SessionStatus } from '../types/session';
import sessionManager from '../lib/sessionManager';
import SubmissionOverviewCard from '../components/submissions/SubmissionOverviewCard';
import SyncStatus from '../components/common/SyncStatus';
import SessionShareModal from '../components/submissions/SessionShareModal';
import useUserRole from '../hooks/useUserRole';

// Schema for submission form validation
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
  odor_distance: Yup.string()
    .oneOf(['5-10ft', '10-25ft', '25-50ft', '50-100ft', '>100ft'], 'Please select a valid odor distance')
    .required('Odor distance is required'),
  weather: Yup.string()
    .oneOf(['Clear', 'Cloudy', 'Rain'], 'Please select a valid weather condition')
    .required('Weather is required'),
  notes: Yup.string()
    .max(255, 'Notes must be less than 255 characters')
});

const SubmissionEditPage = () => {
  const navigate = useNavigate();
  const { programId, siteId, submissionId } = useParams<{ programId: string, siteId: string, submissionId: string }>();
  const { selectedProgram, setSelectedProgram, selectedSite, setSelectedSite } = usePilotProgramStore();
  const { fetchSite, loading: siteLoading } = useSites(programId);
  const { fetchPetriObservations, fetchSubmissionGasifierObservations, updateSubmission, loading: submissionsLoading } = useSubmissions(siteId);
  const isOnline = useOnlineStatus();
  const { setCurrentSessionId } = useSessionStore();
  const { canEditSubmission, canManageSiteTemplates } = useUserRole({ programId });
  
  // State for managing form data, loading states, and UI controls
  const [initialSubmission, setInitialSubmission] = useState<any | null>(null);
  const [petriObservations, setPetriObservations] = useState<PetriFormData[]>([]);
  const [gasifierObservations, setGasifierObservations] = useState<GasifierFormData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submissionSession, setSubmissionSession] = useState<SubmissionSession | null>(null);
  const [openedByUserEmail, setOpenedByUserEmail] = useState<string | null>(null);
  const [openedByUserName, setOpenedByUserName] = useState<string | null>(null);
  const [isPetriAccordionOpen, setIsPetriAccordionOpen] = useState(true);
  const [isGasifierAccordionOpen, setIsGasifierAccordionOpen] = useState(true);
  const [showConfirmSubmissionModal, setShowConfirmSubmissionModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteItemType, setDeleteItemType] = useState<'petri' | 'gasifier' | null>(null);
  const [showTemplateWarningModal, setShowTemplateWarningModal] = useState(false);
  const [templateWarningEntityType, setTemplateWarningEntityType] = useState<'Petri' | 'Gasifier'>('Petri');
  const [isSessionCompletable, setIsSessionCompletable] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Refs to collections of form refs
  const petriFormRefs = useRef<{ [key: string]: PetriFormRef | null }>({});
  const gasifierFormRefs = useRef<{ [key: string]: GasifierFormRef | null }>({});
  
  // Auto-save timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track sync status
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error' | 'reconnecting'>('synced');
  
  // Auto-save interval in ms (5 minutes)
  const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;
  
  // Use react-query for fetching the submission and its session
  useEffect(() => {
    const loadSubmissionWithSession = async () => {
      if (!submissionId || !siteId || !programId) {
        navigate('/home');
        return;
      }
      
      setLoading(true);
      
      try {
        // Fetch the session with the submission
        const { data, error } = await sessionManager.getSubmissionWithSession(submissionId);
        
        if (error) {
          console.error('Error fetching submission session:', error);
          toast.error('Failed to load submission data');
          navigate(`/programs/${programId}/sites/${siteId}`);
          return;
        }
        
        // Check if data and submission are defined
        if (!data || !data.submission) {
          console.error('No submission data returned');
          toast.error('Submission data not found');
          navigate(`/programs/${programId}/sites/${siteId}`);
          return;
        }
        
        if (!data || !data.submission) {
          console.error('Error: No submission data returned');
          toast.error('Failed to load submission data');
          navigate(`/programs/${programId}/sites/${siteId}`);
          return;
        }
        
        // If session is cancelled or expired, show a message and redirect
        if (data.session?.session_status === 'Cancelled' || 
            data.session?.session_status?.startsWith('Expired')) {
          toast.warning(`This submission session is ${data.session?.session_status?.toLowerCase()} and cannot be edited.`);
          navigate(`/programs/${programId}/sites/${siteId}`);
          return;
        }
        
        // Set the submission and session data with null checks
        setInitialSubmission(data.submission);
        setSubmissionSession(data.session);
        
        // Set the current session ID in the store
        if (data.session?.session_id) {
          setCurrentSessionId(data.session.session_id);
        }
        
        // Set the creator details if available
        if (data.creator) {
          setOpenedByUserEmail(data.creator.email);
          setOpenedByUserName(data.creator.full_name);
        }
        
        // Fetch petri observations
        const petriData = await fetchPetriObservations(submissionId);
        
        // Convert to form data format
        const petriFormData = petriData.map(petri => ({
          id: uuidv4(),
          formId: uuidv4(),
          petriCode: petri.petri_code,
          initialPetriCode: petri.petri_code,
          imageFile: null,
          imageUrl: petri.image_url,
          initialImageUrl: petri.image_url,
          tempImageKey: undefined,
          plantType: petri.plant_type || 'Other Fresh Perishable',
          initialPlantType: petri.plant_type || 'Other Fresh Perishable',
          fungicideUsed: petri.fungicide_used as 'Yes' | 'No',
          initialFungicideUsed: petri.fungicide_used as 'Yes' | 'No',
          surroundingWaterSchedule: petri.surrounding_water_schedule || '',
          initialSurroundingWaterSchedule: petri.surrounding_water_schedule || '',
          notes: petri.notes || '',
          initialNotes: petri.notes || '',
          placement: petri.placement || null,
          initialPlacement: petri.placement || null,
          placement_dynamics: petri.placement_dynamics || null,
          initialPlacement_dynamics: petri.placement_dynamics || null,
          outdoor_temperature: petri.outdoor_temperature,
          initialOutdoor_temperature: petri.outdoor_temperature,
          outdoor_humidity: petri.outdoor_humidity,
          initialOutdoor_humidity: petri.outdoor_humidity,
          observationId: petri.observation_id,
          isValid: true,
          hasData: true,
          hasImage: !!petri.image_url,
          isDirty: false,
          is_image_split: petri.is_image_split || false,
          initialIs_image_split: petri.is_image_split || false,
          is_split_source: petri.is_split_source || false,
          initialIs_split_source: petri.is_split_source || false,
          split_processed: petri.split_processed || false,
          initialSplit_processed: petri.split_processed || false,
          phase_observation_settings: petri.phase_observation_settings || null,
          initialPhase_observation_settings: petri.phase_observation_settings || null,
          main_petri_id: petri.main_petri_id || undefined,
          initialMain_petri_id: petri.main_petri_id || undefined
        }));
        
        // Fetch gasifier observations
        const gasifierData = await fetchSubmissionGasifierObservations(submissionId);
        
        // Convert to form data format
        const gasifierFormData = gasifierData.map(gasifier => ({
          id: uuidv4(),
          formId: uuidv4(),
          gasifierCode: gasifier.gasifier_code,
          initialGasifierCode: gasifier.gasifier_code,
          imageFile: null,
          imageUrl: gasifier.image_url,
          initialImageUrl: gasifier.image_url,
          tempImageKey: undefined,
          chemicalType: gasifier.chemical_type,
          initialChemicalType: gasifier.chemical_type,
          measure: gasifier.measure,
          initialMeasure: gasifier.measure,
          anomaly: gasifier.anomaly,
          initialAnomaly: gasifier.anomaly,
          placementHeight: gasifier.placement_height || null,
          initialPlacementHeight: gasifier.placement_height || null,
          directionalPlacement: gasifier.directional_placement || null,
          initialDirectionalPlacement: gasifier.directional_placement || null,
          placementStrategy: gasifier.placement_strategy || null,
          initialPlacementStrategy: gasifier.placement_strategy || null,
          notes: gasifier.notes || '',
          initialNotes: gasifier.notes || '',
          outdoor_temperature: gasifier.outdoor_temperature,
          initialOutdoor_temperature: gasifier.outdoor_temperature,
          outdoor_humidity: gasifier.outdoor_humidity,
          initialOutdoor_humidity: gasifier.outdoor_humidity,
          observationId: gasifier.observation_id,
          isValid: true,
          hasData: true,
          hasImage: !!gasifier.image_url,
          isDirty: false
        }));
        
        // Set the observations
        setPetriObservations(petriFormData);
        setGasifierObservations(gasifierFormData);
        
        // Fetch the site if needed
        if (!selectedSite || selectedSite.site_id !== siteId) {
          const site = await fetchSite(siteId);
          if (site) {
            setSelectedSite(site);
          }
        }
        
        // Check if session is completable (all required observations have images)
        const allPetriComplete = petriFormData.every(p => p.hasImage);
        const allGasifierComplete = gasifierFormData.every(g => g.hasImage);
        const isCompletable = (petriFormData.length > 0 || gasifierFormData.length > 0) && 
                              allPetriComplete && 
                              allGasifierComplete;
        
        setIsSessionCompletable(isCompletable);
        
      } catch (error) {
        console.error('Error loading submission data:', error);
        toast.error('Failed to load submission data');
      } finally {
        setLoading(false);
      }
    };
    
    loadSubmissionWithSession();
  }, [submissionId, programId, siteId, navigate, setSelectedSite, fetchPetriObservations, fetchSubmissionGasifierObservations, fetchSite, selectedSite, setCurrentSessionId]);
  
  // Setup auto-save timer
  useEffect(() => {
    if (initialSubmission) {
      // Clear any existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      
      // Set up new auto-save timer
      autoSaveTimerRef.current = setTimeout(() => {
        if (formik.dirty || petriObservations.some(p => p.isDirty) || gasifierObservations.some(g => g.isDirty)) {
          console.log('Auto-saving submission...');
          handleSave();
        }
      }, AUTO_SAVE_INTERVAL);
      
      return () => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
      };
    }
  }, [initialSubmission, petriObservations, gasifierObservations]);
  
  // Update session activity periodically (every 2 minutes)
  useEffect(() => {
    if (!submissionSession) return;
    
    const updateSessionActivity = async () => {
      if (isOnline && submissionSession.session_id) {
        try {
          await sessionManager.updateSessionActivity(submissionSession.session_id);
        } catch (error) {
          console.error('Error updating session activity:', error);
        }
      }
    };
    
    // Initial activity update
    updateSessionActivity();
    
    // Set up periodic updates
    const activityInterval = setInterval(updateSessionActivity, 2 * 60 * 1000);
    
    return () => {
      clearInterval(activityInterval);
    };
  }, [submissionSession, isOnline]);
  
  // Initialize formik with the submission data
  const formik = useFormik({
    initialValues: {
      temperature: initialSubmission?.temperature || 70,
      humidity: initialSubmission?.humidity || 50,
      indoor_temperature: initialSubmission?.indoor_temperature || '',
      indoor_humidity: initialSubmission?.indoor_humidity || '',
      airflow: initialSubmission?.airflow || 'Open',
      odor_distance: initialSubmission?.odor_distance || '5-10ft',
      weather: initialSubmission?.weather || 'Clear',
      notes: initialSubmission?.notes || ''
    },
    validationSchema: SubmissionSchema,
    enableReinitialize: true,
    onSubmit: async (values) => {
      await handleSave(true);
    }
  });
  
  // Create an empty petri observation
  const createEmptyPetriObservation = useCallback(() => {
    return {
      id: uuidv4(),
      formId: uuidv4(),
      petriCode: '',
      initialPetriCode: '',
      imageFile: null,
      imageUrl: undefined,
      initialImageUrl: undefined,
      tempImageKey: undefined,
      plantType: 'Other Fresh Perishable',
      initialPlantType: 'Other Fresh Perishable',
      fungicideUsed: 'No' as 'Yes' | 'No',
      initialFungicideUsed: 'No' as 'Yes' | 'No',
      surroundingWaterSchedule: '',
      initialSurroundingWaterSchedule: '',
      notes: '',
      initialNotes: '',
      placement: null,
      initialPlacement: null,
      placement_dynamics: null,
      initialPlacement_dynamics: null,
      outdoor_temperature: undefined,
      initialOutdoor_temperature: undefined,
      outdoor_humidity: undefined,
      initialOutdoor_humidity: undefined,
      observationId: undefined,
      isValid: false,
      hasData: false,
      hasImage: false,
      isDirty: true
    } as PetriFormData;
  }, []);
  
  // Create an empty gasifier observation
  const createEmptyGasifierObservation = useCallback(() => {
    return {
      id: uuidv4(),
      formId: uuidv4(),
      gasifierCode: '',
      initialGasifierCode: '',
      imageFile: null,
      imageUrl: undefined,
      initialImageUrl: undefined,
      tempImageKey: undefined,
      chemicalType: 'CLO2',
      initialChemicalType: 'CLO2',
      measure: null,
      initialMeasure: null,
      anomaly: false,
      initialAnomaly: false,
      placementHeight: null,
      initialPlacementHeight: null,
      directionalPlacement: null,
      initialDirectionalPlacement: null,
      placementStrategy: null,
      initialPlacementStrategy: null,
      notes: '',
      initialNotes: '',
      outdoor_temperature: undefined,
      initialOutdoor_temperature: undefined,
      outdoor_humidity: undefined,
      initialOutdoor_humidity: undefined,
      observationId: undefined,
      isValid: false,
      hasData: false,
      hasImage: false,
      isDirty: true
    } as GasifierFormData;
  }, []);
  
  // Show template warning
  const showTemplateWarning = (entityType: 'Petri' | 'Gasifier') => {
    setTemplateWarningEntityType(entityType);
    setShowTemplateWarningModal(true);
  };
  
  // Save the submission and observations
  const handleSave = async (showToast = false) => {
    if (!initialSubmission || !submissionId || !siteId) return;
    
    // Don't allow saving if session is not in an editable state
    if (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status)) {
      toast.warning('This session cannot be edited in its current state');
      return;
    }
    
    // Check user permissions
    if (!canEditSubmission) {
      setPermissionMessage("You don't have permission to edit submissions. Please contact your program administrator for access.");
      setShowPermissionModal(true);
      return;
    }
    
    setSaving(true);
    setSyncStatus('syncing');
    
    try {
      // Validate petri forms
      for (const key in petriFormRefs.current) {
        const formRef = petriFormRefs.current[key];
        if (formRef) {
          const isValid = await formRef.validate();
          if (!isValid) {
            throw new Error(`Invalid petri form: ${formRef.petriCode}`);
          }
        }
      }
      
      // Validate gasifier forms
      for (const key in gasifierFormRefs.current) {
        const formRef = gasifierFormRefs.current[key];
        if (formRef) {
          const isValid = await formRef.validate();
          if (!isValid) {
            throw new Error(`Invalid gasifier form: ${formRef.gasifierCode}`);
          }
        }
      }
      
      // Filter observations that have data
      const validPetriForms = petriObservations.filter(p => p.hasData);
      const validGasifierForms = gasifierObservations.filter(g => g.hasData);
      
      // Update the submission
      const result = await updateSubmission(
        submissionId,
        Number(formik.values.temperature),
        Number(formik.values.humidity),
        formik.values.airflow as 'Open' | 'Closed',
        formik.values.odor_distance as '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
        formik.values.weather as 'Clear' | 'Cloudy' | 'Rain',
        formik.values.notes || null,
        validPetriForms,
        validGasifierForms,
        formik.values.indoor_temperature ? Number(formik.values.indoor_temperature) : null,
        formik.values.indoor_humidity ? Number(formik.values.indoor_humidity) : null
      );
      
      if (result) {
        // Update observation IDs
        if (result.updatedPetriObservations) {
          setPetriObservations(prev => {
            return prev.map(p => {
              const updated = result.updatedPetriObservations.find(u => u.clientId === p.formId);
              if (updated) {
                return {
                  ...p,
                  observationId: updated.observationId,
                  isDirty: false
                };
              }
              return p;
            });
          });
        }
        
        if (result.updatedGasifierObservations) {
          setGasifierObservations(prev => {
            return prev.map(g => {
              const updated = result.updatedGasifierObservations.find(u => u.clientId === g.formId);
              if (updated) {
                return {
                  ...g,
                  observationId: updated.observationId,
                  isDirty: false
                };
              }
              return g;
            });
          });
        }
        
        // Reset dirty flags on petri form refs
        for (const key in petriFormRefs.current) {
          const formRef = petriFormRefs.current[key];
          if (formRef) {
            formRef.resetDirty();
          }
        }
        
        // Reset dirty flags on gasifier form refs
        for (const key in gasifierFormRefs.current) {
          const formRef = gasifierFormRefs.current[key];
          if (formRef) {
            formRef.resetDirty();
          }
        }
        
        // Mark form as pristine
        formik.resetForm({ values: formik.values });
        
        // Update session completability status
        const allPetriComplete = petriObservations.filter(p => p.hasData).every(p => p.hasImage);
        const allGasifierComplete = gasifierObservations.filter(g => g.hasData).every(g => g.hasImage);
        const isCompletable = (petriObservations.some(p => p.hasData) || gasifierObservations.some(g => g.hasData)) && 
                              allPetriComplete && 
                              allGasifierComplete;
        
        setIsSessionCompletable(isCompletable);
        
        if (showToast) {
          toast.success('Submission saved successfully');
        }
        
        // Set sync status to synced
        setSyncStatus('synced');
      }
    } catch (error) {
      console.error('Error saving submission:', error);
      toast.error(`Error saving submission: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSyncStatus('error');
    } finally {
      setSaving(false);
    }
  };
  
  // Complete the submission session
  const handleCompleteSession = async () => {
    if (!submissionSession) return;
    
    // Check if any observations are missing images
    const petriForms = petriObservations.filter(p => p.hasData);
    const gasifierForms = gasifierObservations.filter(g => g.hasData);
    
    const petrisWithImages = petriForms.filter(p => p.hasImage).length;
    const gasifiersWithImages = gasifierForms.filter(g => g.hasImage).length;
    
    // If any observations are missing images, show the confirmation modal
    if (petrisWithImages < petriForms.length || gasifiersWithImages < gasifierForms.length) {
      setShowConfirmSubmissionModal(true);
      return;
    }
    
    // Otherwise, proceed with completion
    await completeSession();
  };
  
  // Actually complete the session
  const completeSession = async () => {
    if (!submissionSession) return;
    
    setIsCompletingSession(true);
    
    try {
      // First save any pending changes
      await handleSave();
      
      // Then complete the session
      const result = await sessionManager.completeSubmissionSession(submissionSession.session_id);
      
      if (result && result.success) {
        toast.success('Submission completed successfully');
        navigate(`/programs/${programId}/sites/${siteId}`);
      } else {
        toast.error(result.message || 'Failed to complete submission');
      }
    } catch (error) {
      console.error('Error completing session:', error);
      toast.error('Failed to complete submission');
    } finally {
      setIsCompletingSession(false);
    }
  };
  
  // Cancel the submission session
  const handleCancelSession = async () => {
    if (!submissionSession) return;
    
    setIsCancellingSession(true);
    
    try {
      const result = await sessionManager.cancelSubmissionSession(submissionSession.session_id);
      
      if (result) {
        toast.success('Session cancelled successfully');
        navigate(`/programs/${programId}/sites/${siteId}`);
      } else {
        toast.error('Failed to cancel session');
      }
    } catch (error) {
      console.error('Error cancelling session:', error);
      toast.error('Failed to cancel session');
    } finally {
      setIsCancellingSession(false);
    }
  };
  
  // Handle sharing the session with other users
  const handleShareSession = async () => {
    if (!submissionSession) return;
    
    setShowShareModal(true);
  };
  
  // Handle deleting an observation
  const handleDeleteObservation = (id: string, type: 'petri' | 'gasifier') => {
    setDeleteItemId(id);
    setDeleteItemType(type);
    setShowDeleteConfirmModal(true);
  };
  
  // Confirm deletion of an observation
  const confirmDeleteObservation = () => {
    if (!deleteItemId || !deleteItemType) return;
    
    if (deleteItemType === 'petri') {
      setPetriObservations(prev => prev.filter(p => p.id !== deleteItemId));
    } else {
      setGasifierObservations(prev => prev.filter(g => g.id !== deleteItemId));
    }
    
    setShowDeleteConfirmModal(false);
    setDeleteItemId(null);
    setDeleteItemType(null);
  };
  
  // Render the petri form component
  const renderPetriForm = useCallback((
    observation: PetriFormData, 
    index: number, 
    onUpdate: (data: any) => void,
    onRemove: () => void,
    showRemoveButton: boolean,
    disabled: boolean
  ) => {
    // Skip rendering child split petri observations
    if (observation.is_image_split && !observation.is_split_source && observation.main_petri_id) {
      return null;
    }
    
    // Create the form ref if it doesn't exist
    if (!petriFormRefs.current[observation.id]) {
      petriFormRefs.current[observation.id] = null;
    }
    
    return (
      <PetriForm
        ref={ref => petriFormRefs.current[observation.id] = ref}
        id={`petri-form-${observation.id}`}
        formId={observation.formId}
        index={index}
        siteId={siteId || ''}
        submissionSessionId={submissionSession?.session_id || ''}
        onUpdate={onUpdate}
        onRemove={onRemove}
        showRemoveButton={showRemoveButton}
        initialData={{
          petriCode: observation.petriCode,
          imageUrl: observation.imageUrl,
          tempImageKey: observation.tempImageKey,
          plantType: observation.plantType,
          fungicideUsed: observation.fungicideUsed,
          surroundingWaterSchedule: observation.surroundingWaterSchedule,
          notes: observation.notes,
          placement: observation.placement as any,
          placement_dynamics: observation.placement_dynamics as any,
          observationId: observation.observationId,
          outdoor_temperature: observation.outdoor_temperature,
          outdoor_humidity: observation.outdoor_humidity,
          is_image_split: observation.is_image_split,
          is_split_source: observation.is_split_source,
          split_processed: observation.split_processed,
          phase_observation_settings: observation.phase_observation_settings,
          main_petri_id: observation.main_petri_id
        }}
        disabled={disabled || !canEditSubmission || 
                  (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
        observationId={observation.observationId}
        submissionOutdoorTemperature={initialSubmission?.temperature}
        submissionOutdoorHumidity={initialSubmission?.humidity}
      />
    );
  }, [siteId, submissionSession, initialSubmission, canEditSubmission]);
  
  // Render the gasifier form component
  const renderGasifierForm = useCallback((
    observation: GasifierFormData, 
    index: number, 
    onUpdate: (data: any) => void,
    onRemove: () => void,
    showRemoveButton: boolean,
    disabled: boolean
  ) => {
    // Create the form ref if it doesn't exist
    if (!gasifierFormRefs.current[observation.id]) {
      gasifierFormRefs.current[observation.id] = null;
    }
    
    return (
      <GasifierForm
        ref={ref => gasifierFormRefs.current[observation.id] = ref}
        id={`gasifier-form-${observation.id}`}
        formId={observation.formId}
        index={index}
        siteId={siteId || ''}
        submissionSessionId={submissionSession?.session_id || ''}
        onUpdate={onUpdate}
        onRemove={onRemove}
        showRemoveButton={showRemoveButton}
        initialData={{
          gasifierCode: observation.gasifierCode,
          imageUrl: observation.imageUrl,
          tempImageKey: observation.tempImageKey,
          chemicalType: observation.chemicalType as any,
          measure: observation.measure,
          anomaly: observation.anomaly,
          placementHeight: observation.placementHeight as any,
          directionalPlacement: observation.directionalPlacement as any,
          placementStrategy: observation.placementStrategy as any,
          notes: observation.notes,
          observationId: observation.observationId,
          outdoor_temperature: observation.outdoor_temperature,
          outdoor_humidity: observation.outdoor_humidity
        }}
        disabled={disabled || !canEditSubmission || 
                  (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
        observationId={observation.observationId}
        submissionOutdoorTemperature={initialSubmission?.temperature}
        submissionOutdoorHumidity={initialSubmission?.humidity}
      />
    );
  }, [siteId, submissionSession, initialSubmission, canEditSubmission]);
  
  // Track if the session is completable
  useEffect(() => {
    if (!submissionSession) return;
    
    // Only check completability if session is in an editable state
    if (!['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status)) {
      setIsSessionCompletable(false);
      return;
    }
    
    // Check if all observations have images
    const petriForms = petriObservations.filter(p => p.hasData);
    const gasifierForms = gasifierObservations.filter(g => g.hasData);
    
    // If we have no observations, session is not completable
    if (petriForms.length === 0 && gasifierForms.length === 0) {
      setIsSessionCompletable(false);
      return;
    }
    
    // Check if all observations have images
    const allPetriComplete = petriForms.every(p => p.hasImage);
    const allGasifierComplete = gasifierForms.every(g => g.hasImage);
    
    setIsSessionCompletable(allPetriComplete && allGasifierComplete);
  }, [submissionSession, petriObservations, gasifierObservations]);
  
  // Loading screen while data is being fetched
  if (loading) {
    return <LoadingScreen />;
  }
  
  // Handle case where data is not found
  if (!initialSubmission || !submissionId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Submission not found. Please return to the submissions list.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
        >
          Return to Submissions
        </Button>
      </div>
    );
  }
  
  // Determine session status display
  const getSessionStatusClassName = () => {
    if (!submissionSession) return '';
    
    switch (submissionSession.session_status) {
      case 'Completed':
        return 'bg-success-100 text-success-800';
      case 'Working':
        return 'bg-secondary-100 text-secondary-800';
      case 'Opened':
        return 'bg-primary-100 text-primary-800';
      case 'Escalated':
        return 'bg-warning-100 text-warning-800';
      case 'Shared':
        return 'bg-accent-100 text-accent-800';
      case 'Cancelled':
      case 'Expired':
      case 'Expired-Complete':
      case 'Expired-Incomplete':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Determine session status icon
  const getSessionStatusIcon = () => {
    if (!submissionSession) return null;
    
    switch (submissionSession.session_status) {
      case 'Completed':
        return <CheckCircle className="mr-1 h-4 w-4" />;
      case 'Working':
      case 'Opened':
        return <Clock className="mr-1 h-4 w-4" />;
      case 'Escalated':
      case 'Shared':
        return <Share2 className="mr-1 h-4 w-4" />;
      case 'Cancelled':
      case 'Expired':
      case 'Expired-Complete':
      case 'Expired-Incomplete':
        return <X className="mr-1 h-4 w-4" />;
      default:
        return null;
    }
  };
  
  return (
    <div className="animate-fade-in pb-20 md:pb-0">
      {/* Sync status indicator */}
      {syncStatus !== 'synced' && (
        <SyncStatus status={syncStatus} />
      )}
      
      {/* Page header */}
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
            Edit Submission
          </h1>
          <p className="text-gray-600 mt-1">
            {selectedSite?.name} - {initialSubmission?.global_submission_id ? `#${initialSubmission.global_submission_id}` : 'New Submission'}
          </p>
        </div>
        
        <div className="flex space-x-2">
          {submissionSession && ['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status) && (
            <>
              <div className="hidden md:block">
                <Button 
                  variant="outline"
                  onClick={() => handleShareSession()}
                  icon={<Share2 size={16} />}
                  testId="share-session-button"
                >
                  Share
                </Button>
              </div>
              
              <div className="hidden md:block">
                <Button 
                  variant="outline"
                  onClick={() => handleCancelSession()}
                  isLoading={isCancellingSession}
                  testId="cancel-session-button"
                >
                  Cancel
                </Button>
              </div>
              
              <Button 
                variant="primary"
                onClick={() => handleCompleteSession()}
                icon={<CheckCircle size={16} />}
                disabled={!isSessionCompletable}
                isLoading={isCompletingSession}
                testId="complete-session-button"
              >
                Complete
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Session overview card */}
      <SubmissionOverviewCard 
        session={submissionSession}
        submissionCreatedAt={initialSubmission?.created_at}
        openedByUserEmail={openedByUserEmail}
        openedByUserName={openedByUserName}
        onShare={canEditSubmission ? () => handleShareSession() : undefined}
        canShare={canEditSubmission}
        petrisComplete={petriObservations.filter(p => p.hasData && p.hasImage).length}
        petrisTotal={petriObservations.filter(p => p.hasData).length}
        gasifiersComplete={gasifierObservations.filter(g => g.hasData && g.hasImage).length}
        gasifiersTotal={gasifierObservations.filter(g => g.hasData).length}
      />
      
      {/* Main form */}
      <form onSubmit={formik.handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Submission Details</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Outdoor Environment */}
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
                    disabled={!canEditSubmission || 
                             (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
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
                    disabled={!canEditSubmission || 
                             (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
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
                      disabled={!canEditSubmission || 
                               (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                      data-testid="airflow-select"
                    >
                      <option value="Open">Open</option>
                      <option value="Closed">Closed</option>
                    </select>
                    {formik.touched.airflow && formik.errors.airflow && (
                      <p className="mt-1 text-sm text-error-600">{formik.errors.airflow}</p>
                    )}
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="odor_distance" className="block text-sm font-medium text-gray-700 mb-1">
                      Odor Distance
                    </label>
                    <select
                      id="odor_distance"
                      name="odor_distance"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      value={formik.values.odor_distance}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      disabled={!canEditSubmission || 
                               (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                      data-testid="odor-distance-select"
                    >
                      <option value="5-10ft">5-10 ft</option>
                      <option value="10-25ft">10-25 ft</option>
                      <option value="25-50ft">25-50 ft</option>
                      <option value="50-100ft">50-100 ft</option>
                      <option value=">100ft">More than 100 ft</option>
                    </select>
                    {formik.touched.odor_distance && formik.errors.odor_distance && (
                      <p className="mt-1 text-sm text-error-600">{formik.errors.odor_distance}</p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Indoor Environment */}
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-700">Indoor Environment</h3>
                
                <div className="space-y-4">
                  <Input
                    label="Indoor Temperature (°F) - Optional"
                    id="indoor_temperature"
                    name="indoor_temperature"
                    type="number"
                    placeholder="e.g., 75"
                    value={formik.values.indoor_temperature}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.indoor_temperature && formik.errors.indoor_temperature ? formik.errors.indoor_temperature : undefined}
                    disabled={!canEditSubmission || 
                             (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                    helperText="Valid range: 32-120°F"
                    testId="indoor-temperature-input"
                  />
                  
                  <Input
                    label="Indoor Humidity (%) - Optional"
                    id="indoor_humidity"
                    name="indoor_humidity"
                    type="number"
                    placeholder="e.g., 45"
                    value={formik.values.indoor_humidity}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.indoor_humidity && formik.errors.indoor_humidity ? formik.errors.indoor_humidity : undefined}
                    disabled={!canEditSubmission || 
                             (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
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
                      disabled={!canEditSubmission || 
                               (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                      data-testid="weather-select"
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
            
            {/* Notes field */}
            <div className="mt-4">
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
                disabled={!canEditSubmission || 
                         (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                data-testid="notes-textarea"
              ></textarea>
              {formik.touched.notes && formik.errors.notes && (
                <p className="mt-1 text-sm text-error-600">{formik.errors.notes}</p>
              )}
            </div>
            
            {/* Warning for offline users */}
            {!isOnline && (
              <div className="mt-4 bg-warning-50 border border-warning-200 p-3 rounded-md text-warning-800">
                <p className="text-sm font-medium">You are currently offline</p>
                <p className="text-xs mt-1">
                  Changes will be stored locally and will sync when you reconnect. Some features may be limited.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
              testId="back-to-submissions-button"
            >
              Back to Submissions
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={<Save size={16} />}
              onClick={() => handleSave(true)}
              isLoading={saving}
              disabled={!canEditSubmission || 
                       (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
              testId="save-button"
            >
              Save
            </Button>
          </CardFooter>
        </Card>
        
        {/* Petri Observations */}
        <Card className="mb-6">
          <CardHeader className="flex justify-between items-center cursor-pointer" onClick={() => setIsPetriAccordionOpen(!isPetriAccordionOpen)}>
            <h2 className="text-lg font-semibold flex items-center">
              <span>Petri Dish Observations</span>
              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                {petriObservations.filter(p => p.hasData).length}
              </span>
            </h2>
            <button 
              className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
              aria-label={isPetriAccordionOpen ? 'Collapse section' : 'Expand section'}
              onClick={(e) => {
                e.stopPropagation();
                setIsPetriAccordionOpen(!isPetriAccordionOpen);
              }}
            >
              {isPetriAccordionOpen ? (
                <ChevronUp size={20} />
              ) : (
                <ChevronDown size={20} />
              )}
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {isPetriAccordionOpen && (
              <ObservationListManager
                observations={petriObservations}
                setObservations={setPetriObservations}
                isAccordionOpen={isPetriAccordionOpen}
                setIsAccordionOpen={setIsPetriAccordionOpen}
                addButtonText="Add Petri Observation"
                templateWarningEntityType="Petri"
                onShowTemplateWarning={showTemplateWarning}
                disabled={!canEditSubmission || 
                         (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                createEmptyObservation={createEmptyPetriObservation}
                renderFormComponent={renderPetriForm}
                testId="petri-observations-manager"
              />
            )}
          </CardContent>
        </Card>
        
        {/* Gasifier Observations */}
        <Card className="mb-6">
          <CardHeader className="flex justify-between items-center cursor-pointer" onClick={() => setIsGasifierAccordionOpen(!isGasifierAccordionOpen)}>
            <h2 className="text-lg font-semibold flex items-center">
              <span>Gasifier Observations</span>
              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                {gasifierObservations.filter(g => g.hasData).length}
              </span>
            </h2>
            <button 
              className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
              aria-label={isGasifierAccordionOpen ? 'Collapse section' : 'Expand section'}
              onClick={(e) => {
                e.stopPropagation();
                setIsGasifierAccordionOpen(!isGasifierAccordionOpen);
              }}
            >
              {isGasifierAccordionOpen ? (
                <ChevronUp size={20} />
              ) : (
                <ChevronDown size={20} />
              )}
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {isGasifierAccordionOpen && (
              <ObservationListManager
                observations={gasifierObservations}
                setObservations={setGasifierObservations}
                isAccordionOpen={isGasifierAccordionOpen}
                setIsAccordionOpen={setIsGasifierAccordionOpen}
                addButtonText="Add Gasifier Observation"
                templateWarningEntityType="Gasifier"
                onShowTemplateWarning={showTemplateWarning}
                disabled={!canEditSubmission || 
                         (submissionSession && !['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status))}
                createEmptyObservation={createEmptyGasifierObservation}
                renderFormComponent={renderGasifierForm}
                testId="gasifier-observations-manager"
              />
            )}
          </CardContent>
        </Card>
      </form>
      
      {/* Mobile bottom action bar */}
      {submissionSession && ['Opened', 'Working', 'Escalated', 'Shared'].includes(submissionSession.session_status) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex justify-around z-10">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleShareSession()}
            className="flex-1 mx-1 !py-2"
            icon={<Share2 size={16} />}
            testId="mobile-share-session-button"
          >
            Share
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleCancelSession()}
            className="flex-1 mx-1 !py-2"
            isLoading={isCancellingSession}
            testId="mobile-cancel-session-button"
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            size="sm"
            onClick={() => handleCompleteSession()}
            className="flex-1 mx-1 !py-2"
            icon={<CheckCircle size={16} />}
            disabled={!isSessionCompletable}
            isLoading={isCompletingSession}
            testId="mobile-complete-session-button"
          >
            Complete
          </Button>
        </div>
      )}
      
      {/* Modals */}
      <ConfirmSubmissionModal
        isOpen={showConfirmSubmissionModal}
        onClose={() => setShowConfirmSubmissionModal(false)}
        onConfirm={completeSession}
        currentPetriCount={petriObservations.filter(p => p.hasData && p.hasImage).length}
        currentGasifierCount={gasifierObservations.filter(g => g.hasData && g.hasImage).length}
        expectedPetriCount={petriObservations.filter(p => p.hasData).length}
        expectedGasifierCount={gasifierObservations.filter(g => g.hasData).length}
        siteName={selectedSite?.name || 'this site'}
      />
      
      <DeleteConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
          setDeleteItemId(null);
          setDeleteItemType(null);
        }}
        onConfirm={confirmDeleteObservation}
        title={`Delete ${deleteItemType === 'petri' ? 'Petri' : 'Gasifier'} Observation`}
        message={`Are you sure you want to delete this ${deleteItemType === 'petri' ? 'petri' : 'gasifier'} observation? This action cannot be undone.`}
      />
      
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        message={permissionMessage}
      />
      
      <TemplateWarningModal
        isOpen={showTemplateWarningModal}
        onClose={() => setShowTemplateWarningModal(false)}
        onConfirm={() => {}}
        entityType={templateWarningEntityType}
      />
      
      {submissionSession && (
        <SessionShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          sessionId={submissionSession.session_id}
          programId={programId || ''}
        />
      )}
    </div>
  );
};

export default SubmissionEditPage;