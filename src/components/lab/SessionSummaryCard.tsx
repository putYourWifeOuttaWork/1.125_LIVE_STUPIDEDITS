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
  local_start?: string | null;
  local_end?: string | null;
  config_changed_flag?: boolean;
  session_start_time?: string | null;
  session_end_time?: string | null;
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

  // Use session_date directly since it's already a date string
  const displayDate = session.session_date;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{session.site_name}</h3>
          <p className="text-sm text-gray-500">
            {displayDate}
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
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
