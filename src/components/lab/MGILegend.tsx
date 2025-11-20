import { useMemo } from 'react';
import * as d3 from 'd3';
import { getMGIColor as utilsGetMGIColor, getMGILevel } from '../../utils/mgiUtils';

interface MGILegendProps {
  className?: string;
}

// Re-export utilities for backward compatibility
export { getMGIColor, formatMGI, formatVelocity, formatSpeed, getMGILevel, getMGILevelDescription, shouldShowVelocityPulse, getVelocityPulseRadius, getVelocityPulseDuration } from '../../utils/mgiUtils';

// Wrapper to use utils function
function getMGIColor(mgiScore: number | null): string {
  return utilsGetMGIColor(mgiScore);
}

// Get risk level text based on MGI score (backward compatibility)
export function getMGIRiskLevel(mgiScore: number | null): string {
  if (mgiScore === null || mgiScore === undefined) return 'Unknown';
  const level = getMGILevel(mgiScore);

  const levelMap = {
    healthy: 'Low',
    warning: 'Moderate',
    concerning: 'High',
    critical: 'Critical',
  };

  return levelMap[level];
}

export function MGILegend({ className = '' }: MGILegendProps) {
  const gradientStops = useMemo(() => {
    const stops = [];
    for (let i = 0; i <= 100; i += 5) {
      const value = i / 100;
      const color = getMGIColor(value);
      stops.push({ offset: `${i}%`, color });
    }
    return stops;
  }, []);

  const legendItems = [
    { value: 0.0, label: 'Healthy (0-30%)', color: getMGIColor(0.15) },
    { value: 0.3, label: 'Warning (31-50%)', color: getMGIColor(0.40) },
    { value: 0.5, label: 'Concerning (51-65%)', color: getMGIColor(0.58) },
    { value: 0.65, label: 'Critical (65%+)', color: getMGIColor(0.80) },
  ];

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        MGI Risk Level
      </h3>

      {/* Continuous gradient bar */}
      <div className="mb-4">
        <svg width="100%" height="24" className="rounded">
          <defs>
            <linearGradient id="mgi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              {gradientStops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="24"
            fill="url(#mgi-gradient)"
            rx="4"
          />
        </svg>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>0.0</span>
          <span>0.5</span>
          <span>1.0</span>
        </div>
      </div>

      {/* Discrete legend items */}
      <div className="space-y-2">
        {legendItems.map((item) => (
          <div key={item.value} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-gray-300"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-gray-700">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full border border-gray-300"
            style={{ backgroundColor: '#9ca3af' }}
          />
          <span className="text-sm text-gray-700">No Data</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <p>
          <strong>MGI (Microbial Growth Index):</strong> Composite metric
          indicating microbial risk level based on environmental conditions and
          visual observations.
        </p>
      </div>
    </div>
  );
}
