import { useState, useEffect } from 'react';
import { X, Download, Share2, Maximize, ChevronLeft, ChevronRight, Thermometer, Droplets, Battery, Activity, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

interface DeviceImageData {
  image_id: string;
  image_url: string;
  captured_at: string;
  wake_number?: number;
  mgi_score?: number | null;
  mold_growth_velocity?: number | null;
  mold_growth_speed?: number | null;
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
}

const DeviceImageLightbox = ({
  isOpen,
  onClose,
  images,
  currentIndex,
  deviceInfo,
  onNavigate
}: DeviceImageLightboxProps) => {
  const [zoom, setZoom] = useState(100);
  const [localIndex, setLocalIndex] = useState(currentIndex);

  // Sync localIndex when currentIndex changes from parent
  useEffect(() => {
    setLocalIndex(currentIndex);
  }, [currentIndex]);

  const currentImage = images[localIndex];

  const handlePrevious = () => {
    const newIndex = Math.max(0, localIndex - 1);
    setLocalIndex(newIndex);
    onNavigate?.(newIndex);
    setZoom(100); // Reset zoom when changing images
  };

  const handleNext = () => {
    const newIndex = Math.min(images.length - 1, localIndex + 1);
    setLocalIndex(newIndex);
    onNavigate?.(newIndex);
    setZoom(100); // Reset zoom when changing images
  };

  // Keyboard navigation
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
        case 'Escape':
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, localIndex, images.length]);

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

  if (!currentImage) {
    return null;
  }

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

              <Button
                size="sm"
                variant="outline"
                icon={<Maximize size={14} />}
                onClick={() => window.open(currentImage.image_url, '_blank')}
                className="!py-1 !px-2 bg-white bg-opacity-80"
              >
                Full Size
              </Button>
            </div>

            {/* Image Display */}
            <div className="h-[500px] flex items-center justify-center overflow-auto">
              <img
                src={currentImage.image_url}
                alt={`${deviceInfo.device_code} - Image ${localIndex + 1}`}
                style={{ transform: `scale(${zoom / 100})`, transition: 'transform 0.2s ease-out' }}
                className="object-contain max-w-full max-h-full"
              />
            </div>

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

              <div className="text-sm text-gray-500">
                Use ← → arrow keys to navigate
              </div>
            </div>
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

            {/* MGI Metrics */}
            {(currentImage.mgi_score != null || currentImage.mold_growth_velocity != null || currentImage.mold_growth_speed != null) && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-4">
                <h3 className="text-sm font-medium mb-3 text-gray-700">MGI Metrics</h3>
                <div className="space-y-3">
                  {currentImage.mgi_score != null && (
                    <div className="text-center py-3 bg-white bg-opacity-60 rounded">
                      <p className="text-3xl font-bold text-purple-600">
                        {(currentImage.mgi_score * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-600 mt-1">MGI Score</p>
                    </div>
                  )}

                  {currentImage.mold_growth_velocity != null && (
                    <div className="flex items-center justify-between text-sm bg-white bg-opacity-60 rounded px-3 py-2">
                      <span className="flex items-center text-gray-600">
                        {currentImage.mold_growth_velocity >= 0 ? (
                          <TrendingUp className="w-4 h-4 mr-2 text-red-500" />
                        ) : (
                          <TrendingDown className="w-4 h-4 mr-2 text-green-500" />
                        )}
                        Velocity
                      </span>
                      <span
                        className="font-medium"
                        style={{
                          color: currentImage.mold_growth_velocity >= 0 ? '#dc2626' : '#10b981'
                        }}
                      >
                        {currentImage.mold_growth_velocity >= 0 ? '+' : ''}
                        {(currentImage.mold_growth_velocity * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {currentImage.mold_growth_speed != null && (
                    <div className="flex items-center justify-between text-sm bg-white bg-opacity-60 rounded px-3 py-2">
                      <span className="flex items-center text-gray-600">
                        <Activity className="w-4 h-4 mr-2 text-blue-500" />
                        Speed
                      </span>
                      <span className="font-medium text-gray-700">
                        {currentImage.mold_growth_speed >= 0 ? '+' : ''}
                        {(currentImage.mold_growth_speed * 100).toFixed(2)}%/day
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Environmental Data */}
            {(currentImage.temperature != null || currentImage.humidity != null || currentImage.battery_voltage != null) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium mb-3 text-gray-700">Environmental Data</h3>
                <div className="space-y-2">
                  {currentImage.temperature != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-gray-600">
                        <Thermometer className="w-4 h-4 mr-2 text-orange-500" />
                        Temperature
                      </span>
                      <span className="font-medium">{currentImage.temperature.toFixed(1)}°F</span>
                    </div>
                  )}

                  {currentImage.humidity != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-gray-600">
                        <Droplets className="w-4 h-4 mr-2 text-blue-500" />
                        Humidity
                      </span>
                      <span className="font-medium">{currentImage.humidity.toFixed(1)}%</span>
                    </div>
                  )}

                  {currentImage.battery_voltage != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-gray-600">
                        <Battery className="w-4 h-4 mr-2 text-green-500" />
                        Battery
                      </span>
                      <span className="font-medium">{currentImage.battery_voltage.toFixed(2)}V</span>
                    </div>
                  )}
                </div>
              </div>
            )}

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
