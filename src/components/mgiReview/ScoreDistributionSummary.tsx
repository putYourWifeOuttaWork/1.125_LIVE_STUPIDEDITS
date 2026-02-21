import type { ScoreDistribution } from '../../hooks/useScoreBrowser';

interface Props {
  distribution: ScoreDistribution | undefined;
  isLoading: boolean;
}

export default function ScoreDistributionSummary({ distribution, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
        <div className="flex gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-1 h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!distribution || distribution.total === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-500">
        No scored images found for the selected filters.
      </div>
    );
  }

  const { total, healthy, warning, concerning, critical, avgScore, pendingReview, overridden } = distribution;

  const segments = [
    { label: 'Healthy', count: healthy, pct: (healthy / total) * 100, color: 'bg-emerald-500', textColor: 'text-emerald-700', bgLight: 'bg-emerald-50' },
    { label: 'Warning', count: warning, pct: (warning / total) * 100, color: 'bg-amber-400', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
    { label: 'Concerning', count: concerning, pct: (concerning / total) * 100, color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
    { label: 'Critical', count: critical, pct: (critical / total) * 100, color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm text-gray-500">Total Scored</span>
            <p className="text-lg font-bold text-gray-900">{total.toLocaleString()}</p>
          </div>
          <div className="h-8 border-r border-gray-200" />
          <div>
            <span className="text-sm text-gray-500">Avg Score</span>
            <p className="text-lg font-bold text-gray-900">{(avgScore * 100).toFixed(1)}%</p>
          </div>
          {pendingReview > 0 && (
            <>
              <div className="h-8 border-r border-gray-200" />
              <div>
                <span className="text-sm text-gray-500">Pending Review</span>
                <p className="text-lg font-bold text-amber-600">{pendingReview}</p>
              </div>
            </>
          )}
          {overridden > 0 && (
            <>
              <div className="h-8 border-r border-gray-200" />
              <div>
                <span className="text-sm text-gray-500">Overridden</span>
                <p className="text-lg font-bold text-blue-600">{overridden}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-3">
        {segments.map(seg => (
          seg.pct > 0 && (
            <div
              key={seg.label}
              className={`${seg.color} transition-all duration-300`}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
            />
          )
        ))}
      </div>

      <div className="flex gap-4">
        {segments.map(seg => (
          <div key={seg.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${seg.bgLight}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
            <span className={`text-xs font-medium ${seg.textColor}`}>
              {seg.label}: {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
