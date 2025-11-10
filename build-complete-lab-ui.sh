#!/bin/bash
set -e

echo "🏗️ Building Complete Lab UI (Remaining 70%)..."

# Ensure directories exist
mkdir -p src/components/lab src/pages/lab

# 1. SessionSummaryCard.tsx
cat > src/components/lab/SessionSummaryCard.tsx << 'EOFCOMP'
import { formatInSiteTz } from '../../lib/timezone';

interface SessionData {
  session_id: string;
  session_date: string;
  status: string;
  expected_wake_count: number;
  completed_wake_count: number;
  failed_wake_count: number;
  extra_wake_count: number;
  site_name: string;
  timezone: string;
  local_start: string;
  local_end: string;
  config_changed_flag: boolean;
}

interface SessionSummaryCardProps {
  session: SessionData;
}

export function SessionSummaryCard({ session }: SessionSummaryCardProps) {
  const successRate = session.expected_wake_count > 0
    ? Math.round((session.completed_wake_count / session.expected_wake_count) * 100)
    : 0;

  const getStatusClass = (status: string) => {
    const classes = {
      in_progress: 'bg-blue-100 text-blue-800',
      locked: 'bg-gray-100 text-gray-800',
      completed: 'bg-green-100 text-green-800',
    };
    return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{session.site_name}</h3>
          <p className="text-sm text-gray-500">
            {formatInSiteTz(session.local_start, session.timezone, 'MMM d, yyyy')}
          </p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(session.status)}`}>
          {session.status}
        </span>
      </div>

      {session.config_changed_flag && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          ⚠ Schedule changed during this session
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500">Expected</p>
          <p className="text-2xl font-bold text-gray-900">{session.expected_wake_count}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{session.completed_wake_count}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Failed</p>
          <p className="text-2xl font-bold text-red-600">{session.failed_wake_count}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Overage</p>
          <p className="text-2xl font-bold text-amber-600">{session.extra_wake_count}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Success Rate</span>
          <span className="font-semibold text-gray-900">{successRate}%</span>
        </div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: \`\${successRate}%\` }}
          />
        </div>
      </div>
    </div>
  );
}
EOFCOMP

echo "✅ SessionSummaryCard.tsx"

# 2. DeviceWakeGrid.tsx - PART 1 (continued in next command due to size)
cat > src/components/lab/DeviceWakeGrid.tsx << 'EOFCOMP'
import { formatInSiteTz } from '../../lib/timezone';

interface PayloadData {
  payload_id: string;
  device_name: string;
  device_mac: string;
  captured_at: string;
  wake_window_index: number;
  overage_flag: boolean;
  payload_status: string;
  image_status: string;
  image_name: string;
  received_chunks: number;
  total_chunks: number;
  image_id: string;
}

interface DeviceWakeGridProps {
  payloads: PayloadData[];
  timezone: string;
  onRowClick: (imageId: string) => void;
}

export function DeviceWakeGrid({ payloads, timezone, onRowClick }: DeviceWakeGridProps) {
  const getStatusBadge = (status: string) => {
    const badges = {
      complete: <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">✓ Complete</span>,
      in_progress: <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">⏳ In Progress</span>,
      failed: <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">✗ Failed</span>,
      timeout: <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded">⏱ Timeout</span>,
    };
    return badges[status as keyof typeof badges] || <span className="text-gray-500">{status}</span>;
  };

  if (!payloads || payloads.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        No wake payloads found for this session
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Captured At</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wake Index</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chunks</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payloads.map((payload) => (
              <tr
                key={payload.payload_id}
                onClick={() => payload.image_id && onRowClick(payload.image_id)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{payload.device_name}</div>
                  <div className="text-xs text-gray-500">{payload.device_mac}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {formatInSiteTz(payload.captured_at, timezone, 'HH:mm:ss')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{payload.wake_window_index}</span>
                    {payload.overage_flag && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">⚠ Overage</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {payload.received_chunks}/{payload.total_chunks}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(payload.image_status || payload.payload_status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOFCOMP

echo "✅ DeviceWakeGrid.tsx"

