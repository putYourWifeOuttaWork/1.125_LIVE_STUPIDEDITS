import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { parseDateOnly } from '../../utils/timeFormatters';
import {
  Calendar,
  Clock,
  Activity,
  Wifi,
  WifiOff,
  AlertCircle,
  Lock,
  ChevronRight,
} from 'lucide-react';
import Card, { CardHeader, CardContent, CardFooter } from '../common/Card';
import Button from '../common/Button';

export interface DeviceSubmission {
  session_id: string;
  company_id: string;
  program_id: string;
  site_id: string;
  session_date: string;
  session_start_time: string;
  session_end_time: string;
  expected_wake_count: number;
  completed_wake_count: number;
  failed_wake_count: number;
  extra_wake_count: number;
  status: 'pending' | 'in_progress' | 'locked';
  config_changed_flag: boolean;
  created_at: string;
  locked_at?: string;
  device_submission_id?: string;
  site_name?: string;
  program_name?: string;
  device_count?: number;
}

interface DeviceSubmissionCardProps {
  submission: DeviceSubmission;
  programId: string;
  siteId: string;
  testId?: string;
}

const DeviceSubmissionCard = ({
  submission,
  programId,
  siteId,
  testId,
}: DeviceSubmissionCardProps) => {
  const navigate = useNavigate();

  const handleViewDetails = () => {
    navigate(`/programs/${programId}/sites/${siteId}/device-sessions/${submission.session_id}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'locked':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={14} />;
      case 'in_progress':
        return <Activity size={14} />;
      case 'locked':
        return <Lock size={14} />;
      default:
        return <Activity size={14} />;
    }
  };

  const completionPercentage =
    submission.expected_wake_count > 0
      ? Math.min(Math.round((submission.completed_wake_count / submission.expected_wake_count) * 100), 100)
      : 0;

  const totalWakes = submission.completed_wake_count + submission.failed_wake_count + submission.extra_wake_count;

  return (
    <Card
      data-testid={testId}
      className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-blue-500"
      onClick={handleViewDetails}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <Wifi className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-gray-900 truncate">Device Submission</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded border flex items-center space-x-1 ${getStatusColor(submission.status)}`}>
              {getStatusIcon(submission.status)}
              <span className="font-medium text-xs">{submission.status === 'in_progress' ? 'IN_PROGRESS' : submission.status.toUpperCase()}</span>
            </span>
          </div>
          <div className="flex items-center text-xs text-gray-600 space-x-2 flex-shrink-0">
            <Calendar className="h-3 w-3" />
            <span>{format(parseDateOnly(submission.session_date), 'MMM dd, yyyy')}</span>
            <Clock className="h-3 w-3 ml-2" />
            <span>{format(new Date(submission.session_start_time), 'HH:mm')} - {format(new Date(submission.session_end_time), 'HH:mm')}</span>
          </div>
        </div>

        <div className="flex items-center justify-between space-x-4">
          {/* Compact Progress Bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xs text-gray-600">Completion</span>
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <span className="text-xs font-bold text-blue-600 w-8 text-right">{completionPercentage}%</span>
            </div>
          </div>

          {/* Compact Stats */}
          <div className="flex items-center space-x-3">
            <div className="text-center">
              <div className="flex items-center space-x-1">
                <Activity className="h-3 w-3 text-blue-500" />
                <span className="text-sm font-bold text-blue-600">{submission.expected_wake_count}</span>
              </div>
              <div className="text-xs text-gray-500">Expected</div>
            </div>

            <div className="text-center">
              <div className="flex items-center space-x-1">
                <Wifi className="h-3 w-3 text-green-500" />
                <span className="text-sm font-bold text-green-600">{submission.completed_wake_count}</span>
              </div>
              <div className="text-xs text-gray-500">Completed</div>
            </div>

            <div className="text-center">
              <div className="flex items-center space-x-1">
                <WifiOff className="h-3 w-3 text-red-500" />
                <span className="text-sm font-bold text-red-600">{submission.failed_wake_count}</span>
              </div>
              <div className="text-xs text-gray-500">Failed</div>
            </div>

            <div className="text-center">
              <div className="flex items-center space-x-1">
                <AlertCircle className="h-3 w-3 text-yellow-500" />
                <span className="text-sm font-bold text-yellow-600">{submission.extra_wake_count}</span>
              </div>
              <div className="text-xs text-gray-500">Extra</div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronRight size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetails();
            }}
            className="flex-shrink-0"
          >
            <span className="text-xs">View</span>
          </Button>
        </div>

        {/* Alerts on same row if present */}
        <div className="flex items-center space-x-2 mt-2">
          {submission.config_changed_flag && (
            <div className="flex items-center px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
              <AlertCircle className="h-3 w-3 mr-1" />
              <span>Config changed</span>
            </div>
          )}
          {submission.status === 'locked' && submission.locked_at && (
            <div className="flex items-center px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
              <Lock className="h-3 w-3 mr-1" />
              <span>Locked {format(new Date(submission.locked_at), 'MMM dd, HH:mm')}</span>
            </div>
          )}
          {totalWakes > 0 && (
            <div className="text-xs text-gray-600 ml-auto">
              <span className="font-medium">{totalWakes}</span> total wakes
              {submission.device_count && (
                <> across <span className="font-medium">{submission.device_count}</span> devices</>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default DeviceSubmissionCard;
