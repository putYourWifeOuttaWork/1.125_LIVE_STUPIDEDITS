import { toast } from 'react-toastify';
import { Copy } from 'lucide-react';

export function CopyButtons() {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`);
  };

  const sqlQueries = {
    sessionCount: `SELECT site_id, session_date, expected_wake_count, completed_wake_count
FROM vw_site_day_sessions
WHERE session_date = CURRENT_DATE
ORDER BY site_id;`,

    payloadStatus: `SELECT payload_status, COUNT(*)
FROM vw_session_payloads
WHERE session_id = 'YOUR_SESSION_ID'
GROUP BY payload_status;`,

    imageStatus: `SELECT image_status, COUNT(*)
FROM vw_images_observations
WHERE original_capture_date = CURRENT_DATE
GROUP BY image_status;`,

    observationLinkage: `SELECT po.observation_id, po.submission_id, s.is_device_generated, di.image_name
FROM petri_observations po
JOIN submissions s ON po.submission_id = s.submission_id
LEFT JOIN device_images di ON di.observation_id = po.observation_id
WHERE po.is_device_generated = true
  AND po.created_at >= CURRENT_DATE
ORDER BY po.created_at DESC
LIMIT 20;`
  };

  const simulatorCommands = {
    happy: 'node tools/device-sim/simulate_device.mjs --scenario=happy --device_mac=AA:BB:CC:DD:EE:01',
    missing: 'node tools/device-sim/simulate_device.mjs --scenario=missing --device_mac=AA:BB:CC:DD:EE:02 --chunks=10',
    overage: 'node tools/device-sim/simulate_device.mjs --scenario=overage --device_mac=AA:BB:CC:DD:EE:03',
    retrylate: 'node tools/device-sim/simulate_device.mjs --scenario=retrylate --device_mac=AA:BB:CC:DD:EE:04',
    tzboundary: 'node tools/device-sim/simulate_device.mjs --scenario=tzboundary --device_mac=AA:BB:CC:DD:EE:05',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Developer Tools</h3>

      {/* SQL Verification */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">SQL Verification Queries</h4>
        <div className="space-y-2">
          {Object.entries(sqlQueries).map(([key, query]) => (
            <button
              key={key}
              onClick={() => copyToClipboard(query, `${key} query`)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
            >
              <span className="text-gray-700">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <Copy className="w-4 h-4 text-gray-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Simulator Commands */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Device Simulator Commands</h4>
        <div className="space-y-2">
          {Object.entries(simulatorCommands).map(([scenario, command]) => (
            <button
              key={scenario}
              onClick={() => copyToClipboard(command, `${scenario} scenario`)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
            >
              <span className="text-gray-700 capitalize">{scenario}</span>
              <Copy className="w-4 h-4 text-gray-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
