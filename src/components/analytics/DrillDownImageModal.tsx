import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { DrillDownRecord } from '../../types/analytics';
import Modal from '../common/Modal';

interface DrillDownImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: DrillDownRecord[];
  initialIndex?: number;
  deviceCode?: string;
}

export default function DrillDownImageModal({
  isOpen,
  onClose,
  records,
  initialIndex = 0,
  deviceCode,
}: DrillDownImageModalProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageLoading, setImageLoading] = useState(true);

  const currentRecord = records[currentIndex];
  const hasNext = currentIndex < records.length - 1;
  const hasPrev = currentIndex > 0;

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setImageLoading(true);
  }, [currentIndex]);

  const handleNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (hasPrev) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, records.length]);

  const handleViewSession = () => {
    if (currentRecord?.session_id) {
      navigate(`/sessions/${currentRecord.session_id}`);
      onClose();
    }
  };

  if (!currentRecord) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="4xl">
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {deviceCode || currentRecord.device_code}
            </h3>
            <p className="text-sm text-gray-500">
              Image {currentIndex + 1} of {records.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Image Viewer */}
        <div className="relative bg-gray-900" style={{ height: '500px' }}>
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
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-400">
                <p>No image available</p>
              </div>
            </div>
          )}

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

        {/* Metadata */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Captured</p>
              <p className="text-sm font-medium text-gray-900">
                {format(new Date(currentRecord.captured_at), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-gray-600">
                {format(new Date(currentRecord.captured_at), 'HH:mm:ss')}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">MGI Score</p>
              <p className="text-sm font-medium text-gray-900">
                {currentRecord.mgi_score !== null
                  ? currentRecord.mgi_score.toFixed(2)
                  : 'N/A'}
              </p>
              {currentRecord.detection_count !== null && (
                <p className="text-xs text-gray-600">
                  {currentRecord.detection_count} detections
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Temperature</p>
              <p className="text-sm font-medium text-gray-900">
                {currentRecord.temperature !== null
                  ? `${currentRecord.temperature.toFixed(1)}°C`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Humidity</p>
              <p className="text-sm font-medium text-gray-900">
                {currentRecord.humidity !== null
                  ? `${currentRecord.humidity.toFixed(1)}%`
                  : 'N/A'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Site</p>
              <p className="text-sm font-medium text-gray-900">
                {currentRecord.site_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Program</p>
              <p className="text-sm font-medium text-gray-900">
                {currentRecord.program_name}
              </p>
            </div>
          </div>

          {currentRecord.session_id && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={handleViewSession}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View Full Session Details
              </button>
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {records.length > 1 && (
          <div className="px-6 py-3 bg-white border-t border-gray-200">
            <div className="flex gap-2 overflow-x-auto">
              {records.map((record, index) => (
                <button
                  key={record.image_id}
                  onClick={() => setCurrentIndex(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
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
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
