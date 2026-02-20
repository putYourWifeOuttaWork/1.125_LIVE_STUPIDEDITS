import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  Clock,
  RefreshCw,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import Card, { CardHeader, CardContent } from '../common/Card';
import { LineChartWithBrush } from '../analytics/LineChartWithBrush';
import type { MetricAxisInfo, ChartAnnotation } from '../analytics/LineChartWithBrush';
import DrillDownPanel from '../analytics/DrillDownPanel';
import { useReportData, useDrillDown } from '../../hooks/useReportData';
import { useActiveCompany } from '../../hooks/useActiveCompany';
import { createDraftReportFromAlert } from '../../services/analyticsService';
import {
  buildAlertInvestigationConfig,
  getCategoryLabel,
  getSeverityColor,
  getAlertMetricInfo,
} from '../../utils/alertInvestigation';
import type { DeviceAlert } from '../../types/alerts';
import {
  groupMetricsByScale,
  METRIC_LABELS,
  METRIC_UNITS,
} from '../../types/analytics';
import type { MetricType, ReportConfiguration, SerializedChartAnnotation } from '../../types/analytics';

const LOADING_TIMEOUT_MS = 15_000;

const DISABLED_CONFIG: ReportConfiguration = {
  reportType: 'line',
  name: '',
  timeRange: 'last_30d',
  timeGranularity: 'day',
  programIds: [],
  siteIds: [],
  deviceIds: [],
  metrics: [],
  enableComparison: false,
};

interface AlertInvestigationPanelProps {
  alert: DeviceAlert;
  onClose: () => void;
}

export default function AlertInvestigationPanel({
  alert,
  onClose,
}: AlertInvestigationPanelProps) {
  const navigate = useNavigate();
  const { activeCompanyId } = useActiveCompany();
  const [brushRange, setBrushRange] = useState<[Date, Date] | null>(null);
  const [drillOffset, setDrillOffset] = useState(0);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const investigationConfig = useMemo(
    () => buildAlertInvestigationConfig(alert),
    [alert]
  );

  const reportConfig = investigationConfig?.reportConfig;
  const annotations = investigationConfig?.annotations || [];

  const {
    lineChartData,
    isLoading,
    isFetching,
    error,
    refresh,
  } = useReportData(reportConfig || DISABLED_CONFIG, !!reportConfig);

  const chartLoading = isLoading || isFetching;

  useEffect(() => {
    if (chartLoading && !loadingTimedOut) {
      timeoutRef.current = setTimeout(() => {
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);
    } else if (!chartLoading) {
      setLoadingTimedOut(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [chartLoading, loadingTimedOut]);

  const handleRetry = () => {
    setLoadingTimedOut(false);
    refresh();
  };

  const drillDown = useDrillDown(
    activeCompanyId,
    brushRange?.[0] || null,
    brushRange?.[1] || null,
    {
      deviceIds: [alert.device_id],
      siteIds: alert.site_id ? [alert.site_id] : undefined,
      programIds: alert.program_id ? [alert.program_id] : undefined,
      offset: drillOffset,
    }
  );

  const metricInfo: MetricAxisInfo[] = useMemo(() => {
    if (!reportConfig) return [];

    const metricTypes = reportConfig.metrics.map(m => m.type);
    const groups = groupMetricsByScale(metricTypes);

    return reportConfig.metrics.map(m => ({
      name: m.type,
      label: METRIC_LABELS[m.type] || m.type,
      unit: METRIC_UNITS[m.type] || '',
      axis: (groups.secondary.includes(m.type) ? 'secondary' : 'primary') as 'primary' | 'secondary',
    }));
  }, [reportConfig]);

  const handleBrush = (range: [Date, Date]) => {
    setBrushRange(range);
    setDrillOffset(0);
  };

  const handleLoadMore = () => {
    setDrillOffset(prev => prev + 50);
  };

  const [creatingReport, setCreatingReport] = useState(false);

  function serializeAnnotations(anns: ChartAnnotation[]): SerializedChartAnnotation[] {
    return anns.map(a => ({
      ...a,
      timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : a.timestamp,
      startTimestamp: a.startTimestamp instanceof Date ? a.startTimestamp.toISOString() : a.startTimestamp,
      endTimestamp: a.endTimestamp instanceof Date ? a.endTimestamp.toISOString() : a.endTimestamp,
    }));
  }

  const handleOpenFullReport = async () => {
    if (!activeCompanyId || !reportConfig) return;
    setCreatingReport(true);
    try {
      const draftReport = await createDraftReportFromAlert(
        activeCompanyId,
        {
          alert_id: alert.alert_id,
          message: alert.message,
          severity: alert.severity,
          alert_category: alert.alert_category,
          device_code: alert.metadata?.device_code,
          site_name: alert.site_name || undefined,
        },
        reportConfig,
        serializeAnnotations(annotations)
      );
      navigate(`/analytics/${draftReport.report_id}`);
    } catch (err: any) {
      console.error('Failed to create draft report:', err);
      toast.error('Failed to generate report');
    } finally {
      setCreatingReport(false);
    }
  };

  if (!investigationConfig) {
    return (
      <Card className="border-l-4 border-l-gray-400">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">System Alert</p>
          <p className="text-sm text-gray-500 mt-1">
            System alerts do not have contextual chart data. Use the session view for more details.
          </p>
          <button
            onClick={onClose}
            className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Dismiss
          </button>
        </CardContent>
      </Card>
    );
  }

  const severityColorClass = alert.severity === 'critical'
    ? 'border-l-red-600'
    : alert.severity === 'error'
    ? 'border-l-orange-500'
    : alert.severity === 'warning'
    ? 'border-l-yellow-500'
    : 'border-l-blue-500';

  return (
    <Card className={`border-l-4 ${severityColorClass}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg mt-0.5"
              style={{ backgroundColor: `${getSeverityColor(alert.severity)}15` }}
            >
              <TrendingUp
                className="w-5 h-5"
                style={{ color: getSeverityColor(alert.severity) }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  Alert Investigation
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold uppercase"
                  style={{
                    backgroundColor: `${getSeverityColor(alert.severity)}15`,
                    color: getSeverityColor(alert.severity),
                  }}
                >
                  {alert.severity}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                  {getCategoryLabel(alert.alert_category)}
                </span>
              </div>
              <p className="text-sm text-gray-700">{alert.message}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                <span>
                  Device: <strong className="text-gray-700">{alert.metadata?.device_code || 'Unknown'}</strong>
                </span>
                <span>
                  Site: <strong className="text-gray-700">{alert.site_name || 'Unknown'}</strong>
                </span>
                {alert.actual_value !== null && alert.threshold_value !== null && (() => {
                  const info = getAlertMetricInfo(alert);
                  const displayVal = (alert.actual_value * info.scale).toFixed(1);
                  const displayThresh = (alert.threshold_value * info.scale).toFixed(1);
                  return (
                    <span>
                      Value: <strong className="text-red-600">{displayVal}{info.unit}</strong>
                      {' '}(threshold: {displayThresh}{info.unit})
                    </span>
                  );
                })()}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(alert.triggered_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenFullReport}
              disabled={creatingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingReport ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              {creatingReport ? 'Generating...' : 'Open Full Report'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Close investigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {error && !chartLoading && (
          <div className="text-center py-8 text-red-600">
            <p className="font-medium">Failed to load chart data</p>
            <p className="text-sm mt-1">{(error as Error).message}</p>
            <button
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {loadingTimedOut && (
          <div className="text-center py-8">
            <WifiOff className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">Chart data is taking longer than expected</p>
            <p className="text-sm text-gray-500 mt-1">
              This may be due to a connectivity issue. You can retry or dismiss this alert.
            </p>
            <button
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        )}

        {!error && !loadingTimedOut && (
          <div className="space-y-4">
            <LineChartWithBrush
              data={lineChartData || { timestamps: [], series: [] }}
              height={350}
              title={investigationConfig.chartTitle}
              yAxisLabel={investigationConfig.yAxisLabel}
              secondaryYAxisLabel={investigationConfig.secondaryYAxisLabel}
              metricInfo={metricInfo}
              annotations={annotations}
              onBrushEnd={handleBrush}
              loading={chartLoading}
            />

            {brushRange && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-600">
                    Drill-down: {format(brushRange[0], 'MMM d, h:mm a')} - {format(brushRange[1], 'MMM d, h:mm a')}
                  </p>
                  <button
                    onClick={() => { setBrushRange(null); setDrillOffset(0); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear selection
                  </button>
                </div>
                <DrillDownPanel
                  records={drillDown.data?.records || []}
                  hasMore={drillDown.data?.hasMore || false}
                  loading={drillDown.isLoading || drillDown.isFetching}
                  onLoadMore={handleLoadMore}
                  title="Alert Context Details"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
