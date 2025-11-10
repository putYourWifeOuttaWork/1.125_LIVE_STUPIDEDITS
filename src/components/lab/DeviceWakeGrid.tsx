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
