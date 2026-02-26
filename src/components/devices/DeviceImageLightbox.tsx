import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share2, Maximize, ChevronLeft, ChevronRight, Thermometer, Droplets, Battery, Activity, TrendingUp, TrendingDown, Clock, AlertTriangle, Microscope, Loader2, Layers } from 'lucide-react';
import Modal from '../common/Modal';
import MgiOverlayBadge from '../common/MgiOverlayBadge';
import Button from '../common/Button';
import ImageTimelineControls from '../common/ImageTimelineControls';
import { useImageAutoPlay } from '../../hooks/useImageAutoPlay';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

interface DeviceImageData {
  image_id: string;
  image_url: string;
  captured_at: string;
  wake_number?: number;
  mgi_score?: number | null;
  mgi_velocity?: number | null;
  mgi_speed?: number | null;
  mgi_original_score?: number | null;
  mgi_qa_status?: string | null;
  colony_count?: number | null;
  colony_count_velocity?: number | null;
  annotated_image_url?: string | null;
  temperature?: number | null;
  humidity?: number | null;
  battery_voltage?: number | null;
  wifi_rssi?: number | null;
}

interface DeviceImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  images: DeviceImageData[];
  currentIndex: number;
  deviceInfo: {
    device_code: string;
    device_name?: string;
  };
  onNavigate?: (newIndex: number) => void;
  onImageUpdated?: (imageId: string) => void;
}

// Note: Temperature values in database are already in Fahrenheit
// No conversion needed - removed celsiusToFahrenheit function

// Helper function to get temperature color based on Fahrenheit value
const getTemperatureColor = (tempF: number): string => {
  if (tempF > 80) return '#ef4444'; // Hot red
  if (tempF >= 75) return '#f59e0b'; // Warm orange
  if (tempF >= 70) return '#6b7280'; // Neutral gray
  return '#3b82f6'; // Cool blue
};

// Helper function to get humidity color
const getHumidityColor = (humidity: number): string => {
  if (humidity > 70) return '#1e40af'; // Dark blue
  if (humidity >= 60) return '#3b82f6'; // Medium blue
  return '#60a5fa'; // Light blue
};

// Helper function to determine if conditions are extreme
const hasExtremeConditions = (tempF: number | null, humidity: number | null): boolean => {
  if (tempF === null || humidity === null) return false;
  return tempF > 80 && humidity > 70;
};

const DeviceImageLightbox = ({
  isOpen,
  onClose,
  images,
  currentIndex,
  deviceInfo,
  onNavigate,
  onImageUpdated
}: DeviceImageLightboxProps) => {
  const [zoom, setZoom] = useState(100);
  const [localIndex, setLocalIndex] = useState(currentIndex);
  const [imageOpacity, setImageOpacity] = useState(1);
  const [countingColonies, setCountingColonies] = useState(false);
  const [localColonyCounts, setLocalColonyCounts] = useState<Record<string, number>>({});
  const [showAnnotated, setShowAnnotated] = useState(false);
  const [localAnnotatedUrls, setLocalAnnotatedUrls] = useState<Record<string, string>>({});

  const hasMultipleImages = images.length > 1;

  const handleIndexChange = useCallback((newIndex: number) => {
    setLocalIndex(newIndex);
    onNavigate?.(newIndex);
    setZoom(100);
  }, [onNavigate]);

  const autoPlay = useImageAutoPlay({
    totalImages: images.length,
    currentIndex: localIndex,
    onIndexChange: handleIndexChange,
  });

  useEffect(() => {
    setLocalIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    if (autoPlay.isTransitioning) {
      setImageOpacity(0);
      const fadeIn = setTimeout(() => setImageOpacity(1), 50);
      return () => clearTimeout(fadeIn);
    }
  }, [autoPlay.isTransitioning, localIndex]);

  const currentImage = images[localIndex];

  const handlePrevious = () => {
    autoPlay.pause();
    const newIndex = Math.max(0, localIndex - 1);
    handleIndexChange(newIndex);
  };

  const handleNext = () => {
    autoPlay.pause();
    const newIndex = Math.min(images.length - 1, localIndex + 1);
    handleIndexChange(newIndex);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowLeft':
          handlePrevious();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case ' ':
          e.preventDefault();
          if (hasMultipleImages) autoPlay.togglePlayPause();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, localIndex, images.length, hasMultipleImages]);

  const handleDownload = async () => {
    if (!currentImage?.image_url) return;

    try {
      const response = await fetch(currentImage.image_url);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${deviceInfo.device_code}_${format(new Date(currentImage.captured_at), 'yyyyMMdd_HHmmss')}.jpg`;

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
    if (!currentImage?.image_url) return;

    navigator.clipboard.writeText(currentImage.image_url)
      .then(() => {
        toast.success('Image URL copied to clipboard');
      })
      .catch((error) => {
        console.error('Error copying to clipboard:', error);
        toast.error('Failed to copy URL to clipboard');
      });
  };

  const handleCountColonies = async () => {
    if (!currentImage?.image_url || !currentImage?.image_id) return;
    setCountingColonies(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/count_colonies`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_id: currentImage.image_id,
          image_url: currentImage.image_url,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Colony counting failed');
      }

      setLocalColonyCounts(prev => ({
        ...prev,
        [currentImage.image_id]: result.colony_count,
      }));

      if (result.annotated_image_url) {
        setLocalAnnotatedUrls(prev => ({
          ...prev,
          [currentImage.image_id]: result.annotated_image_url,
        }));
      }

      toast.success(`Colony count: ${result.colony_count}`);
      onImageUpdated?.(currentImage.image_id);
    } catch (error) {
      console.error('Colony counting error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to count colonies');
    } finally {
      setCountingColonies(false);
    }
  };

  if (!currentImage) {
    return null;
  }

  const displayColonyCount = localColonyCounts[currentImage.image_id] !== undefined
    ? localColonyCounts[currentImage.image_id]
    : currentImage.colony_count;

  const annotatedUrl = localAnnotatedUrls[currentImage.image_id] || currentImage.annotated_image_url;
  const hasAnnotatedImage = !!annotatedUrl;
  const displayImageUrl = showAnnotated && hasAnnotatedImage ? annotatedUrl! : currentImage.image_url;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center justify-between w-full">
          <div>
            <span className="font-semibold text-xl">
              {deviceInfo.device_name || deviceInfo.device_code}
            </span>
            <span className="text-sm text-gray-500 ml-3">
              Image {localIndex + 1} of {images.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
      }
      maxWidth="6xl"
    >
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Image column - takes 2/3 of the space on large screens */}
          <div className="lg:col-span-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden relative">
            {/* Zoom Controls */}
            <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-center bg-black bg-opacity-30 z-10">
              <div className="flex space-x-1">
                <button
                  onClick={() => setZoom(Math.max(zoom - 10, 50))}
                  className="p-1 bg-white bg-opacity-80 rounded text-gray-700 hover:bg-opacity-100 transition-colors"
                  disabled={zoom <= 50}
                >
                  -
                </button>
                <div className="px-2 py-1 bg-white bg-opacity-80 rounded text-sm">
                  {zoom}%
                </div>
                <button
                  onClick={() => setZoom(Math.min(zoom + 10, 200))}
                  className="p-1 bg-white bg-opacity-80 rounded text-gray-700 hover:bg-opacity-100 transition-colors"
                  disabled={zoom >= 200}
                >
                  +
                </button>
              </div>

              <div className="flex items-center gap-1">
                {hasAnnotatedImage && (
                  <button
                    onClick={() => setShowAnnotated(!showAnnotated)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      showAnnotated
                        ? 'bg-teal-600 text-white'
                        : 'bg-white bg-opacity-80 text-gray-700 hover:bg-opacity-100'
                    }`}
                  >
                    <Layers size={13} />
                    {showAnnotated ? 'Annotated' : 'Original'}
                  </button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Maximize size={14} />}
                  onClick={() => window.open(displayImageUrl, '_blank')}
                  className="!py-1 !px-2 bg-white bg-opacity-80"
                >
                  Full Size
                </Button>
              </div>
            </div>

            {/* Image Display */}
            <div className="h-[420px] flex items-center justify-center overflow-auto">
              <img
                src={displayImageUrl}
                alt={`${deviceInfo.device_code} - Image ${localIndex + 1}`}
                style={{
                  transform: `scale(${zoom / 100})`,
                  opacity: imageOpacity,
                  transition: `transform 0.2s ease-out, opacity ${autoPlay.transitionDuration}ms ease-in-out`,
                }}
                className="object-contain max-w-full max-h-full"
              />
            </div>

            {showAnnotated && hasAnnotatedImage && (
              <div className="absolute top-12 left-3 z-10 px-2 py-1 bg-teal-600 text-white text-xs font-bold rounded shadow">
                Annotated View
              </div>
            )}

            <MgiOverlayBadge mgiScore={currentImage.mgi_score} size="main" className="top-12" />

            {/* Navigation Arrows */}
            <div className="absolute inset-y-0 left-0 flex items-center p-2">
              <button
                onClick={handlePrevious}
                disabled={localIndex === 0}
                className={`p-2 bg-white bg-opacity-80 rounded-full shadow-lg transition-all ${
                  localIndex === 0
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-opacity-100 hover:scale-110'
                }`}
              >
                <ChevronLeft size={24} />
              </button>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center p-2">
              <button
                onClick={handleNext}
                disabled={localIndex === images.length - 1}
                className={`p-2 bg-white bg-opacity-80 rounded-full shadow-lg transition-all ${
                  localIndex === images.length - 1
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-opacity-100 hover:scale-110'
                }`}
              >
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Image action buttons */}
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
                <Button
                  size="sm"
                  variant="outline"
                  icon={countingColonies ? <Loader2 size={14} className="animate-spin" /> : <Microscope size={14} />}
                  onClick={handleCountColonies}
                  disabled={countingColonies}
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  {countingColonies ? 'Counting...' : 'Count Colonies'}
                </Button>
              </div>

              <div className="text-xs text-gray-400">
                {hasMultipleImages ? 'Space to play/pause, arrow keys to navigate' : 'Use arrow keys to navigate'}
              </div>
            </div>

            {/* Auto-play Timeline Controls */}
            {hasMultipleImages && (
              <ImageTimelineControls
                totalImages={images.length}
                currentIndex={localIndex}
                isPlaying={autoPlay.isPlaying}
                speedIndex={autoPlay.speedIndex}
                onSpeedChange={autoPlay.setSpeedIndex}
                onTogglePlayPause={autoPlay.togglePlayPause}
                onPrevious={autoPlay.previous}
                onNext={autoPlay.next}
                onSkipToStart={autoPlay.skipToStart}
                onSkipToEnd={autoPlay.skipToEnd}
                onSliderChange={autoPlay.stopAndNavigate}
                timestamps={images.map(img => img.captured_at)}
                className="mx-0 rounded-t-none border-t-0"
              />
            )}
          </div>

          {/* Metadata column */}
          <div className="lg:col-span-1 space-y-4">
            {/* Time & Wake Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium mb-3 text-gray-700">Capture Details</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    Time
                  </span>
                  <span className="font-medium">
                    {format(new Date(currentImage.captured_at), 'MMM dd, HH:mm:ss')}
                  </span>
                </div>
                {currentImage.wake_number && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Wake Number</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                      #{currentImage.wake_number}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Unified Conditions Snapshot - Multivariate Analysis */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-4">
              <h3 className="text-sm font-medium mb-3 text-gray-700 flex items-center justify-between">
                <span>Conditions Snapshot</span>
                {hasExtremeConditions(
                  currentImage.temperature,
                  currentImage.humidity
                ) && (
                  <span className="flex items-center text-xs text-red-600 font-semibold bg-red-100 px-2 py-1 rounded">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    HIGH RISK
                  </span>
                )}
              </h3>

              <div className="space-y-3">
                {/* MGI Score - Large and Prominent */}
                <div className="text-center py-3 bg-white bg-opacity-70 rounded">
                  <p className="text-3xl font-bold text-purple-600">
                    {currentImage.mgi_score != null
                      ? `${(currentImage.mgi_score * 100).toFixed(1)}%`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">MGI Score</p>
                  {currentImage.mgi_qa_status === 'pending_review' && (
                    <div className="mt-1.5 flex items-center justify-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 rounded-full">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Under QA Review
                      </span>
                    </div>
                  )}
                  {currentImage.mgi_original_score != null && currentImage.mgi_original_score !== currentImage.mgi_score && (
                    <p className="text-xs text-gray-400 mt-1 line-through">
                      Original: {(currentImage.mgi_original_score * 100).toFixed(1)}%
                    </p>
                  )}
                </div>

                {/* MGI Velocity with Trend */}
                <div className="flex items-center justify-between text-sm bg-white bg-opacity-70 rounded px-3 py-2">
                  <span className="flex items-center text-gray-600">
                    {currentImage.mgi_velocity != null && currentImage.mgi_velocity >= 0 ? (
                      <TrendingUp className="w-4 h-4 mr-2 text-red-500" />
                    ) : currentImage.mgi_velocity != null && currentImage.mgi_velocity < 0 ? (
                      <TrendingDown className="w-4 h-4 mr-2 text-green-500" />
                    ) : (
                      <Activity className="w-4 h-4 mr-2 text-gray-400" />
                    )}
                    MGI Velocity
                  </span>
                  <span
                    className="font-medium"
                    style={{
                      color: currentImage.mgi_velocity != null
                        ? (currentImage.mgi_velocity >= 0 ? '#dc2626' : '#10b981')
                        : '#9ca3af'
                    }}
                  >
                    {currentImage.mgi_velocity != null
                      ? `${currentImage.mgi_velocity >= 0 ? '+' : ''}${(currentImage.mgi_velocity * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                {/* Colony Count */}
                <div className="flex items-center justify-between text-sm bg-white bg-opacity-70 rounded px-3 py-2">
                  <span className="flex items-center text-gray-600">
                    <Microscope className="w-4 h-4 mr-2 text-blue-500" />
                    Colony Count
                  </span>
                  <div className="flex items-center gap-2">
                    {displayColonyCount != null ? (
                      <>
                        <span className="font-bold text-blue-800">
                          {displayColonyCount}
                        </span>
                        {currentImage.colony_count_velocity != null && currentImage.colony_count_velocity !== 0 && (
                          <span className={`text-xs font-medium ${currentImage.colony_count_velocity > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {currentImage.colony_count_velocity > 0 ? '+' : ''}{currentImage.colony_count_velocity}/session
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs italic">Not scored</span>
                    )}
                  </div>
                </div>

                {/* Temperature with Color Coding */}
                <div className="flex items-center justify-between text-sm bg-white bg-opacity-70 rounded px-3 py-2">
                  <span className="flex items-center text-gray-600">
                    <Thermometer className="w-4 h-4 mr-2" style={{
                      color: currentImage.temperature != null
                        ? getTemperatureColor(currentImage.temperature)
                        : '#9ca3af'
                    }} />
                    Temperature
                  </span>
                  <div className="flex items-center">
                    <span
                      className="font-medium"
                      style={{
                        color: currentImage.temperature != null
                          ? getTemperatureColor(currentImage.temperature)
                          : '#9ca3af'
                      }}
                    >
                      {currentImage.temperature != null
                        ? `${currentImage.temperature.toFixed(1)}°F`
                        : 'N/A'}
                    </span>
                    {currentImage.temperature != null && currentImage.temperature > 80 && (
                      <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                        HIGH
                      </span>
                    )}
                    {currentImage.temperature != null && currentImage.temperature >= 75 && currentImage.temperature <= 80 && (
                      <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">
                        MOD
                      </span>
                    )}
                  </div>
                </div>

                {/* Humidity with Color Coding */}
                <div className="flex items-center justify-between text-sm bg-white bg-opacity-70 rounded px-3 py-2">
                  <span className="flex items-center text-gray-600">
                    <Droplets className="w-4 h-4 mr-2" style={{
                      color: currentImage.humidity != null
                        ? getHumidityColor(currentImage.humidity)
                        : '#9ca3af'
                    }} />
                    Humidity
                  </span>
                  <div className="flex items-center">
                    <span
                      className="font-medium"
                      style={{
                        color: currentImage.humidity != null
                          ? getHumidityColor(currentImage.humidity)
                          : '#9ca3af'
                      }}
                    >
                      {currentImage.humidity != null
                        ? `${currentImage.humidity.toFixed(1)}%`
                        : 'N/A'}
                    </span>
                    {currentImage.humidity != null && currentImage.humidity > 70 && (
                      <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                        HIGH
                      </span>
                    )}
                    {currentImage.humidity != null && currentImage.humidity >= 60 && currentImage.humidity <= 70 && (
                      <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">
                        MOD
                      </span>
                    )}
                  </div>
                </div>

                {/* Battery - Separate small section */}
                {currentImage.battery_voltage != null && (
                  <div className="flex items-center justify-between text-xs bg-white bg-opacity-50 rounded px-3 py-1.5 mt-2 border-t border-purple-100">
                    <span className="flex items-center text-gray-500">
                      <Battery className="w-3 h-3 mr-1.5 text-green-500" />
                      Battery
                    </span>
                    <span className="font-medium text-gray-600">{currentImage.battery_voltage.toFixed(2)}V</span>
                  </div>
                )}
              </div>
            </div>

            {/* Device Info */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium mb-2 text-gray-700">Device</h3>
              <p className="text-sm font-medium text-gray-900">{deviceInfo.device_name || deviceInfo.device_code}</p>
              <p className="text-xs text-gray-500">{deviceInfo.device_code}</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DeviceImageLightbox;
