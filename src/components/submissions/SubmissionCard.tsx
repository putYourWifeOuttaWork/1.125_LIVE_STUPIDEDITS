import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Thermometer, 
  Droplets, 
  FileText, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  User, 
  Hash,
  Wind,
  Ruler,
  CloudRain,
  Sun,
  Cloud,
  ArrowRight,
  Download,
  BarChart
} from 'lucide-react';
import Card, { CardHeader, CardContent, CardFooter } from '../common/Card';
import Button from '../common/Button';
import { format } from 'date-fns';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import SubmissionAnalysis from './SubmissionAnalysis';
import { toast } from 'react-toastify';

interface SubmissionCardProps {
  submission: any;
  onDelete: (submission: any) => void;
  canDelete: boolean;
  sessionStatus?: string;
  lastActivityTime?: string;
  testId?: string;
}

const SubmissionCard = ({ submission, onDelete, canDelete, sessionStatus, lastActivityTime, testId }: SubmissionCardProps) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Skip rendering if this is a cancelled session
  if (sessionStatus === 'Cancelled') {
    return null;
  }

  const handleViewSubmission = () => {
    navigate(`/programs/${submission.program_id}/sites/${submission.site_id}/submissions/${submission.submission_id}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(submission);
  };
  
  const handleCardHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from propagating to the card
    setIsExpanded(!isExpanded);
  };

  const handleAnalysisClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAnalysis(!showAnalysis);
  };

  const handleGenerateReport = async () => {
    try {
      setIsGeneratingReport(true);
      
      // Call Supabase RPC function to generate the report
      const { supabase } = await import('../../lib/supabaseClient');
      const { data, error } = await supabase.rpc('export_submission_report_csv', {
        p_submission_id: submission.submission_id
      });
      
      if (error) {
        throw error;
      }
      
      if (data) {
        // Create a blob and download it
        const blob = new Blob([data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `submission-${submission.global_submission_id || submission.submission_id}-report.csv`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success('Report generated and downloaded successfully');
      } else {
        toast.error('No data returned from server');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error(`Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Get weather icon component based on weather value
  const getWeatherIcon = () => {
    switch (submission.weather) {
      case 'Clear':
        return <Sun className="text-yellow-500 mr-2" size={18} />;
      case 'Cloudy':
        return <Cloud className="text-gray-500 mr-2" size={18} />;
      case 'Rain':
        return <CloudRain className="text-blue-500 mr-2" size={18} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Card 
        className="mb-3 transition-all hover:shadow-md"
        testId={testId || `submission-card-${submission.submission_id}`}
        onClick={() => handleViewSubmission(submission)}
      >
        <CardHeader 
          className="flex justify-between items-center cursor-pointer p-3 md:p-4"
          onClick={handleCardHeaderClick}
          testId={`submission-header-${submission.submission_id}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <h3 className="text-base md:text-lg font-medium">
              Submission from {format(new Date(submission.created_at), 'MMM d, yyyy, h:mm a')}
            </h3>
            <div className="flex items-center gap-1">
              {submission.global_submission_id && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                  <Hash size={12} className="mr-1" />
                  {submission.global_submission_id}
                </span>
              )}
              {sessionStatus && sessionStatus !== 'Cancelled' && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  sessionStatus === 'Completed' ? 'bg-success-100 text-success-800' :
                  sessionStatus === 'Working' ? 'bg-secondary-100 text-secondary-800' :
                  sessionStatus === 'Escalated' ? 'bg-warning-100 text-warning-800' :
                  sessionStatus === 'Expired' ? 'bg-gray-100 text-gray-800' :
                  'bg-primary-100 text-primary-800'
                }`}>
                  {sessionStatus}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1 md:space-x-2">
              <span className="pill bg-primary-100 text-primary-800" data-testid={`submission-petri-count-${submission.submission_id}`}>
                {submission.petri_count} {submission.petri_count === 1 ? 'Petri' : 'Petris'}
              </span>
              {submission.gasifier_count !== undefined && (
                <span className="pill bg-accent-100 text-accent-800" data-testid={`submission-gasifier-count-${submission.submission_id}`}>
                  {submission.gasifier_count} {submission.gasifier_count === 1 ? 'Gasifier' : 'Gasifiers'}
                </span>
              )}
            </div>
            {isExpanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </div>
        </CardHeader>
        
        {isExpanded && (
          <>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 animate-fade-in p-3 md:p-4" testId={`submission-details-${submission.submission_id}`}>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Environment</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Thermometer className="text-error-500 mr-2" size={18} />
                    <div className="text-sm">
                      <span className="text-gray-500">Outdoor:</span> 
                      <span className="ml-1 font-medium">{submission.temperature}°F</span>
                      <span className="mx-1 text-gray-400">|</span>
                      <span className="text-gray-500">Indoor:</span> 
                      <span className="ml-1 font-medium">
                        {submission.indoor_temperature ? `${submission.indoor_temperature}°F` : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Droplets className="text-secondary-500 mr-2" size={18} />
                    <div className="text-sm">
                      <span className="text-gray-500">Outdoor:</span> 
                      <span className="ml-1 font-medium">{submission.humidity}%</span>
                      <span className="mx-1 text-gray-400">|</span>
                      <span className="text-gray-500">Indoor:</span> 
                      <span className="ml-1 font-medium">
                        {submission.indoor_humidity ? `${submission.indoor_humidity}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {getWeatherIcon()}
                    <div className="text-sm">
                      <span className="text-gray-500">Weather:</span> 
                      <span className="ml-1 font-medium">{submission.weather}</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Wind className="text-primary-500 mr-2" size={18} />
                    <div className="text-sm">
                      <span className="text-gray-500">Airflow:</span> 
                      <span className="ml-1 font-medium">{submission.airflow}</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Ruler className="text-primary-500 mr-2" size={18} />
                    <div className="text-sm">
                      <span className="text-gray-500">Odor Distance:</span> 
                      <span className="ml-1 font-medium">{submission.odor_distance}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Details</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Calendar className="text-primary-500 mr-2" size={18} />
                    <span className="text-sm">
                      {format(new Date(submission.created_at), 'PPp')}
                    </span>
                  </div>
                  {submission.created_by && (
                    <div className="flex items-center">
                      <User className="text-primary-500 mr-2" size={18} />
                      <span className="text-sm">
                        {submission.created_by_name || 'User'}
                      </span>
                    </div>
                  )}
                  {lastActivityTime && (
                    <div className="flex items-center">
                      <Calendar className="text-primary-500 mr-2" size={18} />
                      <div className="text-sm">
                        <span className="text-gray-500">Last activity:</span>
                        <span className="ml-1 font-medium">
                          {format(new Date(lastActivityTime), 'Pp')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Observations Summary */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Observations</h4>
                <div className="space-y-2">
                  <div className="p-2 bg-primary-50 rounded-md border border-primary-100">
                    <div className="flex justify-between">
                      <span className="text-sm text-primary-800">Petri Samples:</span>
                      <span className="font-medium">{submission.petri_count}</span>
                    </div>
                  </div>
                  <div className="p-2 bg-accent-50 rounded-md border border-accent-100">
                    <div className="flex justify-between">
                      <span className="text-sm text-accent-800">Gasifier Samples:</span>
                      <span className="font-medium">{submission.gasifier_count || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {submission.notes && (
                <div className="md:col-span-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Notes</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border border-gray-100">
                    {submission.notes}
                  </p>
                </div>
              )}

              {/* Analysis Button */}
              <div className="md:col-span-3 mt-2">
                <Button 
                  variant={showAnalysis ? "primary" : "outline"}
                  onClick={handleAnalysisClick}
                  icon={<BarChart size={16} />}
                  className="w-full"
                  testId={`analysis-button-${submission.submission_id}`}
                >
                  {showAnalysis ? "Hide Analysis" : "Show Analysis"}
                </Button>
              </div>

              {/* Analysis Section */}
              {showAnalysis && (
                <div className="md:col-span-3 mt-2 animate-fade-in">
                  <SubmissionAnalysis 
                    submission={submission}
                    programId={submission.program_id}
                    siteId={submission.site_id}
                  />
                  
                  <div className="mt-4">
                    <Button 
                      variant="secondary" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateReport();
                      }}
                      icon={<Download size={16} />}
                      isLoading={isGeneratingReport}
                      className="w-full"
                      testId={`generate-report-button-${submission.submission_id}`}
                    >
                      Generate Report
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex justify-end space-x-3 p-3 md:p-4" testId={`submission-footer-${submission.submission_id}`}>
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-error-600 hover:text-error-700 hover:bg-error-50 border-error-300"
                  onClick={handleDeleteClick}
                  icon={<Trash2 size={16} />}
                  testId={`delete-submission-${submission.submission_id}`}
                >
                  Delete
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleViewSubmission}
                icon={<ArrowRight size={16} />}
                testId={`view-submission-${submission.submission_id}`}
              >
                View Details
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
      
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Submission"
        message={`Are you sure you want to delete this submission ${submission.global_submission_id ? `(#${submission.global_submission_id})` : ''} from ${format(new Date(submission.created_at), 'PPp')}? This will also delete all associated petri observations, gasifier observations, and images. This action cannot be undone.`}
        confirmText="Delete Submission"
      />
    </>
  );
};

export default SubmissionCard;