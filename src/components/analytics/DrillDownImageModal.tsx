import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Loader2, Camera, MapPin, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { DrillDownRecord } from '../../types/analytics';
import { formatMGI, getMGIColor } from '../../utils/mgiUtils';
import Modal from '../common/Modal';
import MgiOverlayBadge from '../common/MgiOverlayBadge';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import ImageTimelineControls from '../common/ImageTimelineControls';
import { useImageAutoPlay } from '../../hooks/useImageAutoPlay';

interface DrillDownImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: DrillDownRecord[];
  initialIndex?: number;
}

export default function DrillDownImageModal({
  isOpen,
  onClose,
  records,
  initialIndex = 0,
}: DrillDownImageModalProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageOpacity, setImageOpacity] = useState(1);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  const hasMultipleImages = records.length > 1;

  const handleIndexChange = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
  }, []);

  const autoPlay = useImageAutoPlay({
    totalImages: records.length,
    currentIndex,
    onIndexChange: handleIndexChange,
  });

  const currentRecord = records[currentIndex];
  const hasNext = currentIndex < records.length - 1;
  const hasPrev = currentIndex > 0;

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setImageLoading(true);
  }, [currentIndex]);

  useEffect(() => {
    if (autoPlay.isTransitioning) {
      setImageOpacity(0);
      const fadeIn = setTimeout(() => setImageOpacity(1), 50);
      return () => clearTimeout(fadeIn);
    }
  }, [autoPlay.isTransitioning, currentIndex]);

  useEffect(() => {
    const container = thumbnailContainerRef.current;
    if (!container) return;
    const activeThumb = container.querySelector(`[data-index="${currentIndex}"]`) as HTMLElement | null;
    if (!activeThumb) return;
    const thumbLeft = activeThumb.offsetLeft;
    const thumbWidth = activeThumb.offsetWidth;
    const containerWidth = container.offsetWidth;
    const targetScroll = thumbLeft - containerWidth / 2 + thumbWidth / 2;
    container.scrollTo({ left: targetScroll, behavior: 'smooth' });
  }, [currentIndex]);

  const handleNext = () => {
    autoPlay.pause();
    if (hasNext) setCurrentIndex(currentIndex + 1);
  };

  const handlePrev = () => {
    autoPlay.pause();
    if (hasPrev) setCurrentIndex(currentIndex - 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === ' ' && hasMultipleImages) {
        e.preventDefault();
        autoPlay.togglePlayPause();
      }
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, records.length, hasMultipleImages]);

  const handleViewSession = () => {
    if (currentRecord?.session_id && currentRecord?.program_id && currentRecord?.site_id) {
      navigate(`/programs/${currentRecord.program_id}/sites/${currentRecord.site_id}/sessions/${currentRecord.session_id}`);
      onClose();
    }
  };

  if (!currentRecord) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="5xl">
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {currentRecord.device_code} - {format(new Date(currentRecord.captured_at), 'MMM d, HH:mm')}
              </h3>
              <p className="text-sm text-gray-500">
                Image {currentIndex + 1} of {records.length}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Thumbnail Strip - above main image */}
        {records.length > 1 && (
          <div className="px-6 py-2 bg-white border-b border-gray-200">
            <div ref={thumbnailContainerRef} className="flex gap-2 overflow-x-auto pb-1">
              {records.map((record, index) => (
                <button
                  key={record.image_id}
                  data-index={index}
                  onClick={() => autoPlay.stopAndNavigate(index)}
                  className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    index === currentIndex
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {record.image_url ? (
                    <img
                      src={record.image_url}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <span className="text-xs text-gray-400">N/A</span>
                    </div>
                  )}
                  <MgiOverlayBadge mgiScore={record.mgi_score} size="thumb" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image Viewer */}
        <div className="relative bg-gray-900" style={{ height: '480px' }}>
          {currentRecord.image_url ? (
            <>
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
              <img
                src={currentRecord.image_url}
                alt={`${currentRecord.device_code} - ${format(new Date(currentRecord.captured_at), 'MMM d, yyyy HH:mm')}`}
                className="w-full h-full object-contain"
                style={{
                  opacity: imageOpacity,
                  transition: `opacity ${autoPlay.transitionDuration}ms ease-in-out`,
                }}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No image available</p>
              </div>
            </div>
          )}

          <MgiOverlayBadge mgiScore={currentRecord.mgi_score} size="main" />

          {/* Navigation Arrows */}
          {hasPrev && (
            <button
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* Auto-play Timeline Controls */}
        {hasMultipleImages && (
          <ImageTimelineControls
            totalImages={records.length}
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
            timestamps={records.map(r => r.captured_at)}
            className="rounded-none border-x-0"
          />
        )}

        {/* Metadata Cards */}
        <div className="p-6 space-y-4 bg-gray-50">
          {/* Capture Details Card */}
          <Card>
            <CardHeader>
              <h4 className="text-sm font-medium text-gray-700">Capture Details</h4>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <Activity className="w-3 h-3" />
                    <span>Captured</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {format(new Date(currentRecord.captured_at), 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-gray-600">
                    {format(new Date(currentRecord.captured_at), 'HH:mm:ss')}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <Activity className="w-3 h-3" />
                    <span>MGI Score</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {currentRecord.mgi_score !== null ? (
                      <span style={{ color: getMGIColor(currentRecord.mgi_score) }}>
                        {formatMGI(currentRecord.mgi_score)}
                      </span>
                    ) : (
                      'N/A'
                    )}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <Activity className="w-3 h-3" />
                    <span>Temperature</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {currentRecord.temperature !== null
                      ? `${currentRecord.temperature.toFixed(1)}°F`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <Activity className="w-3 h-3" />
                    <span>Humidity</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {currentRecord.humidity !== null
                      ? `${currentRecord.humidity.toFixed(1)}%`
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Card */}
          <Card>
            <CardHeader>
              <h4 className="text-sm font-medium text-gray-700">Location</h4>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <MapPin className="w-3 h-3" />
                    <span>Site</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {currentRecord.site_name}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <Activity className="w-3 h-3" />
                    <span>Program</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {currentRecord.program_name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Session Link */}
          {currentRecord.session_id && (
            <div className="flex justify-end">
              <Button
                onClick={handleViewSession}
                variant="outline"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View Session Details
              </Button>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
