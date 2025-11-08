import { useState } from 'react';
import { Camera, Clock, AlertCircle, CheckCircle, Image as ImageIcon, Download } from 'lucide-react';
import { DeviceHistory } from '../../lib/types';
import ImageLightbox from '../submissions/ImageLightbox';

interface DeviceEventDetailsProps {
  event: DeviceHistory;
}

const DeviceEventDetails = ({ event }: DeviceEventDetailsProps) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string>('');

  const eventData = event.event_data || {};
  const metadata = event.metadata || {};

  const handleImageClick = (url: string) => {
    setLightboxImageUrl(url);
    setLightboxOpen(true);
  };

  // Check if this is an image-related event
  const hasImage = eventData.image_url || eventData.image_name;
  const imageUrl = eventData.image_url as string;
  const imageName = eventData.image_name as string;
  const imageSize = eventData.image_size as number;
  const totalChunks = eventData.total_chunks as number;
  const receivedChunks = eventData.received_chunks as number;
  const status = eventData.status as string;

  // Check if this has telemetry data
  const hasTelemetry = eventData.temperature !== undefined || eventData.humidity !== undefined;
  const temperature = eventData.temperature as number;
  const humidity = eventData.humidity as number;
  const pressure = eventData.pressure as number;
  const gasResistance = eventData.gas_resistance as number;

  return (
    <div className="space-y-4">
      {/* Image Information */}
      {hasImage && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-2 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center">
              <Camera className="mr-2" size={16} />
              Image Information
            </h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Image Name</span>
                  <p className="mt-1 text-sm text-gray-900 font-mono">{imageName}</p>
                </div>
                {imageSize && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Size</span>
                    <p className="mt-1 text-sm text-gray-900">{(imageSize / 1024).toFixed(2)} KB</p>
                  </div>
                )}
                {totalChunks && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chunks</span>
                    <p className="mt-1 text-sm text-gray-900">
                      {receivedChunks || 0}/{totalChunks}
                      {receivedChunks === totalChunks ? (
                        <CheckCircle className="inline ml-2 text-success-600" size={14} />
                      ) : (
                        <AlertCircle className="inline ml-2 text-warning-600" size={14} />
                      )}
                    </p>
                  </div>
                )}
                {status && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                    <p className="mt-1">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          status === 'complete'
                            ? 'bg-success-100 text-success-800'
                            : status === 'receiving'
                            ? 'bg-warning-100 text-warning-800'
                            : 'bg-error-100 text-error-800'
                        }`}
                      >
                        {status}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Image Thumbnail */}
              {imageUrl && status === 'complete' && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Preview</span>
                  <div className="relative group">
                    <img
                      src={imageUrl}
                      alt={imageName}
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200 cursor-pointer transition-transform group-hover:scale-105"
                      onClick={() => handleImageClick(imageUrl)}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity rounded-lg flex items-center justify-center">
                      <ImageIcon className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                    </div>
                  </div>
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center text-xs text-primary-600 hover:text-primary-700"
                  >
                    <Download size={12} className="mr-1" />
                    Download Full Resolution
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Data */}
      {hasTelemetry && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-green-50 to-teal-50 px-4 py-2 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center">
              <Clock className="mr-2" size={16} />
              Environmental Readings
            </h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {temperature !== undefined && (
                <div className="text-center p-3 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg border border-red-100">
                  <p className="text-2xl font-bold text-red-700">{temperature}°F</p>
                  <p className="text-xs text-gray-600 mt-1">Temperature</p>
                </div>
              )}
              {humidity !== undefined && (
                <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100">
                  <p className="text-2xl font-bold text-blue-700">{humidity}%</p>
                  <p className="text-xs text-gray-600 mt-1">Humidity</p>
                </div>
              )}
              {pressure !== undefined && (
                <div className="text-center p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                  <p className="text-2xl font-bold text-purple-700">{pressure}</p>
                  <p className="text-xs text-gray-600 mt-1">Pressure (hPa)</p>
                </div>
              )}
              {gasResistance !== undefined && (
                <div className="text-center p-3 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-100">
                  <p className="text-2xl font-bold text-yellow-700">{gasResistance}</p>
                  <p className="text-xs text-gray-600 mt-1">Gas (kΩ)</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Additional Event Data */}
      {eventData && Object.keys(eventData).length > 0 && !hasImage && !hasTelemetry && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Event Data</h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(eventData).map(([key, value]) => (
                <div key={key}>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{key.replace(/_/g, ' ')}</span>
                  <p className="mt-1 text-sm text-gray-900 font-mono break-all">
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Device Metadata */}
      {metadata && Object.keys(metadata).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Device State at Event Time</h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {metadata.device_code && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Device Code</span>
                  <p className="mt-1 text-sm text-gray-900 font-mono">{metadata.device_code}</p>
                </div>
              )}
              {metadata.firmware_version && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Firmware</span>
                  <p className="mt-1 text-sm text-gray-900">{metadata.firmware_version}</p>
                </div>
              )}
              {metadata.battery_health_percent !== undefined && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Battery Health</span>
                  <p className="mt-1 text-sm text-gray-900">{metadata.battery_health_percent}%</p>
                </div>
              )}
              {metadata.provisioning_status && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                  <p className="mt-1 text-sm text-gray-900 capitalize">{metadata.provisioning_status}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for images */}
      {lightboxOpen && (
        <ImageLightbox
          images={[{ url: lightboxImageUrl, observation_id: event.history_id, order_index: 0 }]}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default DeviceEventDetails;
