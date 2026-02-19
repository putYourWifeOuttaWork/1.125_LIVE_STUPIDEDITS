import { useState, useMemo } from 'react';
import { Camera, AlertCircle, CheckCircle, Clock, RefreshCw, Download, XCircle, AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow, subDays, isAfter, isBefore, startOfDay, endOfDay, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import Button from '../common/Button';
import Card, { CardHeader, CardContent } from '../common/Card';
import LoadingScreen from '../common/LoadingScreen';
import { useDeviceImages } from '../../hooks/useDevice';
import DateRangePicker from '../common/DateRangePicker';
import DownloadAllImagesButton from '../common/DownloadAllImagesButton';

interface DeviceImagesPanelProps {
  deviceId: string;
}

const DeviceImagesPanel = ({ deviceId }: DeviceImagesPanelProps) => {
  const { images, isLoading, retryFailedImages, retryImage, clearStaleImages, isClearingStale } = useDeviceImages(deviceId);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState(() => subDays(new Date(), 30).toISOString().split('T')[0]);
  const [filterEndDate, setFilterEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const handleRetryAll = async () => {
    setRetrying(true);
    try {
      await retryFailedImages();
      toast.success('Retry commands queued for all failed images');
    } catch (error) {
      toast.error('Failed to queue retry commands');
    } finally {
      setRetrying(false);
    }
  };

  const handleRetrySingle = async (imageId: string, imageName: string) => {
    try {
      await retryImage(imageId, imageName);
      toast.success(`Retry queued for ${imageName}`);
    } catch (error) {
      toast.error('Failed to queue retry command');
    }
  };

  const handleClearStale = async () => {
    if (window.confirm('Clear all images stuck in receiving/pending status for more than 1 hour?')) {
      try {
        await clearStaleImages(1); // 1 hour threshold
      } catch (error) {
        // Error handled by mutation
      }
    }
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  const failedImages = images.filter(img => img.status === 'failed' && img.can_retry);
  const pendingImages = images.filter(img => img.status === 'pending' || img.status === 'receiving');
  const completeImages = images.filter(img => img.status === 'complete');

  const filteredCompleteImages = useMemo(() => {
    const rangeStart = startOfDay(parseISO(filterStartDate));
    const rangeEnd = endOfDay(parseISO(filterEndDate));
    return completeImages.filter(img => {
      const captured = new Date(img.captured_at || img.received_at);
      return !isBefore(captured, rangeStart) && !isAfter(captured, rangeEnd);
    });
  }, [completeImages, filterStartDate, filterEndDate]);

  const downloadableImages = useMemo(() =>
    filteredCompleteImages
      .filter(img => img.image_url)
      .map(img => ({
        url: img.image_url,
        filename: `${img.image_name || img.image_id}.jpg`,
      })),
    [filteredCompleteImages]
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="text-success-500" size={20} />;
      case 'failed':
        return <XCircle className="text-error-500" size={20} />;
      case 'receiving':
        return <Clock className="text-warning-500" size={20} />;
      case 'pending':
        return <Clock className="text-gray-400" size={20} />;
      default:
        return <Camera className="text-gray-400" size={20} />;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      complete: 'bg-success-100 text-success-800',
      failed: 'bg-error-100 text-error-800',
      receiving: 'bg-warning-100 text-warning-800',
      pending: 'bg-gray-100 text-gray-800'
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  const calculateProgress = (received: number, total: number) => {
    if (!total) return 0;
    return Math.round((received / total) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Images</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{images.length}</p>
              </div>
              <Camera className="text-gray-300" size={32} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Complete</p>
                <p className="text-2xl font-bold text-success-600 mt-1">{completeImages.length}</p>
              </div>
              <CheckCircle className="text-success-300" size={32} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-warning-600 mt-1">{pendingImages.length}</p>
              </div>
              <Clock className="text-warning-300" size={32} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-error-600 mt-1">{failedImages.length}</p>
              </div>
              <XCircle className="text-error-300" size={32} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failed Images Section */}
      {failedImages.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-error-500" size={20} />
                <h3 className="text-lg font-semibold text-error-800">Failed Images</h3>
                <span className="text-sm text-error-600">({failedImages.length})</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw size={14} />}
                onClick={handleRetryAll}
                isLoading={retrying}
                className="border-error-300 text-error-700 hover:bg-error-50"
              >
                Retry All Failed
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {failedImages.map((image) => (
                <div
                  key={image.image_id}
                  className="border border-error-200 rounded-lg p-4 bg-error-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <XCircle className="text-error-600 flex-shrink-0" size={20} />
                        <div>
                          <p className="font-medium text-error-900">{image.image_name}</p>
                          <p className="text-xs text-error-700 mt-1">
                            Failed {formatDistanceToNow(new Date(image.failed_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                        <div>
                          <p className="text-error-600">Chunks Received</p>
                          <p className="font-medium text-error-900">{image.received_chunks}/{image.total_chunks}</p>
                        </div>
                        <div>
                          <p className="text-error-600">Retry Count</p>
                          <p className="font-medium text-error-900">{image.retry_count}/{image.max_retries}</p>
                        </div>
                        <div>
                          <p className="text-error-600">Error Code</p>
                          <p className="font-medium text-error-900 font-mono">{image.error_code}</p>
                        </div>
                        <div>
                          <p className="text-error-600">Captured</p>
                          <p className="font-medium text-error-900">
                            {format(new Date(image.captured_at), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>

                      {image.timeout_reason && (
                        <div className="mt-3 bg-error-100 border border-error-200 rounded p-2">
                          <p className="text-xs font-medium text-error-800">Timeout Reason:</p>
                          <p className="text-xs text-error-700 mt-1">{image.timeout_reason}</p>
                        </div>
                      )}

                      {image.error_message && (
                        <div className="mt-2 bg-error-100 border border-error-200 rounded p-2">
                          <p className="text-xs font-medium text-error-800">{image.error_category || 'Error'}:</p>
                          <p className="text-xs text-error-700 mt-1">{image.error_message}</p>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={<RefreshCw size={14} />}
                      onClick={() => handleRetrySingle(image.image_id, image.image_name)}
                      className="ml-4 border-error-400 text-error-700 hover:bg-error-100"
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* In Progress Images */}
      {pendingImages.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="text-warning-500" size={20} />
                <h3 className="text-lg font-semibold">In Progress</h3>
                <span className="text-sm text-gray-600">({pendingImages.length})</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<XCircle size={14} />}
                onClick={handleClearStale}
                isLoading={isClearingStale}
                className="border-warning-300 text-warning-700 hover:bg-warning-50"
              >
                Clear Stale Images
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingImages.map((image) => (
                <div
                  key={image.image_id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(image.status)}
                      <div>
                        <p className="font-medium text-gray-900">{image.image_name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Started {formatDistanceToNow(new Date(image.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(image.status)}`}>
                      {image.status}
                    </span>
                  </div>

                  {image.total_chunks > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">
                          Chunks: {image.received_chunks}/{image.total_chunks}
                        </span>
                        <span className="font-medium text-gray-900">
                          {calculateProgress(image.received_chunks, image.total_chunks)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${calculateProgress(image.received_chunks, image.total_chunks)}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Images */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-success-500" size={20} />
                <h3 className="text-lg font-semibold">Completed Images</h3>
                <span className="text-sm text-gray-600">
                  ({filteredCompleteImages.length}{filteredCompleteImages.length !== completeImages.length ? ` of ${completeImages.length}` : ''})
                </span>
              </div>
              <DownloadAllImagesButton
                images={downloadableImages}
                zipFilename={`device_images_${filterStartDate}_to_${filterEndDate}.zip`}
                variant="compact"
              />
            </div>
            <DateRangePicker
              startDate={filterStartDate}
              endDate={filterEndDate}
              onDateRangeChange={(start, end) => {
                setFilterStartDate(start);
                setFilterEndDate(end);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredCompleteImages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Camera className="mx-auto h-12 w-12 text-gray-300 mb-2" />
              <p>{completeImages.length === 0 ? 'No completed images yet' : 'No images in selected date range'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCompleteImages.map((image) => (
                <div
                  key={image.image_id}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedImage(image)}
                >
                  {image.image_url ? (
                    <img
                      src={image.image_url}
                      alt={image.image_name}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                      <Camera className="text-gray-300" size={48} />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-gray-900 truncate">{image.image_name}</p>
                      {image.mgi_score != null && (
                        <span
                          className={`flex-shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${
                            image.mgi_qa_status === 'pending_review' ? 'ring-1 ring-amber-400' : ''
                          }`}
                          style={{
                            backgroundColor:
                              image.mgi_score >= 0.7 ? '#dc2626' :
                              image.mgi_score >= 0.4 ? '#f59e0b' :
                              '#10b981'
                          }}
                        >
                          {(image.mgi_score * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(image.received_at), 'MMM d, yyyy HH:mm')}
                    </p>
                    {image.mgi_qa_status === 'pending_review' && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded">
                        QA Review Pending
                      </span>
                    )}
                    {(image.temperature != null || image.humidity != null) && (
                      <div className="mt-2 flex gap-3 text-xs text-gray-600">
                        {image.temperature != null && <span>{image.temperature.toFixed(1)}°F</span>}
                        {image.humidity != null && <span>{image.humidity.toFixed(1)}%</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Detail Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedImage.image_name}</h3>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle size={24} />
                </button>
              </div>

              {selectedImage.image_url && (
                <img
                  src={selectedImage.image_url}
                  alt={selectedImage.image_name}
                  className="w-full rounded-lg mb-4"
                />
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Captured</p>
                  <p className="font-medium">{format(new Date(selectedImage.captured_at), 'MMM d, yyyy HH:mm:ss')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Received</p>
                  <p className="font-medium">{format(new Date(selectedImage.received_at), 'MMM d, yyyy HH:mm:ss')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Size</p>
                  <p className="font-medium">{(selectedImage.image_size / 1024).toFixed(2)} KB</p>
                </div>
                <div>
                  <p className="text-gray-500">Chunks</p>
                  <p className="font-medium">{selectedImage.total_chunks}</p>
                </div>
              </div>

              {(selectedImage.temperature != null || selectedImage.humidity != null || selectedImage.pressure != null || selectedImage.gas_resistance != null) && (
                <div className="mt-4 bg-gray-50 rounded p-4">
                  <p className="font-medium text-sm text-gray-700 mb-2">Environmental Data</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {selectedImage.temperature != null && (
                      <div>
                        <p className="text-gray-500">Temperature</p>
                        <p className="font-medium">{selectedImage.temperature.toFixed(1)}°F</p>
                      </div>
                    )}
                    {selectedImage.humidity != null && (
                      <div>
                        <p className="text-gray-500">Humidity</p>
                        <p className="font-medium">{selectedImage.humidity.toFixed(1)}%</p>
                      </div>
                    )}
                    {selectedImage.pressure != null && (
                      <div>
                        <p className="text-gray-500">Pressure</p>
                        <p className="font-medium">{selectedImage.pressure.toFixed(1)} hPa</p>
                      </div>
                    )}
                    {selectedImage.gas_resistance != null && (
                      <div>
                        <p className="text-gray-500">Gas Resistance</p>
                        <p className="font-medium">{selectedImage.gas_resistance.toFixed(2)} Ω</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceImagesPanel;
