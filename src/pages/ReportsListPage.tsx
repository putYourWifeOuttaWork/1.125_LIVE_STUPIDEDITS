import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, PlusCircle, FileText, Edit, Trash2, Play, Search, ArrowRight } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardHeader, CardContent, CardFooter } from '../components/common/Card';
import Input from '../components/common/Input';
import LoadingScreen from '../components/common/LoadingScreen';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import useReports, { CustomReport } from '../hooks/useReports';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import useCompanies from '../hooks/useCompanies';

const ReportsListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { userCompany } = useCompanies();
  const { reports, isLoading, deleteReport } = useReports();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [reportToDelete, setReportToDelete] = useState<CustomReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter reports based on search query
  const filteredReports = searchQuery 
    ? reports.filter(report => 
        report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (report.description && report.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : reports;

  // Handle creating a new report
  const handleNewReport = () => {
    navigate('/reports/builder');
  };
  
  // Handle viewing/editing a report
  const handleViewReport = (reportId: string) => {
    // For now, just navigate to the report builder - in the future could implement a view-only mode
    // navigate(`/reports/${reportId}`);
    toast.info('Report viewing is coming soon. Opening in edit mode.');
    navigate('/reports/builder');
  };
  
  // Handle deleting a report
  const handleDeleteClick = (report: CustomReport, e: React.MouseEvent) => {
    e.stopPropagation();
    setReportToDelete(report);
  };
  
  const confirmDelete = async () => {
    if (!reportToDelete) return;
    
    setIsDeleting(true);
    try {
      const success = await deleteReport(reportToDelete.report_id);
      
      if (success) {
        toast.success(`Report "${reportToDelete.name}" deleted successfully`);
        setReportToDelete(null);
      } else {
        toast.error('Failed to delete report');
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Failed to delete report');
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Handle running a report
  const handleRunReport = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // For now, navigate to the builder page - in the future, implement a dedicated view
    navigate('/reports/builder');
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Reports</h1>
          <p className="text-gray-600 mt-1">
            Create and manage custom reports for your {userCompany?.name || 'company'}
          </p>
        </div>
        <div>
          <Button 
            variant="primary"
            icon={<PlusCircle size={16} />}
            onClick={handleNewReport}
            testId="new-report-button"
          >
            New Report
          </Button>
        </div>
      </div>
      
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          testId="report-search-input"
        />
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200" data-testid="empty-reports-message">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No custom reports yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first custom report.</p>
          <div className="mt-6">
            <Button 
              variant="primary"
              icon={<PlusCircle size={16} />}
              onClick={handleNewReport}
              testId="empty-new-report-button"
            >
              Create Report
            </Button>
          </div>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200" data-testid="no-search-results-message">
          <p className="text-gray-600">No reports match your search</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setSearchQuery('')}
            testId="clear-search-button"
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="reports-grid">
          {filteredReports.map(report => (
            <Card 
              key={report.report_id}
              className="hover:shadow-md cursor-pointer transition-all"
              onClick={() => handleViewReport(report.report_id)}
              testId={`report-card-${report.report_id}`}
            >
              <CardHeader className="flex justify-between items-center">
                <h3 className="text-lg font-semibold truncate" title={report.name}>
                  {report.name}
                </h3>
                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Play size={14} />}
                    onClick={(e) => handleRunReport(report.report_id, e)}
                    className="!py-1 !px-2"
                    testId={`run-report-${report.report_id}`}
                  >
                    Run
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={(e) => handleDeleteClick(report, e)}
                    className="!py-1 !px-2"
                    testId={`delete-report-${report.report_id}`}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Entity type badge */}
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 mr-2">
                      {report.configuration.entity.charAt(0).toUpperCase() + report.configuration.entity.slice(1).replace('_', ' ')}
                    </span>
                    {report.program_id && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-100 text-secondary-800">
                        Program-specific
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {report.description && (
                    <p className="text-gray-600 text-sm line-clamp-2" title={report.description}>
                      {report.description}
                    </p>
                  )}
                  
                  {/* Configuration summary */}
                  <div className="pt-2 text-xs text-gray-500">
                    {report.configuration.metrics && report.configuration.metrics[0] ? (
                      <div className="flex items-center mb-1">
                        <span className="font-medium mr-1">Metric:</span>
                        <span>{report.configuration.metrics[0].function} {report.configuration.metrics[0].field}</span>
                      </div>
                    ) : null}
                    
                    {report.configuration.time_dimension ? (
                      <div className="flex items-center">
                        <span className="font-medium mr-1">Time:</span>
                        <span>
                          By {report.configuration.time_dimension.granularity} of {report.configuration.time_dimension.field}
                        </span>
                      </div>
                    ) : null}
                    
                    {report.configuration.filters && report.configuration.filters.length > 0 ? (
                      <div className="flex items-center">
                        <span className="font-medium mr-1">Filters:</span>
                        <span>{report.configuration.filters.length} applied</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="text-xs text-gray-500">
                <div className="flex justify-between w-full">
                  <span>Created {format(new Date(report.created_at), 'MMM d, yyyy')}</span>
                  <span>Updated {format(new Date(report.updated_at), 'MMM d, yyyy')}</span>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!reportToDelete}
        onClose={() => setReportToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Report"
        message={`Are you sure you want to delete the report "${reportToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete Report"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default ReportsListPage;