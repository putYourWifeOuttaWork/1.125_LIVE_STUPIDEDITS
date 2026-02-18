import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import Card, { CardHeader, CardContent } from '../common/Card';
import { LineChartWithBrush } from '../analytics/LineChartWithBrush';
import type { MetricAxisInfo } from '../analytics/LineChartWithBrush';
import DrillDownPanel from '../analytics/DrillDownPanel';
import { useReportData, useDrillDown } from '../../hooks/useReportData';
import { useActiveCompany } from '../../hooks/useActiveCompany';
import {
  buildAlertInvestigationConfig,
  getCategoryLabel,
  getSeverityColor,
} from '../../utils/alertInvestigation';
import type { DeviceAlert } from '../../types/alerts';
import {
  groupMetricsByScale,
  METRIC_LABELS,
  METRIC_UNITS,
} from '../../types/analytics';
import type { MetricType } from '../../types/analytics';

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
  } = useReportData(reportConfig || {
    reportType: 'line',
    name: '',
    timeRange: 'last_30d',
    timeGranularity: 'day',
    programIds: [],
    siteIds: [],
    deviceIds: [],
    metrics: [],
    enableComparison: false,
  }, !!reportConfig);

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

  const handleOpenFullReport = () => {
    navigate('/analytics/new', {
      state: { prefillConfig: reportConfig },
    });
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
                {alert.actual_value !== null && alert.threshold_value !== null && (
                  <span>
                    Value: <strong className="text-gray-700">{alert.actual_value}</strong>
                    {' '}(threshold: {alert.threshold_value})
                  </span>
                )}
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Full Report
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
        {error && (
          <div className="text-center py-8 text-red-600">
            <p className="font-medium">Failed to load chart data</p>
            <p className="text-sm mt-1">{(error as Error).message}</p>
          </div>
        )}

        {!error && (
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
              loading={isLoading || isFetching}
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
