import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share2, Maximize, PenLine, SplitSquareVertical, MapPin, ChevronLeft, ChevronRight, Thermometer, Droplets } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ImageTimelineControls from '../common/ImageTimelineControls';
import { useImageAutoPlay } from '../../hooks/useImageAutoPlay';
import { PetriObservation, GasifierObservation } from '../../lib/types';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

interface ObservationWithType {
  type: 'petri' | 'gasifier';
  data: PetriObservation | GasifierObservation;
}

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  observation: ObservationWithType;
  observations?: ObservationWithType[];
  initialIndex?: number;
}

const ImageLightbox = ({ isOpen, onClose, observation, observations, initialIndex = 0 }: ImageLightboxProps) => {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(100);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageOpacity, setImageOpacity] = useState(1);

  const allObservations = observations && observations.length > 1 ? observations : null;
  const hasMultipleImages = !!allObservations;
  const activeObservation = allObservations ? allObservations[currentIndex] : observation;

  const handleIndexChange = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    setZoom(100);
  }, []);

  const autoPlay = useImageAutoPlay({
    totalImages: allObservations ? allObservations.length : 1,
    currentIndex,
    onIndexChange: handleIndexChange,
  });

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (autoPlay.isTransitioning) {
      setImageOpacity(0);
      const fadeIn = setTimeout(() => setImageOpacity(1), 50);
      return () => clearTimeout(fadeIn);
    }
  }, [autoPlay.isTransitioning, currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft' && hasMultipleImages) {
        autoPlay.pause();
        handleIndexChange(Math.max(0, currentIndex - 1));
      }
      if (e.key === 'ArrowRight' && hasMultipleImages) {
        autoPlay.pause();
        handleIndexChange(Math.min((allObservations?.length || 1) - 1, currentIndex + 1));
      }
      if (e.key === ' ' && hasMultipleImages) {
        e.preventDefault();
        autoPlay.togglePlayPause();
      }
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, hasMultipleImages, allObservations?.length]);

  const handleDownload = async () => {
    if (!activeObservation.data.image_url) return;

    try {
      const response = await fetch(activeObservation.data.image_url);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      const code = activeObservation.type === 'petri'
        ? (activeObservation.data as PetriObservation).petri_code
        : (activeObservation.data as GasifierObservation).gasifier_code;

      a.download = `${activeObservation.type}_${code}_${Date.now()}.jpg`;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Image downloaded successfully');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Failed to download image');
    }
  };

  const handleShare = () => {
    if (!activeObservation.data.image_url) return;

    navigator.clipboard.writeText(activeObservation.data.image_url)
      .then(() => {
        toast.success('Image URL copied to clipboard');
      })
      .catch((error) => {
        console.error('Error copying to clipboard:', error);
        toast.error('Failed to copy URL to clipboard');
      });
  };

  const handleMarkUp = () => {
    toast.info('Image markup feature is coming soon');
  };

  const handleSplitImage = () => {
    toast.info('Image splitting feature is coming soon');
  };

  const getObservationDetails = () => {
    if (activeObservation.type === 'petri') {
      const petri = activeObservation.data as PetriObservation;
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
      const gasifier = activeObservation.data as GasifierObservation;
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

  if (!activeObservation.data.image_url) {
    return null;
  }

  const observationLabel = activeObservation.type === 'petri' ? 'Petri' : 'Gasifier';
  const titleSuffix = hasMultipleImages
    ? ` (${currentIndex + 1} of ${allObservations!.length})`
    : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold text-xl">
            {observationLabel} Observation{titleSuffix}
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
                onClick={() => window.open(activeObservation.data.image_url, '_blank')}
                className="!py-1 !px-2 bg-white bg-opacity-80"
              >
                Full Size
              </Button>
            </div>

            <div className="h-[400px] flex items-center justify-center overflow-auto">
              <img
                src={activeObservation.data.image_url}
                alt={activeObservation.type === 'petri'
                  ? `Petri ${(activeObservation.data as PetriObservation).petri_code}`
                  : `Gasifier ${(activeObservation.data as GasifierObservation).gasifier_code}`
                }
                style={{
                  transform: `scale(${zoom / 100})`,
                  opacity: imageOpacity,
                  transition: `transform 0.2s ease-out, opacity ${autoPlay.transitionDuration}ms ease-in-out`,
                }}
                className="object-contain max-w-full max-h-full"
              />
            </div>

            {/* Navigation Arrows */}
            {hasMultipleImages && (
              <>
                <div className="absolute inset-y-0 left-0 flex items-center p-2">
                  <button
                    onClick={() => { autoPlay.pause(); handleIndexChange(Math.max(0, currentIndex - 1)); }}
                    disabled={currentIndex === 0}
                    className={`p-2 bg-white bg-opacity-80 rounded-full shadow-lg transition-all ${
                      currentIndex === 0
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-opacity-100 hover:scale-110'
                    }`}
                  >
                    <ChevronLeft size={24} />
                  </button>
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center p-2">
                  <button
                    onClick={() => { autoPlay.pause(); handleIndexChange(Math.min((allObservations?.length || 1) - 1, currentIndex + 1)); }}
                    disabled={currentIndex === (allObservations?.length || 1) - 1}
                    className={`p-2 bg-white bg-opacity-80 rounded-full shadow-lg transition-all ${
                      currentIndex === (allObservations?.length || 1) - 1
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-opacity-100 hover:scale-110'
                    }`}
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>
              </>
            )}

            <div className="p-3 bg-white border-t border-gray-200 flex justify-between items-center">
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

                {activeObservation.type === 'petri' && (
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

            {hasMultipleImages && (
              <ImageTimelineControls
                totalImages={allObservations!.length}
                currentIndex={currentIndex}
                isPlaying={autoPlay.isPlaying}
                speedIndex={autoPlay.speedIndex}
                onSpeedChange={autoPlay.setSpeedIndex}
                onTogglePlayPause={autoPlay.togglePlayPause}
                onPrevious={autoPlay.previous}
                onNext={autoPlay.next}
                onSkipToStart={autoPlay.skipToStart}
                onSkipToEnd={autoPlay.skipToEnd}
                onSliderChange={autoPlay.stopAndNavigate}
                timestamps={allObservations!.map(o => o.data.updated_at)}
                className="mx-0 rounded-t-none border-t-0"
              />
            )}
          </div>

          <div className="md:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              {getObservationDetails()}
            </div>

            <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium mb-2">Environmental Data</h3>

              <div className="space-y-2">
                {activeObservation.data.outdoor_temperature && (
                  <div className="flex items-center">
                    <Thermometer className="text-error-500 mr-2" size={14} />
                    <span className="text-sm text-gray-600">Temperature:</span>
                    <span className="text-sm font-medium ml-auto">{activeObservation.data.outdoor_temperature}°F</span>
                  </div>
                )}

                {activeObservation.data.outdoor_humidity && (
                  <div className="flex items-center">
                    <Droplets className="text-secondary-500 mr-2" size={14} />
                    <span className="text-sm text-gray-600">Humidity:</span>
                    <span className="text-sm font-medium ml-auto">{activeObservation.data.outdoor_humidity}%</span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-100 mt-2">
                  <span className="text-xs text-gray-500">
                    Last updated: {format(new Date(activeObservation.data.updated_at), 'PPp')}
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
                  navigate(`/programs/${activeObservation.data.program_id}/sites/${activeObservation.data.site_id}/submissions/${activeObservation.data.submission_id}/edit`);
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
