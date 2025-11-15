import { useState } from 'react';
import { Activity, Calendar, MapPin, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import Card, { CardHeader, CardContent } from '../common/Card';
import { useDeviceProgramHistory } from '../../hooks/useDeviceProgramHistory';
import LoadingScreen from '../common/LoadingScreen';

interface DeviceProgramHistoryPanelProps {
  deviceId: string;
}

const DeviceProgramHistoryPanel = ({ deviceId }: DeviceProgramHistoryPanelProps) => {
  const { assignments, activePrograms, historicalPrograms, isLoading } = useDeviceProgramHistory(deviceId);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="mx-auto h-12 w-12 text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">No program history</p>
        <p className="text-sm text-gray-500 mt-1">
          This device has not been assigned to any programs yet
        </p>
      </div>
    );
  }

  const selectedAssignment = selectedProgramId
    ? assignments.find(a => a.program_id === selectedProgramId)
    : null;

  return (
    <div className="space-y-6">
      {/* Program Selector */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Program Participation</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Active Programs */}
          {activePrograms.map(assignment => (
            <button
              key={assignment.assignment_id}
              onClick={() => setSelectedProgramId(assignment.program_id)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                selectedProgramId === assignment.program_id
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-green-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <h4 className="font-semibold text-gray-900">
                    {assignment.pilot_programs?.name || 'Unknown Program'}
                  </h4>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
              {assignment.sites && (
                <div className="flex items-center text-sm text-gray-600 mb-1">
                  <MapPin size={14} className="mr-1" />
                  {assignment.sites.name} (#{assignment.sites.site_code})
                </div>
              )}
              <div className="flex items-center text-xs text-gray-500">
                <Calendar size={12} className="mr-1" />
                Assigned {formatDistanceToNow(new Date(assignment.assigned_at), { addSuffix: true })}
              </div>
            </button>
          ))}

          {/* Historical Programs */}
          {historicalPrograms.map(assignment => (
            <button
              key={assignment.assignment_id}
              onClick={() => setSelectedProgramId(assignment.program_id)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                selectedProgramId === assignment.program_id
                  ? 'border-gray-500 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <h4 className="font-semibold text-gray-700">
                    {assignment.pilot_programs?.name || 'Unknown Program'}
                  </h4>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  Historical
                </span>
              </div>
              {assignment.sites && (
                <div className="flex items-center text-sm text-gray-600 mb-1">
                  <MapPin size={14} className="mr-1" />
                  {assignment.sites.name} (#{assignment.sites.site_code})
                </div>
              )}
              <div className="flex items-center text-xs text-gray-500">
                <Calendar size={12} className="mr-1" />
                {assignment.assigned_at && assignment.unassigned_at
                  ? `${format(new Date(assignment.assigned_at), 'MMM d, yyyy')} - ${format(new Date(assignment.unassigned_at), 'MMM d, yyyy')}`
                  : format(new Date(assignment.assigned_at), 'MMM d, yyyy')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Program Details */}
      {selectedAssignment && (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {selectedAssignment.pilot_programs?.name || 'Program Details'}
              </h3>
              {selectedAssignment.is_active ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <CheckCircle size={14} className="mr-1" />
                  Currently Active
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                  Historical
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Program Timeline */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b">
              <div>
                <p className="text-sm text-gray-500 mb-1">Program Duration</p>
                <div className="flex items-center text-sm">
                  <Calendar size={14} className="mr-2 text-gray-400" />
                  {selectedAssignment.pilot_programs?.start_date && selectedAssignment.pilot_programs?.end_date ? (
                    <>
                      {format(new Date(selectedAssignment.pilot_programs.start_date), 'MMM d, yyyy')}
                      {' - '}
                      {format(new Date(selectedAssignment.pilot_programs.end_date), 'MMM d, yyyy')}
                    </>
                  ) : (
                    'Not specified'
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Device Assignment Period</p>
                <div className="flex items-center text-sm">
                  <Clock size={14} className="mr-2 text-gray-400" />
                  {selectedAssignment.assigned_at && (
                    <>
                      {format(new Date(selectedAssignment.assigned_at), 'MMM d, yyyy')}
                      {selectedAssignment.unassigned_at && (
                        <> - {format(new Date(selectedAssignment.unassigned_at), 'MMM d, yyyy')}</>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Site Information */}
            {selectedAssignment.sites && (
              <div className="pb-4 border-b">
                <p className="text-sm text-gray-500 mb-2">Site Assignment</p>
                <div className="flex items-start">
                  <MapPin size={16} className="mr-2 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium">{selectedAssignment.sites.name}</p>
                    <p className="text-sm text-gray-500">Site Code: #{selectedAssignment.sites.site_code}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Assignment Details */}
            <div>
              <p className="text-sm text-gray-500 mb-2">Assignment Details</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Primary Assignment</span>
                  <span className="font-medium">
                    {selectedAssignment.is_primary ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="font-medium">
                    {selectedAssignment.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Unassignment Reason */}
            {selectedAssignment.unassigned_at && selectedAssignment.reason && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-start">
                  <AlertCircle size={16} className="mr-2 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-900 mb-1">Unassignment Reason</p>
                    <p className="text-sm text-yellow-800">{selectedAssignment.reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedAssignment.notes && (
              <div>
                <p className="text-sm text-gray-500 mb-2">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                  {selectedAssignment.notes}
                </p>
              </div>
            )}

            {/* Analytics Placeholder */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <p className="text-sm font-medium text-blue-900 mb-2">Program-Scoped Analytics</p>
              <p className="text-sm text-blue-800">
                View all device data (wakes, images, telemetry) collected during this program assignment by filtering other tabs by this program's dates.
              </p>
              {selectedAssignment.pilot_programs?.start_date && selectedAssignment.pilot_programs?.end_date && (
                <p className="text-xs text-blue-700 mt-2">
                  Filter range: {format(new Date(selectedAssignment.pilot_programs.start_date), 'MMM d, yyyy')} - {format(new Date(selectedAssignment.pilot_programs.end_date), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!selectedProgramId && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Activity className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">Select a program above to view details</p>
          <p className="text-sm text-gray-500 mt-1">
            View assignment history, timeline, and program-specific analytics
          </p>
        </div>
      )}
    </div>
  );
};

export default DeviceProgramHistoryPanel;
