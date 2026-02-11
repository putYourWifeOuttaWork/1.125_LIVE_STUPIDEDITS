import { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  timestamp: Date;
  value: number | null;
  deviceCode?: string;
}

interface TimeSeriesChartProps {
  data: DataPoint[];
  title: string;
  yAxisLabel: string;
  unit: string;
  color?: string;
  height?: number;
  showDeviceBreakdown?: boolean;
  deviceColorMap?: Record<string, string>;
  thresholds?: Array<{ value: number; label: string; color: string }>;
}

export default function TimeSeriesChart({
  data,
  title,
  yAxisLabel,
  unit,
  color = '#3b82f6',
  height = 300,
  showDeviceBreakdown = false,
  deviceColorMap = {},
  thresholds = [],
}: TimeSeriesChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter valid data
  const validData = useMemo(
    () => data.filter(d => d.value !== null && !isNaN(d.value as number)),
    [data],
  );

  // Extract unique device codes
  const deviceCodes = useMemo(() => {
    const codes = new Set<string>();
    validData.forEach(d => {
      if (d.deviceCode) codes.add(d.deviceCode);
    });
    return Array.from(codes).sort();
  }, [validData]);

  // Determine if this is a multi-device chart
  const isMultiDevice = showDeviceBreakdown && deviceCodes.length > 1;

  // Calculate per-device statistics for footer
  const perDeviceStats = useMemo(() => {
    if (!isMultiDevice) return null;

    const stats: Record<string, { count: number; min: number; max: number }> = {};
    validData.forEach(d => {
      const code = d.deviceCode || 'unknown';
      if (!stats[code]) {
        stats[code] = { count: 0, min: Infinity, max: -Infinity };
      }
      stats[code].count++;
      stats[code].min = Math.min(stats[code].min, d.value as number);
      stats[code].max = Math.max(stats[code].max, d.value as number);
    });

    return stats;
  }, [validData, isMultiDevice]);

  // Get device color with fallback
  const getDeviceColor = (code: string): string => {
    if (deviceColorMap[code]) return deviceColorMap[code];
    const fallback = d3.scaleOrdinal(d3.schemeCategory10);
    return fallback(code);
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || validData.length === 0) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const containerWidth = container.clientWidth;

    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    svg.selectAll('*').remove();

    const g = svg
      .attr('width', containerWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    if (validData.length === 0) {
      g.append('text')
        .attr('x', width / 2)
        .attr('y', chartHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'text-sm fill-gray-500')
        .text('No data available');
      return;
    }

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(validData, d => d.timestamp) as [Date, Date])
      .range([0, width]);

    const yMin = d3.min(validData, d => d.value as number)!;
    const yMax = d3.max(validData, d => d.value as number)!;
    const yPadding = (yMax - yMin) * 0.1 || 1;

    const yScale = d3
      .scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .range([chartHeight, 0])
      .nice();

    // Grid lines (drawn first so they're behind everything)
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        d3.axisLeft(yScale)
          .ticks(6)
          .tickSize(-width)
          .tickFormat(() => '' as any)
      )
      .selectAll('line')
      .attr('stroke', '#9ca3af');

    // Threshold lines
    thresholds.forEach(threshold => {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', yScale(threshold.value))
        .attr('y2', yScale(threshold.value))
        .attr('stroke', threshold.color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.6);

      g.append('text')
        .attr('x', width - 5)
        .attr('y', yScale(threshold.value) - 5)
        .attr('text-anchor', 'end')
        .attr('class', 'text-xs font-medium')
        .attr('fill', threshold.color)
        .text(threshold.label);
    });

    const timeFormat = d3.timeFormat('%H:%M');

    // Multi-device rendering
    if (isMultiDevice) {
      const deviceGroups = d3.group(validData, d => d.deviceCode || 'unknown');

      deviceGroups.forEach((rawDeviceData, deviceCode) => {
        // Sort data by timestamp to prevent zigzag
        const deviceData = [...rawDeviceData].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );
        const deviceColor = getDeviceColor(deviceCode);

        // Area fill
        const area = d3
          .area<DataPoint>()
          .x(d => xScale(d.timestamp))
          .y0(chartHeight)
          .y1(d => yScale(d.value as number))
          .curve(d3.curveMonotoneX);

        g.append('path')
          .datum(deviceData)
          .attr('fill', deviceColor)
          .attr('fill-opacity', 0.08)
          .attr('d', area);

        // Line
        const line = d3
          .line<DataPoint>()
          .x(d => xScale(d.timestamp))
          .y(d => yScale(d.value as number))
          .curve(d3.curveMonotoneX);

        g.append('path')
          .datum(deviceData)
          .attr('fill', 'none')
          .attr('stroke', deviceColor)
          .attr('stroke-width', 2)
          .attr('d', line);

        // Data points with tooltips
        g.selectAll(`.data-point-${deviceCode.replace(/[^a-zA-Z0-9]/g, '_')}`)
          .data(deviceData)
          .enter()
          .append('circle')
          .attr('class', `data-point-${deviceCode.replace(/[^a-zA-Z0-9]/g, '_')}`)
          .attr('cx', d => xScale(d.timestamp))
          .attr('cy', d => yScale(d.value as number))
          .attr('r', 3)
          .attr('fill', deviceColor)
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')
          .on('mouseover', function (_event, d) {
            d3.select(this).attr('r', 5);

            const tooltipX = xScale(d.timestamp);
            const tooltipY = yScale(d.value as number) - 10;
            const boxWidth = 130;
            const boxHeight = 40;

            // Adjust tooltip position to stay within bounds
            let xOffset = 0;
            if (tooltipX + boxWidth / 2 > width) {
              xOffset = -(boxWidth / 2 + 10);
            } else if (tooltipX - boxWidth / 2 < 0) {
              xOffset = boxWidth / 2 + 10;
            }

            const tooltip = g
              .append('g')
              .attr('class', 'tooltip')
              .attr('transform', `translate(${tooltipX + xOffset},${tooltipY})`);

            tooltip
              .append('rect')
              .attr('x', -boxWidth / 2)
              .attr('y', -boxHeight - 4)
              .attr('width', boxWidth)
              .attr('height', boxHeight)
              .attr('fill', 'white')
              .attr('stroke', '#e5e7eb')
              .attr('rx', 4)
              .style('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))');

            tooltip
              .append('text')
              .attr('text-anchor', 'middle')
              .attr('y', -boxHeight + 14)
              .attr('class', 'text-xs font-semibold')
              .attr('fill', deviceColor)
              .text(deviceCode);

            tooltip
              .append('text')
              .attr('text-anchor', 'middle')
              .attr('y', -boxHeight + 30)
              .attr('class', 'text-xs font-medium')
              .attr('fill', '#374151')
              .text(`${(d.value as number).toFixed(1)}${unit} @ ${timeFormat(d.timestamp)}`);
          })
          .on('mouseout', function () {
            d3.select(this).attr('r', 3);
            g.selectAll('.tooltip').remove();
          });
      });
    } else {
      // Single device rendering
      const line = d3
        .line<DataPoint>()
        .x(d => xScale(d.timestamp))
        .y(d => yScale(d.value as number))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(validData)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line);

      const area = d3
        .area<DataPoint>()
        .x(d => xScale(d.timestamp))
        .y0(chartHeight)
        .y1(d => yScale(d.value as number))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(validData)
        .attr('fill', color)
        .attr('fill-opacity', 0.1)
        .attr('d', area);

      g.selectAll('.data-point')
        .data(validData)
        .enter()
        .append('circle')
        .attr('class', 'data-point')
        .attr('cx', d => xScale(d.timestamp))
        .attr('cy', d => yScale(d.value as number))
        .attr('r', 3)
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseover', function (_event, d) {
          d3.select(this).attr('r', 5);

          const tooltip = g
            .append('g')
            .attr('class', 'tooltip')
            .attr('transform', `translate(${xScale(d.timestamp)},${yScale(d.value as number) - 10})`);

          tooltip
            .append('rect')
            .attr('x', -50)
            .attr('y', -30)
            .attr('width', 100)
            .attr('height', 25)
            .attr('fill', 'white')
            .attr('stroke', '#e5e7eb')
            .attr('rx', 4);

          tooltip
            .append('text')
            .attr('text-anchor', 'middle')
            .attr('y', -15)
            .attr('class', 'text-xs font-medium')
            .text(`${(d.value as number).toFixed(1)}${unit}`);
        })
        .on('mouseout', function () {
          d3.select(this).attr('r', 3);
          g.selectAll('.tooltip').remove();
        });
    }

    // X Axis
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat(d3.timeFormat('%H:%M') as any);

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('class', 'text-xs fill-gray-600');

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(6)
      .tickFormat(d => `${d}${unit}` as any);

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('class', 'text-xs fill-gray-600');

    // Y Axis Label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -chartHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('class', 'text-sm font-medium fill-gray-700')
      .text(yAxisLabel);
  }, [validData, color, height, isMultiDevice, deviceColorMap, thresholds, unit, yAxisLabel]);

  return (
    <div ref={containerRef} className="w-full">
      {/* Header with title and legend */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
        {isMultiDevice && (
          <div className="flex items-center gap-3">
            {deviceCodes.map(code => (
              <div key={code} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getDeviceColor(code) }}
                />
                <span className="text-xs font-medium text-gray-600">{code}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chart SVG */}
      <svg ref={svgRef} className="w-full" />

      {/* Footer with statistics */}
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        {isMultiDevice && perDeviceStats ? (
          <span>
            {deviceCodes.map((code, i) => (
              <span key={code}>
                {i > 0 && ' | '}
                <span style={{ color: getDeviceColor(code) }} className="font-medium">
                  {code}
                </span>
                : {perDeviceStats[code]?.count || 0} pts
              </span>
            ))}
          </span>
        ) : (
          <span>{data.length} data points</span>
        )}
        {data.length > 0 && (
          <span>
            Range: {d3.min(data.filter(d => d.value !== null), d => d.value as number)?.toFixed(1)}
            {unit} - {d3.max(data.filter(d => d.value !== null), d => d.value as number)?.toFixed(1)}
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
