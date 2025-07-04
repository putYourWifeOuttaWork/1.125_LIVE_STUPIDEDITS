import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import { useAuditLog } from '../hooks/useAuditLog';
import { Clock, Filter, User, FileText, ArrowLeft, RefreshCw, Download, Hash } from 'lucide-react';
import Button from '../components/common/Button';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import useUserRole from '../hooks/useUserRole';
import { HistoryEventType } from '../lib/types';
import usePilotPrograms from '../hooks/usePilotPrograms';
import { useSites } from '../hooks/useSites';
import { toast } from 'react-toastify';

// Map event types to more user-friendly labels
const eventTypeLabels: Record<HistoryEventType, string> = {
  ProgramCreation: 'Program Created',
  ProgramUpdate: 'Program Updated',
  ProgramDeletion: 'Program Deleted',
  SiteCreation: 'Site Created',
  SiteUpdate: 'Site Updated',
  SiteDeletion: 'Site Deleted',
  SubmissionCreation: 'Submission Created',
  SubmissionUpdate: 'Submission Updated',
  SubmissionDeletion: 'Submission Deleted',
  PetriCreation: 'Petri Sample Added',
  PetriUpdate: 'Petri Sample Updated',
  PetriDeletion: 'Petri Sample Deleted',
  UserAdded: 'User Added',
  UserRemoved: 'User Removed',
  UserRoleChanged: 'User Role Changed',
  GasifierCreation: 'Gasifier Added',
  GasifierUpdate: 'Gasifier Updated',
  GasifierDeletion: 'Gasifier Deleted',
  UserDeactivated: 'User Deactivated',
  UserReactivated: 'User Reactivated'
};

// Object types for filtering
const objectTypes = [
  { value: 'pilot_program', label: 'Programs' },
  { value: 'site', label: 'Sites' },
  { value: 'submission', label: 'Submissions' },
  { value: 'petri_observation', label: 'Petri Samples' },
  { value: 'gasifier_observation', label: 'Gasifier Samples' },
  { value: 'program_user', label: 'Program Users' }
];

// Event types grouped by category for filtering
const eventTypeGroups = [
  {
    group: 'Programs',
    types: ['ProgramCreation', 'ProgramUpdate', 'ProgramDeletion'] as HistoryEventType[]
  },
  {
    group: 'Sites',
    types: ['SiteCreation', 'SiteUpdate', 'SiteDeletion'] as HistoryEventType[]
  },
  {
    group: 'Submissions',
    types: ['SubmissionCreation', 'SubmissionUpdate', 'SubmissionDeletion'] as HistoryEventType[]
  },
  {
    group: 'Petri Samples',
    types: ['PetriCreation', 'PetriUpdate', 'PetriDeletion'] as HistoryEventType[]
  },
  {
    group: 'Gasifier Samples',
    types: ['GasifierCreation', 'GasifierUpdate', 'GasifierDeletion'] as HistoryEventType[]
  },
  {
    group: 'Users',
    types: ['UserAdded', 'UserRemoved', 'UserRoleChanged', 'UserDeactivated', 'UserReactivated'] as HistoryEventType[]
  }
];

const AuditLogPage = () => {
  const navigate = useNavigate();
  const { programId, siteId } = useParams<{ programId: string, siteId?: string }>();
  const { selectedProgram, setSelectedProgram, selectedSite, setSelectedSite } = usePilotProgramStore();
  const { canViewAuditLog, isLoading: roleLoading } = useUserRole({ programId });
  const { fetchPilotProgram, isLoading: programLoading } = usePilotPrograms();
  const { fetchSite, isLoading: siteLoading } = useSites(programId);
  
  const { auditLogs, loading, error, fetchAuditLogs, filterLogs, exportAuditLogsCsv } = useAuditLog({
    programId: programId || '',
    siteId
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [filterObjectType, setFilterObjectType] = useState<string>('');
  const [filterEventType, setFilterEventType] = useState<HistoryEventType | ''>('');
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  
  // Extract unique users from audit logs for the user filter dropdown
  const uniqueUsers = auditLogs
    .filter(log => log.user_email)
    .reduce((acc: { id: string; email: string }[], log) => {
      if (log.user_id && log.user_email && !acc.some(u => u.id === log.user_id)) {
        acc.push({ id: log.user_id, email: log.user_email });
      }
      return acc;
    }, []);

  // Fetch selected program if not already in state
  useEffect(() => {
    const loadPilotProgram = async () => {
      if (!programId) return;
      
      // Check if we already have the program in state
      if (selectedProgram && selectedProgram.program_id === programId) {
        return;
      }
      
      // Fetch the program data
      const program = await fetchPilotProgram(programId);
      if (program) {
        setSelectedProgram(program);
      } else {
        console.error('Failed to fetch program');
      }
    };

    loadPilotProgram();
  }, [programId, selectedProgram, setSelectedProgram, fetchPilotProgram]);
  
  // Fetch selected site if not already in state and siteId is provided
  useEffect(() => {
    const loadSite = async () => {
      if (!siteId || !programId) return;
      
      // Check if we already have the site in state and it's the right one
      if (selectedSite && selectedSite.site_id === siteId) {
        return;
      }
      
      // Fetch the site data
      const site = await fetchSite(siteId);
      if (site) {
        setSelectedSite(site);
      } else {
        console.error('Failed to fetch site');
        // Navigate to program level if site not found
        navigate(`/programs/${programId}/sites`);
      }
    };

    if (siteId) {
      loadSite();
    }
  }, [siteId, programId, selectedSite, setSelectedSite, fetchSite, navigate]);
  
  const applyFilters = async () => {
    await filterLogs(
      filterObjectType || undefined,
      filterEventType || undefined,
      filterUserId || undefined
    );
  };
  
  const resetFilters = async () => {
    setFilterObjectType('');
    setFilterEventType('');
    setFilterUserId('');
    await fetchAuditLogs();
  };
  
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const csvData = await exportAuditLogsCsv();
      if (csvData) {
        // Create a blob and download it
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = siteId 
          ? `site-audit-${siteId}-${new Date().toISOString().split('T')[0]}.csv`
          : `program-audit-${programId}-${new Date().toISOString().split('T')[0]}.csv`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success('Audit log exported successfully');
      } else {
        toast.error('Failed to export audit log');
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Error exporting CSV file');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    // If user doesn't have permission, redirect to programs page
    if (!roleLoading && !canViewAuditLog) {
      navigate('/programs');
    }
  }, [canViewAuditLog, roleLoading, navigate]);

  if (loading || roleLoading || programLoading || (siteId && siteLoading)) {
    return <LoadingScreen />;
  }

  if (!programId || !selectedProgram) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No program selected. Please select a program first.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate('/programs')}
        >
          Go to Programs
        </Button>
      </div>
    );
  }

  const getBackNavigationPath = () => {
    if (siteId) {
      return `/programs/${programId}/sites/${siteId}`;
    }
    return `/programs/${programId}/sites`;
  };

  // Helper function to extract global_submission_id from audit log entries
  const getGlobalSubmissionId = (log: any) => {
    if (log.object_type === 'submission') {
      // Try to find the global_submission_id in the new_data or old_data
      if (log.new_data && log.new_data.global_submission_id) {
        return log.new_data.global_submission_id;
      }
      if (log.old_data && log.old_data.global_submission_id) {
        return log.old_data.global_submission_id;
      }
    }
    return null;
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(getBackNavigationPath())}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {siteId ? `Site Audit Log - ${selectedSite?.name}` : 'Program Audit Log'}
          </h1>
          <p className="text-gray-600 mt-1">
            View activity history for {siteId ? `${selectedSite?.name} in ` : ''}{selectedProgram.name}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <div className="flex items-center">
            <Clock className="text-primary-500 mr-2" size={18} />
            <h2 className="font-medium">Activity History</h2>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Filter size={14} />}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleExportCsv}
              isLoading={exporting}
              testId="export-audit-csv"
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={fetchAuditLogs}
            >
              Refresh
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="p-4 bg-gray-50 border-b border-gray-100 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Object Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={filterObjectType}
                  onChange={(e) => setFilterObjectType(e.target.value)}
                >
                  <option value="">All Types</option>
                  {objectTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={filterEventType}
                  onChange={(e) => setFilterEventType(e.target.value as HistoryEventType | '')}
                >
                  <option value="">All Events</option>
                  {eventTypeGroups.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.types.map((type) => (
                        <option key={type} value={type}>
                          {eventTypeLabels[type]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  User
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                >
                  <option value="">All Users</option>
                  {uniqueUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end space-x-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={applyFilters}
                  className="flex-grow"
                >
                  Apply Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-error-50 text-error-700 border-b border-error-100">
            <p>{error}</p>
          </div>
        )}

        {auditLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
            <p>No audit logs found {siteId ? 'for this site' : 'for this program'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(log.event_timestamp), 'MMM d, yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.update_type.includes('Creation')
                          ? 'bg-success-100 text-success-800'
                          : log.update_type.includes('Update')
                          ? 'bg-secondary-100 text-secondary-800'
                          : log.update_type.includes('Deletion')
                          ? 'bg-error-100 text-error-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {eventTypeLabels[log.update_type as HistoryEventType] || log.update_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-gray-400 mr-1" />
                        {log.user_email || 'System'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        <p className="font-medium text-gray-900">
                          {log.object_type.charAt(0).toUpperCase() + log.object_type.slice(1).replace('_', ' ')}
                        </p>
                        {log.new_data && Object.keys(log.new_data).length > 0 && (
                          <div className="mt-1 text-xs">
                            {log.update_type === 'UserAdded' && (
                              <span>Added user: {log.new_data.user_email}</span>
                            )}
                            {log.update_type === 'UserRemoved' && (
                              <span>Removed user: {log.old_data?.user_email}</span>
                            )}
                            {log.update_type === 'UserRoleChanged' && (
                              <span>
                                Changed role for {log.old_data?.user_email} from{' '}
                                {log.old_data?.role} to {log.new_data.role}
                              </span>
                            )}
                            {log.update_type === 'ProgramCreation' && (
                              <span>Created program: {log.new_data.name}</span>
                            )}
                            {log.update_type === 'ProgramUpdate' && (
                              <span>
                                Updated program properties
                                {log.old_data?.name !== log.new_data.name
                                  ? ` (renamed from "${log.old_data?.name}" to "${log.new_data.name}")`
                                  : ''}
                              </span>
                            )}
                            {log.update_type === 'SiteCreation' && (
                              <span>Created site: {log.new_data.name}</span>
                            )}
                            {log.update_type === 'SiteUpdate' && (
                              <span>Updated site: {log.new_data.name}</span>
                            )}
                            {log.update_type === 'SubmissionCreation' && (
                              <div className="flex items-center">
                                <span>Created submission with temp: {log.new_data.temperature}°F</span>
                                {getGlobalSubmissionId(log) && (
                                  <span className="ml-2 inline-flex items-center text-xs text-primary-600">
                                    <Hash size={10} className="mr-0.5" />
                                    {getGlobalSubmissionId(log)}
                                  </span>
                                )}
                              </div>
                            )}
                            {log.update_type === 'SubmissionUpdate' && (
                              <div className="flex items-center">
                                <span>Updated submission</span>
                                {getGlobalSubmissionId(log) && (
                                  <span className="ml-2 inline-flex items-center text-xs text-primary-600">
                                    <Hash size={10} className="mr-0.5" />
                                    {getGlobalSubmissionId(log)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;