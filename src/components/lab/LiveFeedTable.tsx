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
                  {event.kind === 'payload' && event.meta?.overage_flag && (
                    <span className="text-amber-600">⚠ Overage</span>
                  )}
                  {event.kind === 'image' && event.meta?.received_chunks !== undefined && (
                    <span>{event.meta.received_chunks}/{event.meta.total_chunks} chunks</span>
                  )}
                  {event.kind === 'observation' && event.meta?.is_device_generated && (
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
