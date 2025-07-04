import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Filter, User, FileText, ArrowLeft, RefreshCw, Download, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardContent, CardHeader } from '../components/common/Card';
import LoadingScreen from '../components/common/LoadingScreen';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { useCompanies } from '../hooks/useCompanies';
import { toast } from 'react-toastify';

// Map event types to more user-friendly labels
const eventTypeLabels: Record<string, string> = {
  'ProgramCreation': 'Program Created',
  'ProgramUpdate': 'Program Updated',
  'ProgramDeletion': 'Program Deleted',
  'SiteCreation': 'Site Created',
  'SiteUpdate': 'Site Updated',
  'SiteDeletion': 'Site Deleted',
  'SubmissionCreation': 'Submission Created',
  'SubmissionUpdate': 'Submission Updated',
  'SubmissionDeletion': 'Submission Deleted',
  'PetriCreation': 'Petri Sample Added',
  'PetriUpdate': 'Petri Sample Updated',
  'PetriDeletion': 'Petri Sample Deleted',
  'UserAdded': 'User Added',
  'UserRemoved': 'User Removed',
  'UserRoleChanged': 'User Role Changed',
  'UserDeactivated': 'User Deactivated',
  'UserReactivated': 'User Reactivated',
  'GasifierCreation': 'Gasifier Added',
  'GasifierUpdate': 'Gasifier Updated',
  'GasifierDeletion': 'Gasifier Deleted'
};

// Object types for filtering
const objectTypes = [
  { value: 'pilot_program', label: 'Programs' },
  { value: 'site', label: 'Sites' },
  { value: 'submission', label: 'Submissions' },
  { value: 'petri_observation', label: 'Petri Samples' },
  { value: 'gasifier_observation', label: 'Gasifier Samples' },
  { value: 'program_user', label: 'Program Users' },
  { value: 'user', label: 'Users' }
];

// Event types grouped by category for filtering
const eventTypeGroups = [
  {
    group: 'Programs',
    types: ['ProgramCreation', 'ProgramUpdate', 'ProgramDeletion']
  },
  {
    group: 'Sites',
    types: ['SiteCreation', 'SiteUpdate', 'SiteDeletion']
  },
  {
    group: 'Submissions',
    types: ['SubmissionCreation', 'SubmissionUpdate', 'SubmissionDeletion']
  },
  {
    group: 'Petri Samples',
    types: ['PetriCreation', 'PetriUpdate', 'PetriDeletion']
  },
  {
    group: 'Gasifier Samples',
    types: ['GasifierCreation', 'GasifierUpdate', 'GasifierDeletion']
  },
  {
    group: 'Users',
    types: ['UserAdded', 'UserRemoved', 'UserRoleChanged', 'UserDeactivated', 'UserReactivated']
  }
];

const UserAuditPage = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const { isAdmin, loading: companyLoading } = useCompanies();
  
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [itemsPerPage] = useState(50); // Load 50 items at a time
  
  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterObjectType, setFilterObjectType] = useState<string>('');
  const [filterEventType, setFilterEventType] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  
  const fetchUserDetails = async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', userId)
        .single();
        
      if (error) {
        console.error('Error fetching user details:', error);
        return;
      }
      
      setUserName(data.full_name);
      setUserEmail(data.email);
    } catch (err) {
      console.error('Error fetching user details:', err);
    }
  };

  const fetchAuditLogs = async (reset = false) => {
    if (!userId) {
      setAuditLogs([]);
      setLoading(false);
      return;
    }
    
    // If reset is true, we're applying filters so start from page 0
    if (reset) {
      setCurrentPage(0);
      setAuditLogs([]);
    }
    
    const page = reset ? 0 : currentPage;
    const offset = page * itemsPerPage;
    
    setLoading(reset);
    setLoadingMore(!reset);
    setError(null);
    
    try {
      // Use the RPC function with pagination and filtering
      const { data, error } = await supabase
        .rpc('get_user_audit_history', { 
          p_user_id: userId,
          p_object_type: filterObjectType || null,
          p_event_type: filterEventType || null,
          p_limit: itemsPerPage,
          p_offset: offset
        });
      
      if (error) throw error;
      
      // If resetting, replace audit logs; otherwise, append
      const logs = reset ? data : [...auditLogs, ...data];
      setAuditLogs(logs);
      
      // Check if we have more logs to fetch
      setHasMoreLogs(data.length === itemsPerPage);
      
      // Increment page for next load
      if (!reset) {
        setCurrentPage(page + 1);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  
  const loadMore = () => {
    if (!loadingMore && hasMoreLogs) {
      fetchAuditLogs(false);
    }
  };
  
  const applyFilters = async () => {
    await fetchAuditLogs(true);
  };
  
  const resetFilters = async () => {
    setFilterObjectType('');
    setFilterEventType('');
    await fetchAuditLogs(true);
  };
  
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .rpc('export_user_audit_history_csv', {
          p_user_id: userId,
          p_object_type: filterObjectType || null,
          p_event_type: filterEventType || null
        });
        
      if (error) throw error;
      
      if (data) {
        // Create a blob and download it
        const blob = new Blob([data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `user-audit-${userId}-${new Date().toISOString().split('T')[0]}.csv`;
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
    if (!isAdmin && !companyLoading) {
      navigate('/company');
    }
  }, [isAdmin, companyLoading, navigate]);

  useEffect(() => {
    fetchUserDetails();
    fetchAuditLogs(true); // Reset logs when component mounts
  }, [userId]);

  // Helper function to get global_submission_id from audit log entries
  const getGlobalSubmissionId = (log: any) => {
    if (log.object_type === 'submission') {
      // Check both new_data and old_data for global_submission_id
      if (log.new_data && log.new_data.global_submission_id) {
        return log.new_data.global_submission_id;
      }
      if (log.old_data && log.old_data.global_submission_id) {
        return log.old_data.global_submission_id;
      }
    }
    return null;
  };

  if (loading && auditLogs.length === 0) {
    return <LoadingScreen />;
  }

  if (!userId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No user specified. Please select a user to view their audit log.</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => navigate('/company')}
        >
          Go to Company
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate('/company')}
          className="mr-4 p-2 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Audit Log</h1>
          <p className="text-gray-600 mt-1">
            Viewing activity history for {userName || userEmail || 'user'}
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <User className="text-primary-500 mr-2" size={18} />
              <h2 className="font-medium">User Details</h2>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Full Name</p>
              <p className="font-medium">{userName || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{userEmail || 'Not available'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
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
                testId="toggle-filters-button"
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
                onClick={() => fetchAuditLogs(true)}
                isLoading={loading && !loadingMore}
                testId="refresh-audit-logs"
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        {showFilters && (
          <div className="p-4 bg-gray-50 border-b border-gray-100 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Object Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={filterObjectType}
                  onChange={(e) => setFilterObjectType(e.target.value)}
                  data-testid="object-type-filter"
                >
                  <option value="">All Object Types</option>
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
                  onChange={(e) => setFilterEventType(e.target.value)}
                  data-testid="event-type-filter"
                >
                  <option value="">All Event Types</option>
                  {eventTypeGroups.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.types.map((type) => (
                        <option key={type} value={type}>
                          {eventTypeLabels[type] || type}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="flex items-end space-x-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={applyFilters}
                  className="flex-grow"
                  testId="apply-filters-button"
                >
                  Apply Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  testId="reset-filters-button"
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

        {auditLogs.length === 0 && !loading ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
            <p>No audit logs found for this user</p>
            {(filterObjectType || filterEventType) && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={resetFilters}
              >
                Clear filters
              </Button>
            )}
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
                          : log.update_type.includes('Deactivated')
                          ? 'bg-warning-100 text-warning-800'
                          : log.update_type.includes('Reactivated')
                          ? 'bg-primary-100 text-primary-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {eventTypeLabels[log.update_type] || log.update_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        <div className="flex items-center font-medium text-gray-900">
                          <span>{log.object_type.charAt(0).toUpperCase() + log.object_type.slice(1).replace('_', ' ')}</span>
                          {log.object_type === 'submission' && getGlobalSubmissionId(log) && (
                            <span className="ml-2 inline-flex items-center text-xs text-primary-600">
                              <Hash size={12} className="mr-0.5" />
                              {getGlobalSubmissionId(log)}
                            </span>
                          )}
                        </div>
                        {log.new_data && Object.keys(log.new_data).length > 0 && (
                          <div className="mt-1 text-xs">
                            {log.update_type === 'UserDeactivated' && (
                              <span>User deactivated: {log.new_data?.user_email}</span>
                            )}
                            {log.update_type === 'UserReactivated' && (
                              <span>User reactivated: {log.new_data?.user_email}</span>
                            )}
                            {log.update_type === 'UserRoleChanged' && (
                              <span>
                                Role changed from {log.old_data?.role || 'Member'} to {log.new_data?.role || 'Member'}
                              </span>
                            )}
                            {log.update_type === 'SubmissionCreation' && (
                              <div className="flex items-center">
                                <span>Created a submission</span>
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
                                <span>Updated a submission</span>
                                {getGlobalSubmissionId(log) && (
                                  <span className="ml-2 inline-flex items-center text-xs text-primary-600">
                                    <Hash size={10} className="mr-0.5" />
                                    {getGlobalSubmissionId(log)}
                                  </span>
                                )}
                              </div>
                            )}
                            {log.update_type === 'GasifierCreation' && (
                              <span>Added a gasifier observation: {log.new_data?.gasifier_code}</span>
                            )}
                            {log.update_type === 'PetriCreation' && (
                              <span>Added a petri observation: {log.new_data?.petri_code}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Load More Button */}
            {hasMoreLogs && (
              <div className="flex justify-center p-4 border-t border-gray-100">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  isLoading={loadingMore}
                  disabled={!hasMoreLogs || loadingMore}
                  testId="load-more-button"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default UserAuditPage;