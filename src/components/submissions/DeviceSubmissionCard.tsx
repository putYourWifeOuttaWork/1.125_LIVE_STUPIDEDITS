import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
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
      ? Math.round((submission.completed_wake_count / submission.expected_wake_count) * 100)
      : 0;

  const totalWakes = submission.completed_wake_count + submission.failed_wake_count + submission.extra_wake_count;

  return (
    <Card
      data-testid={testId}
      className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-blue-500"
      onClick={handleViewDetails}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <Wifi className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Device Submission
              </h3>
              <span className={`text-xs px-2 py-1 rounded-full border flex items-center space-x-1 ${getStatusColor(submission.status)}`}>
                {getStatusIcon(submission.status)}
                <span className="font-medium">{submission.status.toUpperCase()}</span>
              </span>
            </div>
            <div className="flex items-center text-sm text-gray-600 space-x-3">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {format(new Date(submission.session_date), 'MMM dd, yyyy')}
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                {format(new Date(submission.session_start_time), 'HH:mm')} - {format(new Date(submission.session_end_time), 'HH:mm')}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-3">
        {/* Completion Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Completion</span>
            <span className="text-sm font-bold text-blue-600">{completionPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Wake Stats */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="flex justify-center mb-1">
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-lg font-bold text-blue-600">{submission.expected_wake_count}</div>
            <div className="text-xs text-gray-600">Expected</div>
          </div>

          <div className="bg-green-50 rounded-lg p-2">
            <div className="flex justify-center mb-1">
              <Wifi className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-lg font-bold text-green-600">{submission.completed_wake_count}</div>
            <div className="text-xs text-gray-600">Completed</div>
          </div>

          <div className="bg-red-50 rounded-lg p-2">
            <div className="flex justify-center mb-1">
              <WifiOff className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-lg font-bold text-red-600">{submission.failed_wake_count}</div>
            <div className="text-xs text-gray-600">Failed</div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-2">
            <div className="flex justify-center mb-1">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="text-lg font-bold text-yellow-600">{submission.extra_wake_count}</div>
            <div className="text-xs text-gray-600">Extra</div>
          </div>
        </div>

        {/* Config Changed Flag */}
        {submission.config_changed_flag && (
          <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center text-sm text-yellow-700">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Device configuration changed during this session</span>
          </div>
        )}

        {/* Locked Status */}
        {submission.status === 'locked' && submission.locked_at && (
          <div className="mt-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center text-sm text-gray-700">
            <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Locked at {format(new Date(submission.locked_at), 'MMM dd, HH:mm')}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t">
        <div className="flex items-center justify-between w-full">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{totalWakes}</span> total wakes
            {submission.device_count && (
              <> across <span className="font-medium">{submission.device_count}</span> devices</>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronRight size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetails();
            }}
          >
            View Details
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default DeviceSubmissionCard;
