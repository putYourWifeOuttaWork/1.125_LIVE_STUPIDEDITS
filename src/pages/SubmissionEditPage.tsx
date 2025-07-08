import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { v4 as uuidv4 } from 'uuid';
import { 
  ArrowLeft, 
  Check, 
  X, 
  Plus, 
  Share2, 
  AlertTriangle, 
  ExternalLink, 
  ChevronsDown, 
  ChevronsUp,
  Users,
  Clock,
  Save,
  CheckCircle2
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import PetriForm, { PetriFormRef } from '../components/submissions/PetriForm';
import GasifierForm, { GasifierFormRef } from '../components/submissions/GasifierForm';
import TemplateWarningModal from '../components/submissions/TemplateWarningModal';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { useSites } from '../hooks/useSites';
import { useSubmissions } from '../hooks/useSubmissions';
import LoadingScreen from '../components/common/LoadingScreen';
import useWeather from '../hooks/useWeather';
import ConfirmSubmissionModal from '../components/submissions/ConfirmSubmissionModal';
import ObservationListManager, { ObservationFormState } from '../components/forms/ObservationListManager';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';
import { PetriFormData, GasifierFormData } from '../utils/submissionUtils';
import { useSessionStore } from '../stores/sessionStore';
import sessionManager from '../lib/sessionManager';
import useOfflineSession from '../hooks/useOfflineSession';
import SessionShareModal from '../components/submissions/SessionShareModal';
import SubmissionOverviewCard from '../components/submissions/SubmissionOverviewCard';
import SyncStatus from '../components/common/SyncStatus';
import { supabase } from '../lib/supabaseClient';
import { createLogger } from '../utils/logger';

// Create a logger for this component
const logger = createLogger('SubmissionEditPage');

// Validation schema for the form
const SubmissionFormSchema = Yup.object().shape({
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
    .transform(value => (isNaN(value) ? null : value))
    .min(32, 'Indoor temperature must be at least 32°F')
    .max(120, 'Indoor temperature cannot exceed 120°F'),
  indoor_humidity: Yup.number()
    .nullable()
    .transform(value => (isNaN(value) ? null : value))
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
    .required('Weather is required')
});

interface PetriForms {
  [id: string]: ObservationFormState;
}

interface GasifierForms {
  [id: string]: ObservationFormState;
}

const SubmissionEditPage = () => {
  const { programId, siteId, submissionId } = useParams<{programId: string, siteId: string, submissionId: string}>();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { user } = useAuthStore();
  const { fetchSite } = useSites(programId);
  const { 
    selectedProgram, 
    selectedSite, 
    setSelectedSite 
  } = usePilotProgramStore();
  const { 
    updateSubmission, 
    fetchSubmissionPetriObservations, 
    fetchSubmissionGasifierObservations, 
    loading: submissionLoading 
  } = useSubmissions(siteId);
  const { suggestedWeatherType } = useWeather();
  
  // Session management
  const { 
    setCurrentSessionId, 
    activeSessions 
  } = useSessionStore();

  // Form refs for petri and gasifier forms
  const petriFormRefs = useRef<{ [key: string]: PetriFormRef | null }>({});
  const gasifierFormRefs = useRef<{ [key: string]: GasifierFormRef | null }>({});
  
  // State for petri observations
  const [petriForms, setPetriForms] = useState<PetriForms>({});
  const [petriFormIds, setPetriFormIds] = useState<string[]>([]);
  
  // State for gasifier observations
  const [gasifierForms, setGasifierForms] = useState<GasifierForms>({});
  const [gasifierFormIds, setGasifierFormIds] = useState<string[]>([]);
  
  // Submission data state
  const [submission, setSubmission] = useState<any>(null);
  const [petriObservations, setPetriObservations] = useState<any[]>([]);
  const [gasifierObservations, setGasifierObservations] = useState<any[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSubmittingIncomplete, setIsSubmittingIncomplete] = useState(false);
  const [showConfirmIncomplete, setShowConfirmIncomplete] = useState(false);
  const [petriTemplateWarning, setPetriTemplateWarning] = useState(false);
  const [gasifierTemplateWarning, setGasifierTemplateWarning] = useState(false);
  const [errorLoadingData, setErrorLoadingData] = useState<string | null>(null);
  
  // Expand/collapse state for sections
  const [isPetriSectionOpen, setIsPetriSectionOpen] = useState(true);
  const [isGasifierSectionOpen, setIsGasifierSectionOpen] = useState(true);
  
  // Session management
  const [session, setSession] = useState<any>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error' | 'reconnecting'>('synced');
  const [syncMessage, setSyncMessage] = useState('');
  
  // Template data counts
  const [expectedPetriCount, setExpectedPetriCount] = useState(0);
  const [expectedGasifierCount, setExpectedGasifierCount] = useState(0);
  
  // Data loading function - fetch the submission, observations, and session
  const loadSubmissionData = useCallback(async () => {
    if (!programId || !siteId || !submissionId) return;
    
    setIsLoading(true);
    setErrorLoadingData(null);
    
    try {
      logger.debug('Loading submission data', { submissionId, siteId, programId });
      
      // Get the site if not already selected
      if (!selectedSite || selectedSite.site_id !== siteId) {
        logger.debug('Fetching site data');
        const site = await fetchSite(siteId);
        if (site) {
          setSelectedSite(site);
          
          // Set expected counts from site data
          setExpectedPetriCount(site.total_petris || 0);
          setExpectedGasifierCount(site.total_gasifiers || 0);
          
          logger.debug('Site data fetched', { 
            siteName: site.name, 
            expectedPetris: site.total_petris,
            expectedGasifiers: site.total_gasifiers
          });
        }
      } else {
        // Use existing selectedSite data for expected counts
        setExpectedPetriCount(selectedSite.total_petris || 0);
        setExpectedGasifierCount(selectedSite.total_gasifiers || 0);
      }
      
      // Get the submission with session data
      logger.debug('Fetching submission with session');
      const { data: { submission: submissionData, session: sessionData }, error: submissionError } = 
        await supabase.rpc('get_submission_with_session', {
          submission_id_param: submissionId
        });
      
      if (submissionError) {
        throw new Error(submissionError.message);
      }
      
      if (!submissionData) {
        throw new Error('Submission not found');
      }
      
      logger.debug('Submission data retrieved', {
        hasSession: !!sessionData,
        sessionStatus: sessionData?.session_status
      });
      
      setSubmission(submissionData);
      setSession(sessionData);
      
      // Set the active session ID in the session store
      if (sessionData?.session_id) {
        setCurrentSessionId(sessionData.session_id);
      }
      
      // Get petri observations
      logger.debug('Fetching petri observations');
      const petriObs = await fetchSubmissionPetriObservations(submissionId);
      logger.debug(`Retrieved ${petriObs.length} petri observations`);
      setPetriObservations(petriObs);
      
      // Get gasifier observations
      logger.debug('Fetching gasifier observations');
      const gasifierObs = await fetchSubmissionGasifierObservations(submissionId);
      logger.debug(`Retrieved ${gasifierObs.length} gasifier observations`);
      setGasifierObservations(gasifierObs);
      
      // Set form values from submission data
      formik.setValues({
        temperature: submissionData.temperature,
        humidity: submissionData.humidity,
        indoor_temperature: submissionData.indoor_temperature || '',
        indoor_humidity: submissionData.indoor_humidity || '',
        airflow: submissionData.airflow,
        odorDistance: submissionData.odor_distance,
        weather: submissionData.weather,
        notes: submissionData.notes || ''
      });
      
      // Initialize petri forms
      const petriIds: string[] = [];
      const petriFormState: PetriForms = {};
      
      petriObs.forEach(obs => {
        // Skip child split image observations
        if (obs.is_image_split && !obs.is_split_source && obs.main_petri_id) {
          return;
        }
        
        const formId = uuidv4();
        petriIds.push(formId);
        
        petriFormState[formId] = {
          id: formId,
          isValid: !!obs.petri_code && !!obs.fungicide_used && !!obs.surrounding_water_schedule && (!!obs.image_url || obs.is_missed_observation),
          isDirty: false,
          hasImage: !!obs.image_url,
          hasData: true,
          observationId: obs.observation_id
        };
      });
      
      setPetriFormIds(petriIds);
      setPetriForms(petriFormState);
      
      // Initialize gasifier forms
      const gasifierIds: string[] = [];
      const gasifierFormState: GasifierForms = {};
      
      gasifierObs.forEach(obs => {
        const formId = uuidv4();
        gasifierIds.push(formId);
        
        gasifierFormState[formId] = {
          id: formId,
          isValid: !!obs.gasifier_code && !!obs.chemical_type && (!!obs.image_url),
          isDirty: false,
          hasImage: !!obs.image_url,
          hasData: true,
          observationId: obs.observation_id
        };
      });
      
      setGasifierFormIds(gasifierIds);
      setGasifierForms(gasifierFormState);
      
      // If we're in an active session, update it to show we're working on it
      if (sessionData?.session_id && sessionData.session_status !== 'Completed' && sessionData.session_status !== 'Cancelled') {
        try {
          await sessionManager.updateSessionActivity(sessionData.session_id);
        } catch (error) {
          logger.error('Failed to update session activity:', error);
        }
      }
    } catch (error) {
      logger.error('Error loading submission data:', error);
      setErrorLoadingData(error instanceof Error ? error.message : 'Failed to load submission data');
    } finally {
      setIsLoading(false);
    }
  }, [programId, siteId, submissionId, selectedSite, fetchSite, setSelectedSite, fetchSubmissionPetriObservations, fetchSubmissionGasifierObservations, setCurrentSessionId, formik]);
  
  // Load data on initial render
  useEffect(() => {
    loadSubmissionData();
  }, [loadSubmissionData]);
  
  // Initialize formik
  const formik = useFormik({
    initialValues: {
      temperature: 70,
      humidity: 50,
      indoor_temperature: '' as number | '',
      indoor_humidity: '' as number | '',
      airflow: 'Open' as 'Open' | 'Closed',
      odorDistance: '5-10ft' as '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft',
      weather: (suggestedWeatherType || 'Clear') as 'Clear' | 'Cloudy' | 'Rain',
      notes: ''
    },
    validationSchema: SubmissionFormSchema,
    validateOnMount: true,
    onSubmit: async (values) => {
      await handleSubmit(values, false);
    },
  });
  
  // Handle data submission
  const handleSubmit = async (values: typeof formik.values, isComplete: boolean) => {
    if (!programId || !siteId || !submissionId) {
      toast.error('Missing required IDs');
      return;
    }
    
    // Check if we need to confirm incomplete submission
    if (isComplete && !isSubmittingIncomplete) {
      const petrisComplete = Object.values(petriForms).filter(form => form.isValid).length;
      const gasifiersComplete = Object.values(gasifierForms).filter(form => form.isValid).length;
      
      // Check if all expected observations are there
      if (
        (expectedPetriCount > 0 && petrisComplete < expectedPetriCount) ||
        (expectedGasifierCount > 0 && gasifiersComplete < expectedGasifierCount)
      ) {
        setShowConfirmIncomplete(true);
        return;
      }
    }
    
    if (isComplete) {
      setIsCompleting(true);
    } else {
      setIsSaving(true);
    }
    
    try {
      // Prepare petri observation data
      const petriData: PetriFormData[] = [];
      for (const formId of petriFormIds) {
        const form = petriForms[formId];
        if (!form) continue;
        
        const petriForm = petriFormRefs.current[formId];
        if (petriForm) {
          // Validate the form if completing
          if (isComplete && !form.isValid) {
            const isFormValid = await petriForm.validate();
            if (!isFormValid) {
              // If we can't complete because a form is invalid, stop here
              if (isComplete) {
                toast.error(`Please fix the errors in Petri observation ${petriForm.petriCode}`);
                return;
              }
            }
          }
          
          // Reset dirty flag if successful
          if (!isComplete) {
            petriForm.resetDirty();
          }
        }
      }
      
      // Prepare gasifier observation data
      const gasifierData: GasifierFormData[] = [];
      for (const formId of gasifierFormIds) {
        const form = gasifierForms[formId];
        if (!form) continue;
        
        const gasifierForm = gasifierFormRefs.current[formId];
        if (gasifierForm) {
          // Validate the form if completing
          if (isComplete && !form.isValid) {
            const isFormValid = await gasifierForm.validate();
            if (!isFormValid) {
              // If we can't complete because a form is invalid, stop here
              if (isComplete) {
                toast.error(`Please fix the errors in Gasifier observation ${gasifierForm.gasifierCode}`);
                return;
              }
            }
          }
          
          // Reset dirty flag if successful
          if (!isComplete) {
            gasifierForm.resetDirty();
          }
        }
      }
      
      // If this is a completion request, send it to the server
      if (isComplete && session?.session_id) {
        try {
          logger.info(`Completing submission session ${session.session_id}`);
          const result = await sessionManager.completeSubmissionSession(session.session_id);
          
          if (result && result.success) {
            logger.info('Session completed successfully', result);
            toast.success('Submission completed successfully!');
            navigate(`/programs/${programId}/sites/${siteId}`);
            return;
          } else {
            throw new Error(result?.message || 'Failed to complete submission');
          }
        } catch (error) {
          logger.error('Error completing submission session:', error);
          toast.error(`Error completing submission: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (!isComplete) {
        // Update the submission
        const result = await updateSubmission(
          submissionId,
          values.temperature,
          values.humidity,
          values.airflow,
          values.odorDistance,
          values.weather,
          values.notes || null,
          petriData,
          gasifierData,
          values.indoor_temperature ? Number(values.indoor_temperature) : null,
          values.indoor_humidity ? Number(values.indoor_humidity) : null
        );
        
        if (result) {
          logger.debug('Submission updated successfully');
          toast.success('Submission saved successfully');
          
          // If we're in an active session, update it
          if (session?.session_id && 
              session.session_status !== 'Completed' && 
              session.session_status !== 'Cancelled') {
            try {
              await sessionManager.updateSessionActivity(session.session_id);
            } catch (error) {
              logger.error('Failed to update session activity:', error);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error submitting data:', error);
      toast.error('Failed to save submission');
    } finally {
      setIsSaving(false);
      setIsCompleting(false);
      setIsSubmittingIncomplete(false);
    }
  };
  
  // Add petri form
  const addPetriForm = () => {
    // Check for template warnings first
    if (expectedPetriCount > 0 && !petriTemplateWarning) {
      setPetriTemplateWarning(true);
      return;
    }
    
    const formId = uuidv4();
    setPetriFormIds(prevIds => [...prevIds, formId]);
    setPetriForms(prevForms => ({
      ...prevForms,
      [formId]: {
        id: formId,
        isValid: false,
        isDirty: false,
        hasImage: false,
        hasData: false
      }
    }));
  };
  
  // Add gasifier form
  const addGasifierForm = () => {
    // Check for template warnings first
    if (expectedGasifierCount > 0 && !gasifierTemplateWarning) {
      setGasifierTemplateWarning(true);
      return;
    }
    
    const formId = uuidv4();
    setGasifierFormIds(prevIds => [...prevIds, formId]);
    setGasifierForms(prevForms => ({
      ...prevForms,
      [formId]: {
        id: formId,
        isValid: false,
        isDirty: false,
        hasImage: false,
        hasData: false
      }
    }));
  };
  
  // Update petri form state
  const updatePetriForm = (formId: string, data: any) => {
    setPetriForms(prevForms => ({
      ...prevForms,
      [formId]: {
        ...prevForms[formId],
        ...data
      }
    }));
  };
  
  // Update gasifier form state
  const updateGasifierForm = (formId: string, data: any) => {
    setGasifierForms(prevForms => ({
      ...prevForms,
      [formId]: {
        ...prevForms[formId],
        ...data
      }
    }));
  };
  
  // Remove petri form
  const removePetriForm = (formId: string) => {
    setPetriFormIds(prevIds => prevIds.filter(id => id !== formId));
    setPetriForms(prevForms => {
      const newForms = {...prevForms};
      delete newForms[formId];
      return newForms;
    });
  };
  
  // Remove gasifier form
  const removeGasifierForm = (formId: string) => {
    setGasifierFormIds(prevIds => prevIds.filter(id => id !== formId));
    setGasifierForms(prevForms => {
      const newForms = {...prevForms};
      delete newForms[formId];
      return newForms;
    });
  };
  
  // UI Functions
  const togglePetriSection = () => {
    setIsPetriSectionOpen(!isPetriSectionOpen);
  };
  
  const toggleGasifierSection = () => {
    setIsGasifierSectionOpen(!isGasifierSectionOpen);
  };
  
  // Function to handle sharing the session
  const handleShareSession = () => {
    if (session?.session_id) {
      setIsShareModalOpen(true);
    } else {
      toast.error('No active session to share');
    }
  };
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (errorLoadingData) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-error-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
        <p className="text-gray-600 mb-6">{errorLoadingData}</p>
        <div className="flex justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
          >
            Back to Site
          </Button>
          <Button
            variant="primary"
            onClick={() => loadSubmissionData()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="animate-fade-in pb-20">
      {/* Back navigation */}
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
          data-testid="back-button"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Submission</h1>
          {selectedSite && (
            <p className="text-gray-600 mt-1">
              {selectedSite.name} - {submission?.global_submission_id ? `#${submission.global_submission_id}` : 'New'}
            </p>
          )}
        </div>
        
        {/* Share button - only for active sessions */}
        {session && (session.session_status === 'Opened' || session.session_status === 'Working' || session.session_status === 'Shared' || session.session_status === 'Escalated') && (
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              icon={<Share2 size={16} />}
              onClick={handleShareSession}
              data-testid="share-button"
            >
              Share
            </Button>
          </div>
        )}
      </div>
      
      {/* Session status card */}
      <SubmissionOverviewCard
        session={session}
        submissionCreatedAt={submission?.created_at}
        openedByUserEmail={session?.opened_by_user_email}
        openedByUserName={session?.opened_by_user_name}
        onShare={handleShareSession}
        canShare={session?.opened_by_user_id === user?.id || session?.session_status === 'Escalated'}
        petrisComplete={Object.values(petriForms).filter(form => form.isValid).length}
        petrisTotal={petriFormIds.length}
        gasifiersComplete={Object.values(gasifierForms).filter(form => form.isValid).length}
        gasifiersTotal={gasifierFormIds.length}
      />
      
      {/* Main form */}
      <form onSubmit={formik.handleSubmit}>
        {/* Environmental conditions */}
        <Card className="mb-6">
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Environmental Conditions</h2>
            {/* Only show save button if session is active */}
            {session && (session.session_status === 'Opened' || session.session_status === 'Working' || session.session_status === 'Shared' || session.session_status === 'Escalated') && (
              <div className="flex space-x-2">
                <Button 
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<Save size={16} />}
                  isLoading={isSaving}
                  disabled={!formik.isValid || formik.isSubmitting}
                  data-testid="save-button"
                >
                  Save Changes
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-700">Outdoor Environment</h3>
                
                <Input
                  label="Temperature (°F)"
                  id="temperature"
                  name="temperature"
                  type="number"
                  value={formik.values.temperature}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.temperature && formik.errors.temperature ? formik.errors.temperature : undefined}
                  disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
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
                  disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
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
                    disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
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
                    disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
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
              
              <div>
                <h3 className="text-md font-medium mb-3 text-gray-700">Indoor Environment & Weather</h3>
                
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
                  disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                  helperText="Valid range: 32-120°F (optional)"
                />
                
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
                  disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                  helperText="Valid range: 1-100% (optional)"
                />
                
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
                      disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                    >
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
                      disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                    >
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
                      disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                    >
                      <span className="mt-1 text-sm font-medium">Rain</span>
                    </button>
                  </div>
                  {formik.touched.weather && formik.errors.weather && (
                    <p className="mt-1 text-sm text-error-600">{formik.errors.weather}</p>
                  )}
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
                disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                data-testid="notes-textarea"
              ></textarea>
              {formik.touched.notes && formik.errors.notes && (
                <p className="mt-1 text-sm text-error-600">{formik.errors.notes}</p>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Petri observations */}
        <Card className="mb-6">
          <CardHeader onClick={togglePetriSection} className="cursor-pointer flex justify-between items-center">
            <div className="flex items-center">
              <h2 className="text-lg font-semibold">Petri Dish Observations</h2>
              <div className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                {Object.values(petriForms).filter(form => form.isValid).length}/{petriFormIds.length} Complete
              </div>
            </div>
            <div>
              {isPetriSectionOpen ? <ChevronsUp size={18} /> : <ChevronsDown size={18} />}
            </div>
          </CardHeader>
          
          <ObservationListManager<ObservationFormState>
            observations={petriFormIds.map(id => petriForms[id])}
            setObservations={(observations) => {
              const formIds = observations.map(obs => obs.id);
              setPetriFormIds(formIds);
            }}
            isAccordionOpen={isPetriSectionOpen}
            setIsAccordionOpen={setIsPetriSectionOpen}
            addButtonText="Add Petri Observation"
            templateWarningEntityType="Petri"
            onShowTemplateWarning={(entityType) => setPetriTemplateWarning(true)}
            disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
            createEmptyObservation={() => ({
              id: uuidv4(),
              isValid: false,
              isDirty: false,
              hasImage: false,
              hasData: false
            })}
            renderFormComponent={(observation, index, onUpdate, onRemove, showRemoveButton, disabled) => {
              const initialPetriObs = petriObservations.find(obs => obs.observation_id === observation.observationId);
              
              return (
                <PetriForm
                  id={`petri-form-${observation.id}`}
                  formId={observation.id}
                  index={index}
                  siteId={siteId || ''}
                  submissionSessionId={session?.session_id || submissionId || ''}
                  onUpdate={updatePetriForm}
                  onRemove={onRemove}
                  showRemoveButton={showRemoveButton}
                  ref={ref => petriFormRefs.current[observation.id] = ref}
                  initialData={initialPetriObs ? {
                    petriCode: initialPetriObs.petri_code,
                    imageUrl: initialPetriObs.image_url,
                    plantType: initialPetriObs.plant_type,
                    fungicideUsed: initialPetriObs.fungicide_used,
                    surroundingWaterSchedule: initialPetriObs.surrounding_water_schedule,
                    notes: initialPetriObs.notes,
                    placement: initialPetriObs.placement,
                    placement_dynamics: initialPetriObs.placement_dynamics,
                    observationId: initialPetriObs.observation_id,
                    outdoor_temperature: initialPetriObs.outdoor_temperature,
                    outdoor_humidity: initialPetriObs.outdoor_humidity,
                    is_image_split: initialPetriObs.is_image_split,
                    is_split_source: initialPetriObs.is_split_source,
                    split_processed: initialPetriObs.split_processed,
                    phase_observation_settings: initialPetriObs.phase_observation_settings,
                    main_petri_id: initialPetriObs.main_petri_id
                  } : undefined}
                  disabled={disabled || session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                  observationId={observation.observationId}
                  submissionOutdoorTemperature={submission?.temperature}
                  submissionOutdoorHumidity={submission?.humidity}
                />
              );
            }}
            testId="petri-observations-list"
          />
        </Card>
        
        {/* Gasifier observations */}
        <Card className="mb-6">
          <CardHeader onClick={toggleGasifierSection} className="cursor-pointer flex justify-between items-center">
            <div className="flex items-center">
              <h2 className="text-lg font-semibold">Gasifier Observations</h2>
              <div className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                {Object.values(gasifierForms).filter(form => form.isValid).length}/{gasifierFormIds.length} Complete
              </div>
            </div>
            <div>
              {isGasifierSectionOpen ? <ChevronsUp size={18} /> : <ChevronsDown size={18} />}
            </div>
          </CardHeader>
          
          <ObservationListManager<ObservationFormState>
            observations={gasifierFormIds.map(id => gasifierForms[id])}
            setObservations={(observations) => {
              const formIds = observations.map(obs => obs.id);
              setGasifierFormIds(formIds);
            }}
            isAccordionOpen={isGasifierSectionOpen}
            setIsAccordionOpen={setIsGasifierSectionOpen}
            addButtonText="Add Gasifier Observation"
            templateWarningEntityType="Gasifier"
            onShowTemplateWarning={(entityType) => setGasifierTemplateWarning(true)}
            disabled={session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
            createEmptyObservation={() => ({
              id: uuidv4(),
              isValid: false,
              isDirty: false,
              hasImage: false,
              hasData: false
            })}
            renderFormComponent={(observation, index, onUpdate, onRemove, showRemoveButton, disabled) => {
              const initialGasifierObs = gasifierObservations.find(obs => obs.observation_id === observation.observationId);
              
              return (
                <GasifierForm
                  id={`gasifier-form-${observation.id}`}
                  formId={observation.id}
                  index={index}
                  siteId={siteId || ''}
                  submissionSessionId={session?.session_id || submissionId || ''}
                  onUpdate={updateGasifierForm}
                  onRemove={onRemove}
                  showRemoveButton={showRemoveButton}
                  ref={ref => gasifierFormRefs.current[observation.id] = ref}
                  initialData={initialGasifierObs ? {
                    gasifierCode: initialGasifierObs.gasifier_code,
                    imageUrl: initialGasifierObs.image_url,
                    chemicalType: initialGasifierObs.chemical_type,
                    measure: initialGasifierObs.measure,
                    anomaly: initialGasifierObs.anomaly,
                    placementHeight: initialGasifierObs.placement_height,
                    directionalPlacement: initialGasifierObs.directional_placement,
                    placementStrategy: initialGasifierObs.placement_strategy,
                    notes: initialGasifierObs.notes,
                    observationId: initialGasifierObs.observation_id,
                    outdoor_temperature: initialGasifierObs.outdoor_temperature,
                    outdoor_humidity: initialGasifierObs.outdoor_humidity
                  } : undefined}
                  disabled={disabled || session?.session_status === 'Completed' || session?.session_status === 'Cancelled' || session?.session_status === 'Expired'}
                  observationId={observation.observationId}
                  submissionOutdoorTemperature={submission?.temperature}
                  submissionOutdoorHumidity={submission?.humidity}
                />
              );
            }}
            testId="gasifier-observations-list"
          />
        </Card>
        
        {/* Form actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-between z-10">
          <Button 
            type="button"
            variant="outline"
            onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
            data-testid="cancel-button"
          >
            Cancel
          </Button>
          <div className="flex space-x-2">
            {session && (session.session_status === 'Opened' || session.session_status === 'Working' || session.session_status === 'Shared' || session.session_status === 'Escalated') && (
              <Button 
                type="button"
                variant="success"
                icon={<CheckCircle2 size={16} />}
                onClick={() => {
                  setIsSubmittingIncomplete(true);
                  handleSubmit(formik.values, true);
                }}
                isLoading={isCompleting}
                disabled={!formik.isValid || isCompleting}
                data-testid="complete-button"
              >
                Complete Submission
              </Button>
            )}
            <Button 
              type="submit"
              variant="primary"
              icon={<Save size={16} />}
              isLoading={isSaving}
              disabled={!formik.isValid || isSaving}
              data-testid="save-button"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </form>
      
      {/* Modals */}
      <TemplateWarningModal
        isOpen={petriTemplateWarning}
        onClose={() => setPetriTemplateWarning(false)}
        onConfirm={addPetriForm}
        entityType="Petri"
      />
      
      <TemplateWarningModal
        isOpen={gasifierTemplateWarning}
        onClose={() => setGasifierTemplateWarning(false)}
        onConfirm={addGasifierForm}
        entityType="Gasifier"
      />
      
      <SessionShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        sessionId={session?.session_id || ''}
        programId={programId || ''}
      />
      
      <ConfirmSubmissionModal
        isOpen={showConfirmIncomplete}
        onClose={() => setShowConfirmIncomplete(false)}
        onConfirm={() => {
          setShowConfirmIncomplete(false);
          setIsSubmittingIncomplete(true);
          handleSubmit(formik.values, true);
        }}
        currentPetriCount={Object.values(petriForms).filter(form => form.isValid).length}
        currentGasifierCount={Object.values(gasifierForms).filter(form => form.isValid).length}
        expectedPetriCount={expectedPetriCount}
        expectedGasifierCount={expectedGasifierCount}
        siteName={selectedSite?.name || ''}
      />
      
      {/* Sync status indicator */}
      {!isOnline && (
        <SyncStatus
          status="offline"
          message="Working offline - Changes will be saved locally"
        />
      )}
    </div>
  );
};

export default SubmissionEditPage;