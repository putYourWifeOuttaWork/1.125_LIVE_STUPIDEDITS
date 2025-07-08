import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Check, X, Share2, AlertTriangle, ChevronsDown, ChevronsUp, Save } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import PetriForm, { PetriFormRef } from '../components/submissions/PetriForm';
import GasifierForm, { GasifierFormRef } from '../components/submissions/GasifierForm';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { useSites } from '../hooks/useSites';
import { useSubmissions } from '../hooks/useSubmissions';
import LoadingScreen from '../components/common/LoadingScreen';
import useWeather from '../hooks/useWeather';
import ConfirmSubmissionModal from '../components/submissions/ConfirmSubmissionModal';
import { ObservationFormState } from '../components/forms/ObservationListManager';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';
import { PetriFormData, GasifierFormData } from '../utils/submissionUtils';
import { useSessionStore } from '../stores/sessionStore';
import sessionManager from '../lib/sessionManager';
import SessionShareModal from '../components/submissions/SessionShareModal';
import SubmissionOverviewCard from '../components/submissions/SubmissionOverviewCard';
import SyncStatus from '../components/common/SyncStatus';

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

interface FormData {
  temperature: number;
  humidity: number;
  indoor_temperature: number | '';
  indoor_humidity: number | '';
  airflow: 'Open' | 'Closed';
  odorDistance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft';
  weather: 'Clear' | 'Cloudy' | 'Rain';
  notes: string;
}

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
  const { selectedProgram, selectedSite, setSelectedSite } = usePilotProgramStore();
  const { updateSubmission, loading: submissionLoading } = useSubmissions(siteId);
  const { suggestedWeatherType } = useWeather();
  
  // Session management
  const { setCurrentSessionId, activeSessions } = useSessionStore();

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
  
  // Expand/collapse state for sections
  const [isPetriSectionOpen, setIsPetriSectionOpen] = useState(true);
  const [isGasifierSectionOpen, setIsGasifierSectionOpen] = useState(true);
  
  // Session management
  const [session, setSession] = useState<any>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const [syncMessage, setSyncMessage] = useState('');
  
  // Function to initialize form with submission data
  const initializeForm = useCallback((submissionData: any, petriObs: any[], gasifierObs: any[]) => {
    // Your initialization logic here
    setSubmission(submissionData);
    setPetriObservations(petriObs);
    setGasifierObservations(gasifierObs);
    
    // Set current session ID in the session store if we have a session
    if (session?.session_id) {
      setCurrentSessionId(session.session_id);
    }
    
    // Initialize form with submission values
    formik.setValues({
      temperature: submissionData.temperature || 70,
      humidity: submissionData.humidity || 50,
      indoor_temperature: submissionData.indoor_temperature || '',
      indoor_humidity: submissionData.indoor_humidity || '',
      airflow: submissionData.airflow || 'Open',
      odorDistance: submissionData.odor_distance || '5-10ft',
      weather: submissionData.weather || suggestedWeatherType || 'Clear',
      notes: submissionData.notes || ''
    });
    
    // Initialize petri observations
    const petriIds: string[] = [];
    const petriFormState: PetriForms = {};
    
    petriObs.forEach(obs => {
      const formId = uuidv4();
      petriIds.push(formId);
      
      petriFormState[formId] = {
        id: formId,
        isValid: true,
        isDirty: false,
        hasImage: !!obs.image_url,
        observationId: obs.observation_id,
        petriCode: obs.petri_code || '',
        // Add other fields as needed
      };
    });
    
    setPetriFormIds(petriIds);
    setPetriForms(petriFormState);
    
    // Initialize gasifier observations
    const gasifierIds: string[] = [];
    const gasifierFormState: GasifierForms = {};
    
    gasifierObs.forEach(obs => {
      const formId = uuidv4();
      gasifierIds.push(formId);
      
      gasifierFormState[formId] = {
        id: formId,
        isValid: true,
        isDirty: false,
        hasImage: !!obs.image_url,
        observationId: obs.observation_id,
        gasifierCode: obs.gasifier_code || '',
        // Add other fields as needed
      };
    });
    
    setGasifierFormIds(gasifierIds);
    setGasifierForms(gasifierFormState);
    
    setIsLoading(false);
  }, [setCurrentSessionId, suggestedWeatherType]);
  
  // Initialize formik
  const formik = useFormik<FormData>({
    initialValues: {
      temperature: 70,
      humidity: 50,
      indoor_temperature: '',
      indoor_humidity: '',
      airflow: 'Open',
      odorDistance: '5-10ft',
      weather: suggestedWeatherType || 'Clear',
      notes: ''
    },
    validationSchema: SubmissionFormSchema,
    validateOnMount: true,
    onSubmit: async (values) => {
      await handleSubmit(values, false);
    },
  });
  
  // Handle data submission
  const handleSubmit = async (values: FormData, isComplete: boolean) => {
    if (!programId || !siteId || !submissionId) {
      toast.error('Missing required IDs');
      return;
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
        if (!form || !form.hasData) continue;
        
        const petriForm = petriFormRefs.current[formId];
        if (petriForm) {
          // Validate the form if completing
          if (isComplete && !form.isValid) {
            await petriForm.validate();
          }
          
          // Add form data
          petriData.push({
            formId,
            petriCode: petriForm.petriCode || '',
            // Add other fields as needed
            // These would typically come from the form refs
            hasData: form.hasData,
            hasImage: form.hasImage,
            imageFile: null, // This would be populated with actual data
            observationId: form.observationId,
            isValid: form.isValid,
            isDirty: form.isDirty,
            plantType: 'Other Fresh Perishable',
            fungicideUsed: 'No',
            surroundingWaterSchedule: '',
            notes: '',
          });
        }
      }
      
      // Prepare gasifier observation data
      const gasifierData: GasifierFormData[] = [];
      for (const formId of gasifierFormIds) {
        const form = gasifierForms[formId];
        if (!form || !form.hasData) continue;
        
        const gasifierForm = gasifierFormRefs.current[formId];
        if (gasifierForm) {
          // Validate the form if completing
          if (isComplete && !form.isValid) {
            await gasifierForm.validate();
          }
          
          // Add form data
          gasifierData.push({
            formId,
            gasifierCode: gasifierForm.gasifierCode || '',
            // Add other fields as needed
            // These would typically come from the form refs
            hasData: form.hasData,
            hasImage: form.hasImage,
            imageFile: null, // This would be populated with actual data
            observationId: form.observationId,
            isValid: form.isValid,
            isDirty: form.isDirty,
            chemicalType: 'CLO2',
            measure: null,
            anomaly: false,
            notes: '',
          });
        }
      }
      
      // If this is a completion request, send it to the server
      if (isComplete) {
        // Handle completion logic
        console.log('Completing submission');
      } else {
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
          toast.success('Submission saved successfully');
        }
      }
    } catch (error) {
      console.error('Error submitting data:', error);
      toast.error('Failed to save submission');
    } finally {
      setIsSaving(false);
      setIsCompleting(false);
      setIsSubmittingIncomplete(false);
    }
  };
  
  // Add petri form
  const addPetriForm = () => {
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
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  return (
    <div className="animate-fade-in pb-20">
      {/* Submission form */}
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Submission</h1>
          {selectedSite && (
            <p className="text-gray-600 mt-1">{selectedSite.name}</p>
          )}
        </div>
      </div>
      
      {/* Session status card */}
      {session && (
        <SubmissionOverviewCard
          session={session}
          submissionCreatedAt={submission?.created_at}
          onShare={() => setIsShareModalOpen(true)}
          canShare={!!user}
          petrisComplete={Object.values(petriForms).filter(form => form.isValid).length}
          petrisTotal={petriFormIds.length}
          gasifiersComplete={Object.values(gasifierForms).filter(form => form.isValid).length}
          gasifiersTotal={gasifierFormIds.length}
        />
      )}
      
      {/* Main form */}
      <form onSubmit={formik.handleSubmit}>
        {/* Environmental conditions */}
        <Card className="mb-6">
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Environmental Conditions</h2>
            <div className="flex space-x-2">
              <Button 
                type="submit"
                variant="primary"
                size="sm"
                icon={<Save size={16} />}
                onClick={() => handleSubmit(formik.values, false)}
                isLoading={isSaving}
                disabled={!formik.isValid}
              >
                Save Changes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Environment form fields would go here */}
            <p>Environmental form fields would be rendered here</p>
          </CardContent>
        </Card>
        
        {/* Petri observations */}
        <Card className="mb-6">
          <CardHeader onClick={togglePetriSection} className="cursor-pointer">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Petri Dish Observations</h2>
              {isPetriSectionOpen ? <ChevronsUp size={18} /> : <ChevronsDown size={18} />}
            </div>
          </CardHeader>
          {isPetriSectionOpen && (
            <CardContent>
              <div className="space-y-4">
                {petriFormIds.map((formId, index) => (
                  <div key={formId}>
                    {/* PetriForm would be rendered here */}
                    <p>PetriForm {index + 1} would be rendered here</p>
                  </div>
                ))}
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addPetriForm}
                  >
                    Add Petri Observation
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        
        {/* Gasifier observations */}
        <Card className="mb-6">
          <CardHeader onClick={toggleGasifierSection} className="cursor-pointer">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Gasifier Observations</h2>
              {isGasifierSectionOpen ? <ChevronsUp size={18} /> : <ChevronsDown size={18} />}
            </div>
          </CardHeader>
          {isGasifierSectionOpen && (
            <CardContent>
              <div className="space-y-4">
                {gasifierFormIds.map((formId, index) => (
                  <div key={formId}>
                    {/* GasifierForm would be rendered here */}
                    <p>GasifierForm {index + 1} would be rendered here</p>
                  </div>
                ))}
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addGasifierForm}
                  >
                    Add Gasifier Observation
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        
        {/* Form actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-between z-10">
          <Button 
            variant="outline"
            onClick={() => navigate(`/programs/${programId}/sites/${siteId}`)}
          >
            Cancel
          </Button>
          <div className="flex space-x-2">
            {session && (session.session_status === 'Opened' || session.session_status === 'Working' || session.session_status === 'Shared' || session.session_status === 'Escalated') && (
              <Button 
                variant="success"
                onClick={() => handleSubmit(formik.values, true)}
                isLoading={isCompleting}
                disabled={!formik.isValid}
              >
                Complete Submission
              </Button>
            )}
            <Button 
              type="submit"
              variant="primary"
              isLoading={isSaving}
              disabled={!formik.isValid}
            >
              Save Changes
            </Button>
          </div>
        </div>
        
      </form>
      
      {/* Modals */}
      <SessionShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        sessionId={session?.session_id || ''}
        programId={programId || ''}
      />
      
      <ConfirmSubmissionModal
        isOpen={showConfirmIncomplete}
        onClose={() => setShowConfirmIncomplete(false)}
        onConfirm={() => handleSubmit(formik.values, true)}
        currentPetriCount={Object.values(petriForms).filter(form => form.isValid).length}
        currentGasifierCount={Object.values(gasifierForms).filter(form => form.isValid).length}
        expectedPetriCount={selectedSite?.total_petris || 0}
        expectedGasifierCount={selectedSite?.total_gasifiers || 0}
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