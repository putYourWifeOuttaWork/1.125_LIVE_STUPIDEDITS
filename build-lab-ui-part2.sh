#!/bin/bash
set -e

# 3. ImageDrawer.tsx
cat > src/components/lab/ImageDrawer.tsx << 'EOFCOMP'
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatInSiteTz } from '../../lib/timezone';
import { X } from 'lucide-react';

interface ImageData {
  image_id: string;
  device_name: string;
  device_mac: string;
  image_name: string;
  captured_at: string;
  received_at: string;
  total_chunks: number;
  received_chunks: number;
  image_status: string;
  image_url: string;
  retry_count: number;
  resent_received_at: string | null;
  observation_id: string | null;
  submission_id: string | null;
}

interface ImageDrawerProps {
  imageId: string;
  timezone: string;
  onClose: () => void;
}

export function ImageDrawer({ imageId, timezone, onClose }: ImageDrawerProps) {
  const [image, setImage] = useState<ImageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchImage = async () => {
      const { data, error } = await supabase
        .from('vw_images_observations')
        .select('*')
        .eq('image_id', imageId)
        .single();

      if (error) {
        console.error('Error fetching image:', error);
      } else {
        setImage(data as ImageData);
      }
      setLoading(false);
    };

    fetchImage();
  }, [imageId]);

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl p-6">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!image) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Image Details</h3>
            <p className="text-sm text-gray-500">{image.image_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Image Preview */}
        {image.image_url && (
          <div className="mb-6">
            <img
              src={image.image_url}
              alt={image.image_name}
              className="w-full rounded-lg border border-gray-200"
            />
          </div>
        )}

        {/* Device Info */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Device</h4>
          <div className="text-sm">
            <p className="text-gray-900 font-medium">{image.device_name}</p>
            <p className="text-gray-500">{image.device_mac}</p>
          </div>
        </div>

        {/* Timing */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Timing</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Captured:</span>
              <span className="text-gray-900">
                {formatInSiteTz(image.captured_at, timezone, 'MMM d, HH:mm:ss')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Received:</span>
              <span className="text-gray-900">
                {formatInSiteTz(image.received_at, timezone, 'MMM d, HH:mm:ss')}
              </span>
            </div>
            {image.resent_received_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">Resent:</span>
                <span className="text-amber-600">
                  {formatInSiteTz(image.resent_received_at, timezone, 'MMM d, HH:mm:ss')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Chunks */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Transmission</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Chunks:</span>
              <span className="text-gray-900">{image.received_chunks}/{image.total_chunks}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(image.received_chunks / image.total_chunks) * 100}%` }}
              />
            </div>
            {image.retry_count > 0 && (
              <p className="text-xs text-amber-600">Retried {image.retry_count} time(s)</p>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Status</h4>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            image.image_status === 'complete' ? 'bg-green-100 text-green-800' :
            image.image_status === 'failed' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {image.image_status}
          </span>
        </div>

        {/* Observation Link */}
        {image.observation_id && (
          <div className="pt-6 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Observation</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-900">Linked to submission</span>
              <a
                href={`/submissions/${image.submission_id}`}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                View →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
EOFCOMP

echo "✅ ImageDrawer.tsx"

# 4. LiveFeedTable.tsx
cat > src/components/lab/LiveFeedTable.tsx << 'EOFCOMP'
import { useState } from 'react';
import { formatInSiteTz, getRelativeTime } from '../../lib/timezone';

interface FeedEvent {
  kind: 'payload' | 'image' | 'observation';
  id: string;
  device_id: string | null;
  device_name: string;
  device_mac: string;
  site_id: string;
  ts: string;
  meta: Record<string, any>;
}

interface LiveFeedTableProps {
  events: FeedEvent[];
  timezone: string;
}

export function LiveFeedTable({ events, timezone }: LiveFeedTableProps) {
  const [filterKind, setFilterKind] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);

  const filtered = filterKind === 'all'
    ? events
    : events.filter(e => e.kind === filterKind);

  const getKindBadge = (kind: string) => {
    const badges = {
      payload: <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">Payload</span>,
      image: <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">Image</span>,
      observation: <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">Observation</span>,
    };
    return badges[kind as keyof typeof badges];
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Controls */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter:</label>
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">All Events</option>
            <option value="payload">Payloads Only</option>
            <option value="image">Images Only</option>
            <option value="observation">Observations Only</option>
          </select>
        </div>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`px-3 py-1.5 rounded text-sm font-medium ${
            isPaused
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
          }`}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kind</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((event) => (
              <tr key={event.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{getKindBadge(event.kind)}</td>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{event.device_name || 'N/A'}</div>
                  <div className="text-xs text-gray-500">{event.device_mac || ''}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">
                    {formatInSiteTz(event.ts, timezone, 'HH:mm:ss')}
                  </div>
                  <div className="text-xs text-gray-500">{getRelativeTime(event.ts)}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {event.kind === 'payload' && event.meta.overage_flag && (
                    <span className="text-amber-600">⚠ Overage</span>
                  )}
                  {event.kind === 'image' && (
                    <span>{event.meta.received_chunks}/{event.meta.total_chunks} chunks</span>
                  )}
                  {event.kind === 'observation' && event.meta.is_device_generated && (
                    <span className="text-green-600">✓ Device-generated</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          No events found
        </div>
      )}
    </div>
  );
}
EOFCOMP

echo "✅ LiveFeedTable.tsx"

