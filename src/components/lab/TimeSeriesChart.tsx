import { useRef, useEffect } from 'react';
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
  thresholds = [],
}: TimeSeriesChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

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

    const validData = data.filter(d => d.value !== null && !isNaN(d.value as number));

    if (validData.length === 0) {
      g.append('text')
        .attr('x', width / 2)
        .attr('y', chartHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'text-sm fill-gray-500')
        .text('No data available');
      return;
    }

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

    // Add threshold lines
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

    // Group data by device if showing breakdown
    if (showDeviceBreakdown) {
      const deviceGroups = d3.group(validData, d => d.deviceCode || 'unknown');
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

      deviceGroups.forEach((deviceData, deviceCode) => {
        const line = d3
          .line<DataPoint>()
          .x(d => xScale(d.timestamp))
          .y(d => yScale(d.value as number))
          .curve(d3.curveMonotoneX);

        g.append('path')
          .datum(deviceData)
          .attr('fill', 'none')
          .attr('stroke', colorScale(deviceCode))
          .attr('stroke-width', 1.5)
          .attr('d', line)
          .attr('opacity', 0.7);
      });
    } else {
      // Single line
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

      // Add area fill
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

      // Add data points
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
        .on('mouseover', function (event, d) {
          d3.select(this).attr('r', 5);

          const tooltip = g.append('g')
            .attr('class', 'tooltip')
            .attr('transform', `translate(${xScale(d.timestamp)},${yScale(d.value as number) - 10})`);

          tooltip.append('rect')
            .attr('x', -50)
            .attr('y', -30)
            .attr('width', 100)
            .attr('height', 25)
            .attr('fill', 'white')
            .attr('stroke', '#e5e7eb')
            .attr('rx', 4);

          tooltip.append('text')
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
    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat(d3.timeFormat('%H:%M') as any);

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('class', 'text-xs fill-gray-600');

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
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

    // Grid lines
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

  }, [data, color, height, showDeviceBreakdown, thresholds, unit, yAxisLabel]);

  return (
    <div ref={containerRef} className="w-full">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      <svg ref={svgRef} className="w-full" />
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <span>{data.length} data points</span>
        {data.length > 0 && (
          <span>
            Range: {d3.min(data.filter(d => d.value !== null), d => d.value as number)?.toFixed(1)}{unit} -
            {d3.max(data.filter(d => d.value !== null), d => d.value as number)?.toFixed(1)}{unit}
          </span>
        )}
      </div>
    </div>
  );
}
