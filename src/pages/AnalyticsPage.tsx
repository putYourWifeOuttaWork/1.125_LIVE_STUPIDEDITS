import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  LineChart,
  Plus,
  Search,
  TrendingUp,
  Grid3x3,
  Trash2,
  Copy,
  Edit,
  Eye,
} from 'lucide-react';
import { fetchReports, deleteReport } from '../services/analyticsService';
import { useActiveCompany } from '../hooks/useActiveCompany';
import { useUserRole } from '../hooks/useUserRole';
import useCompanies from '../hooks/useCompanies';
import { CustomReport, ReportType } from '../types/analytics';
import Card, { CardContent } from '../components/common/Card';
import Button from '../components/common/Button';
import DeleteConfirmModal from '../components/common/DeleteConfirmModal';
import { toast } from 'react-toastify';

const reportTypeIcons: Record<ReportType, React.ReactNode> = {
  line: <LineChart className="w-5 h-5" />,
  bar: <BarChart3 className="w-5 h-5" />,
  dot: <TrendingUp className="w-5 h-5" />,
  heatmap: <Grid3x3 className="w-5 h-5" />,
  heatmap_temporal: <Grid3x3 className="w-5 h-5" />,
};

const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeCompanyId } = useActiveCompany();
  const { isSuperAdmin } = useUserRole();
  const { isAdmin: isCompanyAdmin } = useCompanies();
  const canManageReports = isSuperAdmin || isCompanyAdmin;
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<CustomReport | null>(null);

  const {
    data: reports = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['analytics-reports', activeCompanyId],
    queryFn: () => fetchReports(activeCompanyId!),
    enabled: !!activeCompanyId,
  });

  const filteredReports = reports.filter(
    (report) =>
      report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteClick = (report: CustomReport) => {
    setReportToDelete(report);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reportToDelete) return;

    try {
      await deleteReport(reportToDelete.report_id, activeCompanyId || undefined);
      toast.success('Report deleted successfully');
      refetch();
      setDeleteModalOpen(false);
      setReportToDelete(null);
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Failed to delete report');
    }
  };

  const handleClone = (reportId: string) => {
    navigate(`/analytics/builder?clone=${reportId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create and manage custom reports and visualizations
          </p>
        </div>
        {canManageReports && (
          <Button onClick={() => navigate('/analytics/builder')} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Report
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reports found</h3>
            <p className="text-gray-600 mb-4">
              {searchQuery
                ? 'No reports match your search criteria'
                : 'Get started by creating your first report'}
            </p>
            {canManageReports && !searchQuery && (
              <Button onClick={() => navigate('/analytics/builder')}>Create Your First Report</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => (
            <Card key={report.report_id} className="hover:shadow-lg transition-shadow">
              <CardContent>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                    {reportTypeIcons[report.configuration.reportType] || <BarChart3 className="w-5 h-5" />}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/analytics/${report.report_id}`)}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      title="View report"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {canManageReports && (
                      <>
                        <button
                          onClick={() => handleClone(report.report_id)}
                          className="text-gray-400 hover:text-green-600 transition-colors"
                          title="Clone report"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/analytics/${report.report_id}/edit`)}
                          className="text-gray-400 hover:text-yellow-600 transition-colors"
                          title="Edit report"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(report)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete report"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
                  {report.name}
                </h3>
                {report.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{report.description}</p>
                )}

                <div className="space-y-2 text-xs text-gray-500">
                  <div className="flex items-center justify-between">
                    <span>Type:</span>
                    <span className="font-medium capitalize">{report.configuration.reportType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Granularity:</span>
                    <span className="font-medium capitalize">
                      {report.configuration.timeGranularity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Created by:</span>
                    <span className="font-medium">{report.created_by_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Created:</span>
                    <span className="font-medium">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/analytics/${report.report_id}`)}
                  className="mt-4 w-full py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                >
                  View Report
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {reportToDelete && (
        <DeleteConfirmModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setReportToDelete(null);
          }}
          onConfirm={handleDeleteConfirm}
          itemName={reportToDelete.name}
          itemType="report"
        />
      )}
    </div>
  );
};

export default AnalyticsPage;
