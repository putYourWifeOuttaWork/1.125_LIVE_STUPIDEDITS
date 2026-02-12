import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Eye, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import ReportConfigPanel from '../components/analytics/ReportConfigPanel';
import { LineChartWithBrush } from '../components/analytics/LineChartWithBrush';
import { BarChartWithBrush } from '../components/analytics/BarChartWithBrush';
import HeatmapChart from '../components/analytics/HeatmapChart';
import { useReportData } from '../hooks/useReportData';
import { useActiveCompany } from '../hooks/useActiveCompany';
import {
  ReportConfiguration,
  DEFAULT_REPORT_CONFIG,
  METRIC_LABELS,
} from '../types/analytics';
import {
  createReport,
  updateReport,
  fetchReportById,
} from '../services/analyticsService';
import Button from '../components/common/Button';

export default function ReportBuilderPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [searchParams] = useSearchParams();
  const cloneId = searchParams.get('clone');
  const isEditMode = !!reportId;
  const { activeCompanyId } = useActiveCompany();

  const [config, setConfig] = useState<ReportConfiguration>({
    ...DEFAULT_REPORT_CONFIG,
  });
  const [saving, setSaving] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [chartWidth, setChartWidth] = useState(700);

  const { data: existingReport, isLoading: loadingReport } = useQuery({
    queryKey: ['report-detail', reportId || cloneId],
    queryFn: () => fetchReportById((reportId || cloneId)!),
    enabled: !!(reportId || cloneId),
  });

  useEffect(() => {
    if (existingReport) {
      const loadedConfig = { ...existingReport.configuration };
      if (cloneId) {
        loadedConfig.name = `Copy of ${loadedConfig.name}`;
      }
      setConfig(loadedConfig);
      setPreviewEnabled(true);
    }
  }, [existingReport, cloneId]);

  const { lineChartData, barChartData, heatmapData, isLoading: dataLoading } =
    useReportData(config, previewEnabled);

  const handlePreviewResize = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(Math.max(400, entry.contentRect.width - 48));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleSave = async (andView = false) => {
    if (!activeCompanyId) {
      toast.error('No active company selected');
      return;
    }
    if (!config.name.trim()) {
      toast.error('Please enter a report name');
      return;
    }

    setSaving(true);
    try {
      let savedReport;
      if (isEditMode && reportId) {
        savedReport = await updateReport(reportId, {
          name: config.name,
          description: config.description,
          configuration: config,
        });
      } else {
        savedReport = await createReport(
          activeCompanyId,
          config.name,
          config,
          config.description,
          config.programIds[0]
        );
      }

      toast.success(
        isEditMode ? 'Report updated' : 'Report created'
      );

      if (andView && savedReport) {
        navigate(`/analytics/${savedReport.report_id}`);
      } else {
        navigate('/analytics');
      }
    } catch (err) {
      toast.error('Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const primaryMetricLabel =
    config.metrics.length > 0
      ? METRIC_LABELS[config.metrics[0].type]
      : 'Value';

  if (loadingReport) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analytics')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode
                ? 'Edit Report'
                : cloneId
                  ? 'Clone Report'
                  : 'Create Report'}
            </h1>
            <p className="text-sm text-gray-500">
              Configure your visualization and save
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/analytics')}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving || !config.name.trim()}
            size="sm"
            icon={<Save className="w-4 h-4" />}
          >
            Save
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving || !config.name.trim()}
            size="sm"
            icon={<Eye className="w-4 h-4" />}
            isLoading={saving}
          >
            Save & View
          </Button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="w-80 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-4 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          <ReportConfigPanel config={config} onChange={setConfig} />

          {!previewEnabled && (
            <div className="mt-4">
              <Button
                onClick={() => setPreviewEnabled(true)}
                fullWidth
                size="sm"
              >
                Load Preview
              </Button>
            </div>
          )}
        </div>

        <div
          ref={handlePreviewResize}
          className="flex-1 min-w-0 bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {config.name || 'Report Preview'}
            </h2>
            {dataLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading data...
              </div>
            )}
          </div>

          {!previewEnabled ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Eye className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Configure your report
              </h3>
              <p className="text-sm text-gray-500 max-w-md">
                Select programs, sites, devices, time range, and metrics in the
                panel on the left, then click "Load Preview" to see your data
                visualized.
              </p>
            </div>
          ) : config.reportType === 'line' || config.reportType === 'dot' ? (
            <LineChartWithBrush
              data={
                lineChartData || { timestamps: [], series: [] }
              }
              width={chartWidth}
              height={420}
              yAxisLabel={primaryMetricLabel}
              loading={dataLoading}
            />
          ) : config.reportType === 'bar' ? (
            <BarChartWithBrush
              data={
                barChartData || { labels: [], datasets: [] }
              }
              width={chartWidth}
              height={420}
              yAxisLabel={primaryMetricLabel}
              loading={dataLoading}
            />
          ) : config.reportType === 'heatmap_temporal' ? (
            <HeatmapChart
              data={heatmapData}
              width={chartWidth}
              height={Math.max(300, 420)}
              loading={dataLoading}
              yLabel={
                config.groupBy === 'device'
                  ? 'Devices'
                  : config.groupBy === 'site'
                    ? 'Sites'
                    : 'Programs'
              }
              xLabel="Time Period"
            />
          ) : (
            <div className="text-center py-20 text-gray-500">
              Select a visualization type to begin
            </div>
          )}

          {config.description && previewEnabled && (
            <p className="mt-4 text-sm text-gray-500 italic">
              {config.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
