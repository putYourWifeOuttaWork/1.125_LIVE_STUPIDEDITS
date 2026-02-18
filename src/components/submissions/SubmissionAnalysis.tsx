import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { Navigation, Pagination } from 'swiper/modules';
import { Thermometer, Droplets, Leaf, Wind, Calendar, User, MapPin, AlertTriangle, Hash, SplitSquareVertical } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import ImageLightbox from './ImageLightbox';
import { format } from 'date-fns';
import { PetriObservation, GasifierObservation } from '../../lib/types';
import { toast } from 'react-toastify';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SubmissionAnalysis');

interface SubmissionAnalysisProps {
  submission: any;
  programId: string;
  siteId: string;
}

interface ObservationWithType {
  type: 'petri' | 'gasifier';
  data: PetriObservation | GasifierObservation;
}

const SubmissionAnalysis = ({ submission, programId, siteId }: SubmissionAnalysisProps) => {
  const navigate = useNavigate();
  const [observations, setObservations] = useState<ObservationWithType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<ObservationWithType | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Fetch observations when component mounts
  useEffect(() => {
    const fetchObservations = async () => {
      setIsLoading(true);
      try {
        // Fetch petri observations
        logger.debug(`Fetching petri observations for submission ${submission.submission_id}`);
        const { data: petriData, error: petriError } = await supabase
          .from('petri_observations')
          .select('*, main_petri_id')
          .eq('submission_id', submission.submission_id);

        if (petriError) {
          throw new Error(`Error fetching petri observations: ${petriError.message}`);
        }

        // Fetch gasifier observations
        logger.debug(`Fetching gasifier observations for submission ${submission.submission_id}`);
        const { data: gasifierData, error: gasifierError } = await supabase
          .from('gasifier_observations')
          .select('*')
          .eq('submission_id', submission.submission_id);

        if (gasifierError) {
          throw new Error(`Error fetching gasifier observations: ${gasifierError.message}`);
        }

        logger.debug(`Found ${petriData?.length || 0} petri observations and ${gasifierData?.length || 0} gasifier observations`);

        // Filter out child petri observations that have a main_petri_id 
        // (these are split images and we only want to show the parent)
        const filteredPetriData = petriData?.filter(p => !p.main_petri_id) || [];

        // Combine observations for the carousel
        const petriObservations: ObservationWithType[] = filteredPetriData.map(p => ({
          type: 'petri',
          data: p
        }));

        const gasifierObservations: ObservationWithType[] = gasifierData?.map(g => ({
          type: 'gasifier',
          data: g
        })) || [];

        // Sort observations by type and then by code
        const allObservations = [...petriObservations, ...gasifierObservations];
        allObservations.sort((a, b) => {
          // First sort by type
          if (a.type !== b.type) {
            return a.type === 'petri' ? -1 : 1;
          }
          
          // Then sort by code
          const codeA = a.type === 'petri' 
            ? (a.data as PetriObservation).petri_code 
            : (a.data as GasifierObservation).gasifier_code;
          const codeB = b.type === 'petri' 
            ? (b.data as PetriObservation).petri_code 
            : (b.data as GasifierObservation).gasifier_code;
            
          return codeA.localeCompare(codeB);
        });

        setObservations(allObservations);
      } catch (err) {
        logger.error('Error fetching observations:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        toast.error('Failed to load observations');
      } finally {
        setIsLoading(false);
      }
    };

    fetchObservations();
  }, [submission.submission_id]);

  const [selectedLightboxIndex, setSelectedLightboxIndex] = useState(0);

  const handleImageClick = (observation: ObservationWithType) => {
    const idx = observations.indexOf(observation);
    setSelectedObservation(observation);
    setSelectedLightboxIndex(idx >= 0 ? idx : 0);
    setIsLightboxOpen(true);
  };

  // Render a single observation in the carousel
  const renderObservation = (observation: ObservationWithType) => {
    const isImageSplit = observation.type === 'petri' && (observation.data as PetriObservation).is_image_split;

    const observationCode = observation.type === 'petri' 
      ? (observation.data as PetriObservation).petri_code 
      : (observation.data as GasifierObservation).gasifier_code;
      
    const imageUrl = observation.data.image_url;
    
    return (
      <div className="flex flex-col items-center">
        {/* Image container */}
        <div 
          className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:border-primary-500 transition-all cursor-pointer relative"
          onClick={() => imageUrl && handleImageClick(observation)}
        >
          {imageUrl ? (
            <>
              <img 
                src={imageUrl} 
                alt={`${observation.type === 'petri' ? 'Petri' : 'Gasifier'} ${observationCode}`}
                className="w-full h-full object-contain"
              />
              {isImageSplit && (
                <div className="absolute bottom-2 right-2 bg-primary-100 p-1 rounded-full">
                  <SplitSquareVertical size={16} className="text-primary-800" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <AlertTriangle className="h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-500 mt-2">No image</p>
            </div>
          )}
        </div>
        
        {/* Metadata */}
        <div className="mt-3 w-full px-2 space-y-1">
          <div className="flex justify-between items-center">
            <span className="font-medium">{observation.type === 'petri' ? 'Petri' : 'Gasifier'} {observationCode}</span>
            {observation.type === 'petri' && (observation.data as PetriObservation).is_split_source && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary-100 text-primary-800">
                <SplitSquareVertical size={12} className="mr-1" />
                Split Image
              </span>
            )}
          </div>
          
          {/* Environmental data */}
          <div className="grid grid-cols-2 gap-1 text-xs">
            {observation.data.outdoor_temperature && (
              <div className="flex items-center">
                <Thermometer className="h-3 w-3 text-error-500 mr-1" />
                <span>{observation.data.outdoor_temperature}°F</span>
              </div>
            )}
            {observation.data.outdoor_humidity && (
              <div className="flex items-center">
                <Droplets className="h-3 w-3 text-secondary-500 mr-1" />
                <span>{observation.data.outdoor_humidity}%</span>
              </div>
            )}
            
            {/* Type-specific metadata */}
            {observation.type === 'petri' && (
              <>
                {(observation.data as PetriObservation).placement && (
                  <div className="flex items-center">
                    <MapPin className="h-3 w-3 text-primary-500 mr-1" />
                    <span>{(observation.data as PetriObservation).placement}</span>
                  </div>
                )}
                {(observation.data as PetriObservation).fungicide_used && (
                  <div className="flex items-center">
                    <Leaf className="h-3 w-3 text-green-500 mr-1" />
                    <span>Fungicide: {(observation.data as PetriObservation).fungicide_used}</span>
                  </div>
                )}
              </>
            )}
            
            {observation.type === 'gasifier' && (
              <>
                {(observation.data as GasifierObservation).chemical_type && (
                  <div className="flex items-center">
                    <Wind className="h-3 w-3 text-primary-500 mr-1" />
                    <span>{(observation.data as GasifierObservation).chemical_type}</span>
                  </div>
                )}
                {(observation.data as GasifierObservation).placement_height && (
                  <div className="flex items-center">
                    <MapPin className="h-3 w-3 text-primary-500 mr-1" />
                    <span>{(observation.data as GasifierObservation).placement_height}</span>
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="text-xs text-gray-500 mt-1">
            <span>Updated: {format(new Date(observation.data.updated_at), 'MMM d, h:mm a')}</span>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-800">
        <h3 className="font-medium mb-2">Error loading observations</h3>
        <p className="text-sm">{error}</p>
        <Button 
          variant="outline"
          size="sm"
          onClick={() => navigate(`/programs/${programId}/sites/${siteId}/submissions/${submission.submission_id}/edit`)}
          className="mt-3"
        >
          View Full Submission
        </Button>
      </div>
    );
  }

  if (observations.length === 0) {
    return (
      <div className="text-center py-6">
        <Leaf className="mx-auto h-10 w-10 text-gray-300" />
        <p className="text-gray-600 mt-2">No observations found for this submission</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <h3 className="text-lg font-medium mb-4">Observation Analysis ({observations.length})</h3>
      
      {/* Image Carousel */}
      <Swiper
        modules={[Navigation, Pagination]}
        spaceBetween={20}
        slidesPerView={1}
        navigation
        pagination={{ clickable: true }}
        breakpoints={{
          640: {
            slidesPerView: 2,
          },
          768: {
            slidesPerView: 2,
          },
          1024: {
            slidesPerView: 3,
          },
          1280: {
            slidesPerView: 4,
          },
        }}
        className="mb-4"
      >
        {observations.map((observation, index) => (
          <SwiperSlide key={observation.data.observation_id}>
            {renderObservation(observation)}
          </SwiperSlide>
        ))}
      </Swiper>
      
      {/* Submission Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 border-t border-gray-200 pt-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Submission Overview</h4>
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Submission ID:</span>
              <span className="text-sm font-medium">
                {submission.global_submission_id ? `#${submission.global_submission_id}` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Created:</span>
              <span className="text-sm font-medium">
                {format(new Date(submission.created_at), 'PPp')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <span className="text-sm font-medium">
                {sessionStatus || 'N/A'}
              </span>
            </div>
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Environmental Conditions</h4>
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center">
              <Thermometer className="text-error-500 mr-2" size={16} />
              <span className="text-sm text-gray-600">Temperature:</span>
              <span className="text-sm font-medium ml-auto">{submission.temperature}°F</span>
            </div>
            <div className="flex items-center">
              <Droplets className="text-secondary-500 mr-2" size={16} />
              <span className="text-sm text-gray-600">Humidity:</span>
              <span className="text-sm font-medium ml-auto">{submission.humidity}%</span>
            </div>
            <div className="flex items-center">
              <Wind className="text-primary-500 mr-2" size={16} />
              <span className="text-sm text-gray-600">Airflow:</span>
              <span className="text-sm font-medium ml-auto">{submission.airflow}</span>
            </div>
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Observation Counts</h4>
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Petri Samples:</span>
              <span className="text-sm font-medium">{observations.filter(o => o.type === 'petri').length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Gasifier Samples:</span>
              <span className="text-sm font-medium">{observations.filter(o => o.type === 'gasifier').length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Split Images:</span>
              <span className="text-sm font-medium">
                {observations.filter(o => o.type === 'petri' && (o.data as PetriObservation).is_split_source).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {selectedObservation && (
        <ImageLightbox
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          observation={selectedObservation}
          observations={observations.filter(o => o.data.image_url)}
          initialIndex={selectedLightboxIndex}
        />
      )}
    </div>
  );
};

export default SubmissionAnalysis;