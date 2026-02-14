import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  Battery,
  Thermometer,
  Map,
} from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import Button from '../common/Button';
import { format } from 'date-fns';
import { SiteDeviceSession } from '../../hooks/useSiteDeviceSessions';
import { parseDateOnly } from '../../utils/timeFormatters';

interface SiteDeviceSessionCardProps {
  session: SiteDeviceSession;
  testId?: string;
}

const SiteDeviceSessionCard = ({ session, testId }: SiteDeviceSessionCardProps) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleViewSession = () => {
    // Navigate to device session detail page
    navigate(
      `/programs/${session.program_id}/sites/${session.site_id}/device-sessions/${session.session_id}`
    );
  };

  const handleCardHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'in_progress':
        return 'text-blue-600 bg-blue-50';
      case 'locked':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'in_progress':
        return <Activity className="h-4 w-4 animate-pulse" />;
      case 'locked':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const completionPercentage =
    session.expected_wake_count > 0
      ? Math.min(Math.round((session.completed_wake_count / session.expected_wake_count) * 100), 100)
      : 0;

  return (
    <Card
      data-testid={testId}
      className="hover:shadow-md transition-shadow duration-200 border-l-4 border-l-blue-500"
    >
      <CardHeader
        onClick={handleCardHeaderClick}
        className="cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-grow">
            <div className={`p-2 rounded-full ${getStatusColor(session.status)}`}>
              {getStatusIcon(session.status)}
            </div>
            <div className="flex-grow">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {format(parseDateOnly(session.session_date), 'MMM dd, yyyy')}
                </h3>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                    session.status
                  )}`}
                >
                  {session.status.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center text-sm text-gray-600 mt-1 space-x-4">
                <span className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  {session.site_name}
                </span>
                <span className="flex items-center">
                  <Activity className="h-4 w-4 mr-1" />
                  {session.program_name}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleViewSession();
              }}
              icon={<Map size={16} />}
            >
              View Map
            </Button>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="border-t bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700 text-sm">Session Statistics</h4>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center">
                    <Wifi className="h-4 w-4 mr-2 text-green-500" />
                    Completed Wakes
                  </span>
                  <span className="font-semibold text-green-600">
                    {session.completed_wake_count}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center">
                    <WifiOff className="h-4 w-4 mr-2 text-red-500" />
                    Failed Wakes
                  </span>
                  <span className="font-semibold text-red-600">{session.failed_wake_count}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2 text-yellow-500" />
                    Extra Wakes
                  </span>
                  <span className="font-semibold text-yellow-600">
                    {session.extra_wake_count}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm pt-2 border-t">
                  <span className="text-gray-600">Expected Wakes</span>
                  <span className="font-semibold">{session.expected_wake_count}</span>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">Completion</span>
                  <span className="font-semibold">{completionPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700 text-sm">Session Details</h4>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Session Date</span>
                  <span className="font-medium">
                    {format(parseDateOnly(session.session_date), 'MMM dd, yyyy')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Start Time</span>
                  <span className="font-medium">
                    {format(new Date(session.session_start_time), 'HH:mm:ss')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">End Time</span>
                  <span className="font-medium">
                    {format(new Date(session.session_end_time), 'HH:mm:ss')}
                  </span>
                </div>

                {session.config_changed_flag && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-yellow-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Config Changed
                    </span>
                    <span className="text-xs text-yellow-600">Mid-day change detected</span>
                  </div>
                )}

                {session.locked_at && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-gray-600">Locked At</span>
                    <span className="text-xs font-medium">
                      {format(new Date(session.locked_at), 'MMM dd, HH:mm')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <Button variant="primary" onClick={handleViewSession} icon={<Map size={16} />}>
              View Session Details
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default SiteDeviceSessionCard;
