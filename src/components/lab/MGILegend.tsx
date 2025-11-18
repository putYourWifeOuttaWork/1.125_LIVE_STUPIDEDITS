import { useMemo } from 'react';
import * as d3 from 'd3';

interface MGILegendProps {
  className?: string;
}

// MGI color scale: 0 (green) -> 1 (red)
export function getMGIColor(mgiScore: number | null): string {
  if (mgiScore === null || mgiScore === undefined) {
    return '#9ca3af'; // gray-400 for no data
  }

  // Clamp between 0 and 1
  const clamped = Math.max(0, Math.min(1, mgiScore));

  // Create color scale: green -> yellow -> orange -> red
  const colorScale = d3.scaleLinear<string>()
    .domain([0, 0.3, 0.6, 0.85, 1.0])
    .range(['#10b981', '#fbbf24', '#f97316', '#ef4444', '#991b1b']);

  return colorScale(clamped);
}

// Get risk level text based on MGI score
export function getMGIRiskLevel(mgiScore: number | null): string {
  if (mgiScore === null || mgiScore === undefined) return 'Unknown';
  if (mgiScore < 0.3) return 'Low';
  if (mgiScore < 0.6) return 'Moderate';
  if (mgiScore < 0.85) return 'High';
  return 'Critical';
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
    { value: 0.0, label: 'Low (0.0)', color: getMGIColor(0.0) },
    { value: 0.3, label: 'Moderate (0.3)', color: getMGIColor(0.3) },
    { value: 0.6, label: 'High (0.6)', color: getMGIColor(0.6) },
    { value: 0.85, label: 'Critical (0.85+)', color: getMGIColor(0.85) },
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
