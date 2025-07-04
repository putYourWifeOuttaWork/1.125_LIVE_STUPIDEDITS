import { useState } from 'react';
import { X, Download, Share2, Maximize, PenLine, SplitSquareVertical, MapPin } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { PetriObservation, GasifierObservation } from '../../lib/types';
import { toast } from 'react-toastify';

interface ObservationWithType {
  type: 'petri' | 'gasifier';
  data: PetriObservation | GasifierObservation;
}

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  observation: ObservationWithType;
}

const ImageLightbox = ({ isOpen, onClose, observation }: ImageLightboxProps) => {
  const [zoom, setZoom] = useState(100);

  const handleDownload = async () => {
    if (!observation.data.image_url) return;
    
    try {
      // Fetch the image
      const response = await fetch(observation.data.image_url);
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Generate filename based on observation type and code
      const code = observation.type === 'petri' 
        ? (observation.data as PetriObservation).petri_code
        : (observation.data as GasifierObservation).gasifier_code;
      
      a.download = `${observation.type}_${code}_${Date.now()}.jpg`;
      
      // Trigger download
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Image downloaded successfully');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Failed to download image');
    }
  };

  const handleShare = () => {
    if (!observation.data.image_url) return;
    
    // Copy the image URL to clipboard
    navigator.clipboard.writeText(observation.data.image_url)
      .then(() => {
        toast.success('Image URL copied to clipboard');
      })
      .catch((error) => {
        console.error('Error copying to clipboard:', error);
        toast.error('Failed to copy URL to clipboard');
      });
  };

  const handleAnalyze = () => {
    toast.info('Image analysis feature is coming soon');
  };

  const handleMarkUp = () => {
    toast.info('Image markup feature is coming soon');
  };

  const handleSplitImage = () => {
    toast.info('Image splitting feature is coming soon');
  };

  // Get observation metadata
  const getObservationDetails = () => {
    if (observation.type === 'petri') {
      const petri = observation.data as PetriObservation;
      return (
        <>
          <div className="space-y-1 mb-3">
            <h3 className="text-lg font-bold">{petri.petri_code}</h3>
            <p className="text-sm text-gray-600">Petri Observation</p>
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Fungicide Used:</span>
              <span className="ml-2 font-medium">{petri.fungicide_used}</span>
            </div>
            <div>
              <span className="text-gray-500">Water Schedule:</span>
              <span className="ml-2 font-medium">{petri.surrounding_water_schedule}</span>
            </div>
            {petri.placement && (
              <div>
                <span className="text-gray-500">Placement:</span>
                <span className="ml-2 font-medium">{petri.placement}</span>
              </div>
            )}
            {petri.placement_dynamics && (
              <div>
                <span className="text-gray-500">Placement Dynamics:</span>
                <span className="ml-2 font-medium">{petri.placement_dynamics}</span>
              </div>
            )}
            {petri.petri_growth_stage && (
              <div className="col-span-2">
                <span className="text-gray-500">Growth Stage:</span>
                <span className="ml-2 font-medium">{petri.petri_growth_stage}</span>
              </div>
            )}
            {petri.growth_index && (
              <div>
                <span className="text-gray-500">Growth Index:</span>
                <span className="ml-2 font-medium">{petri.growth_index}</span>
              </div>
            )}
            {petri.growth_progression && (
              <div>
                <span className="text-gray-500">Growth Progression:</span>
                <span className="ml-2 font-medium">{petri.growth_progression}</span>
              </div>
            )}
          </div>
          
          {petri.notes && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-600 mb-1">Notes:</h4>
              <p className="text-sm bg-gray-50 p-2 rounded">{petri.notes}</p>
            </div>
          )}
        </>
      );
    } else {
      const gasifier = observation.data as GasifierObservation;
      return (
        <>
          <div className="space-y-1 mb-3">
            <h3 className="text-lg font-bold">{gasifier.gasifier_code}</h3>
            <p className="text-sm text-gray-600">Gasifier Observation</p>
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Chemical Type:</span>
              <span className="ml-2 font-medium">{gasifier.chemical_type}</span>
            </div>
            {gasifier.measure !== null && (
              <div>
                <span className="text-gray-500">Measure:</span>
                <span className="ml-2 font-medium">{gasifier.measure}</span>
              </div>
            )}
            {gasifier.anomaly && (
              <div className="col-span-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-warning-100 text-warning-800">
                  Anomaly Detected
                </span>
              </div>
            )}
            {gasifier.placement_height && (
              <div>
                <span className="text-gray-500">Height:</span>
                <span className="ml-2 font-medium">{gasifier.placement_height}</span>
              </div>
            )}
            {gasifier.directional_placement && (
              <div>
                <span className="text-gray-500">Directional:</span>
                <span className="ml-2 font-medium">{gasifier.directional_placement}</span>
              </div>
            )}
            {gasifier.placement_strategy && (
              <div>
                <span className="text-gray-500">Strategy:</span>
                <span className="ml-2 font-medium">{gasifier.placement_strategy}</span>
              </div>
            )}
          </div>
          
          {gasifier.notes && (
            <div className="mt-3">
              <h4 className="text-sm font-medium text-gray-600 mb-1">Notes:</h4>
              <p className="text-sm bg-gray-50 p-2 rounded">{gasifier.notes}</p>
            </div>
          )}
        </>
      );
    }
  };

  if (!observation.data.image_url) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold text-xl">
            {observation.type === 'petri' ? 'Petri' : 'Gasifier'} Observation
          </span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
      }
      maxWidth="4xl"
    >
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Image column - takes 2/3 of the space on medium screens and up */}
          <div className="md:col-span-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-black bg-opacity-30 z-10">
              <div className="flex space-x-1">
                <button
                  onClick={() => setZoom(Math.max(zoom - 10, 50))}
                  className="p-1 bg-white bg-opacity-80 rounded text-gray-700 hover:bg-opacity-100 transition-colors"
                >
                  -
                </button>
                <div className="px-2 py-1 bg-white bg-opacity-80 rounded text-sm">
                  {zoom}%
                </div>
                <button
                  onClick={() => setZoom(Math.min(zoom + 10, 200))}
                  className="p-1 bg-white bg-opacity-80 rounded text-gray-700 hover:bg-opacity-100 transition-colors"
                >
                  +
                </button>
              </div>
              
              <Button
                size="sm"
                variant="outline"
                icon={<Maximize size={14} />}
                onClick={() => window.open(observation.data.image_url, '_blank')}
                className="!py-1 !px-2 bg-white bg-opacity-80"
              >
                Full Size
              </Button>
            </div>
            
            <div className="h-[400px] flex items-center justify-center overflow-auto">
              <img 
                src={observation.data.image_url} 
                alt={observation.type === 'petri' 
                  ? `Petri ${(observation.data as PetriObservation).petri_code}` 
                  : `Gasifier ${(observation.data as GasifierObservation).gasifier_code}`
                } 
                style={{ transform: `scale(${zoom / 100})`, transition: 'transform 0.2s ease-out' }}
                className="object-contain max-w-full max-h-full"
              />
            </div>
            
            {/* Image action buttons */}
            <div className="p-3 bg-white border-t border-gray-200 flex justify-between">
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Download size={14} />}
                  onClick={handleDownload}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Share2 size={14} />}
                  onClick={handleShare}
                >
                  Share
                </Button>
              </div>
              
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<PenLine size={14} />}
                  onClick={handleMarkUp}
                  disabled
                >
                  Mark Up
                </Button>
                
                {observation.type === 'petri' && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<SplitSquareVertical size={14} />}
                    onClick={handleSplitImage}
                    disabled
                  >
                    Split
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* Metadata column */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              {getObservationDetails()}
            </div>
            
            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium mb-2">Environmental Data</h3>
              
              <div className="space-y-2">
                {observation.data.outdoor_temperature && (
                  <div className="flex items-center">
                    <Thermometer className="text-error-500 mr-2" size={14} />
                    <span className="text-sm text-gray-600">Temperature:</span>
                    <span className="text-sm font-medium ml-auto">{observation.data.outdoor_temperature}°F</span>
                  </div>
                )}
                
                {observation.data.outdoor_humidity && (
                  <div className="flex items-center">
                    <Droplets className="text-secondary-500 mr-2" size={14} />
                    <span className="text-sm text-gray-600">Humidity:</span>
                    <span className="text-sm font-medium ml-auto">{observation.data.outdoor_humidity}%</span>
                  </div>
                )}
                
                <div className="pt-2 border-t border-gray-100 mt-2">
                  <span className="text-xs text-gray-500">
                    Last updated: {format(new Date(observation.data.updated_at), 'PPp')}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                icon={<MapPin size={14} />}
                onClick={() => {
                  onClose();
                  navigate(`/programs/${observation.data.program_id}/sites/${observation.data.site_id}/submissions/${observation.data.submission_id}/edit`);
                }}
                className="w-full"
              >
                View in Editor
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ImageLightbox;