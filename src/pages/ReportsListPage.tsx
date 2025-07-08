import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart4, PlusCircle, File, Edit, Trash2, Copy, Play } from 'lucide-react';
import Button from '../components/common/Button';
import Card, { CardContent, CardHeader } from '../components/common/Card';
import useReports, { CustomReport } from '../hooks/useReports';
import { format } from 'date-fns';
import LoadingScreen from '../components/common/LoadingScreen';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { toast } from 'react-toastify';

const ReportsListPage = () => {
  const navigate = useNavigate();
  const { reports, isLoading, deleteReport } = useReports();
  
  const [reportToDelete, setReportToDelete] = useState<CustomReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const confirmDelete = async () => {
    if (!reportToDelete) return;
    
    setIsDeleting(true);
    try {
      const success = await deleteReport(reportToDelete.report_id);
      if (success) {
        toast.success(`Report "${reportToDelete.name}" deleted successfully`);
        setReportToDelete(null);
      } else {
        toast.error(`Failed to delete report "${reportToDelete.name}"`);
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Error deleting report');
    } finally {
      setIsDeleting(false);
    }
  };
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
          <p className="text-gray-600 mt-1">
            View and manage your saved reports
          </p>
        </div>
        <Button 
          variant="primary"
          icon={<PlusCircle size={18} />}
          onClick={() => navigate('/reports/builder')}
        >
          New Report
        </Button>
      </div>
      
      {reports.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <BarChart4 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No reports yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first custom report.</p>
          <div className="mt-6">
            <Button 
              variant="primary"
              icon={<PlusCircle size={16} />}
              onClick={() => navigate('/reports/builder')}
            >
              Create Report
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(report => (
            <Card 
              key={report.report_id} 
              className="hover:shadow-md transition-shadow"
              onClick={() => navigate(`/reports/${report.report_id}`)}
            >
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center">
                  <File className="h-5 w-5 text-primary-500 mr-2" />
                  <h3 className="font-medium truncate" title={report.name}>{report.name}</h3>
                </div>
                <div className="flex space-x-1">
                  <button 
                    className="p-1 text-gray-500 hover:text-primary-600 rounded-full hover:bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reports/builder?id=${report.report_id}`);
                    }}
                    title="Edit report"
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    className="p-1 text-gray-500 hover:text-primary-600 rounded-full hover:bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reports/builder?clone=${report.report_id}`);
                    }}
                    title="Clone report"
                  >
                    <Copy size={16} />
                  </button>
                  <button 
                    className="p-1 text-gray-500 hover:text-error-600 rounded-full hover:bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReportToDelete(report);
                    }}
                    title="Delete report"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-500 mb-3">
                  {report.description || 'No description'}
                </div>
                
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>Created: {format(new Date(report.created_at), 'MMM d, yyyy')}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="!py-1 !px-2"
                    icon={<Play size={12} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reports/view/${report.report_id}`);
                    }}
                  >
                    Run
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
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