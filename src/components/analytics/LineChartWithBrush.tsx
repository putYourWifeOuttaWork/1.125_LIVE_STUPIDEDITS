import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface LineChartData {
  timestamps: Date[];
  series: {
    id: string;
    label: string;
    values: number[];
    color?: string;
  }[];
}

interface LineChartWithBrushProps {
  data: LineChartData;
  width?: number;
  height?: number;
  title?: string;
  yAxisLabel?: string;
  onBrushEnd?: (timeRange: [Date, Date]) => void;
  loading?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export const LineChartWithBrush: React.FC<LineChartWithBrushProps> = ({
  data,
  width = 800,
  height = 400,
  title,
  yAxisLabel = 'Value',
  onBrushEnd,
  loading = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(
    new Set(data.series.map(s => s.id))
  );

  useEffect(() => {
    if (!svgRef.current || !data || data.timestamps.length === 0 || loading) return;

    const margin = { top: 20, right: 120, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data.timestamps) as [Date, Date])
      .range([0, innerWidth]);

    const filteredSeries = data.series.filter(s => selectedSeries.has(s.id));
    const allValues = filteredSeries.flatMap(s => s.values);
    const yExtent = d3.extent(allValues) as [number, number];
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1;

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([innerHeight, 0])
      .nice();

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // Axes
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale));

    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale));

    // Y-axis label
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 15)
      .attr('x', -(height / 2))
      .attr('text-anchor', 'middle')
      .attr('class', 'text-sm fill-gray-600')
      .text(yAxisLabel);

    // Line generator
    const line = d3.line<number>()
      .defined((d, i) => d !== null && d !== undefined && !isNaN(d))
      .x((d, i) => xScale(data.timestamps[i]))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);

    // Draw lines
    filteredSeries.forEach((series, i) => {
      const color = series.color || COLORS[i % COLORS.length];

      const path = g.append('path')
        .datum(series.values)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line as any)
        .style('opacity', 0);

      // Animate line drawing
      const totalLength = path.node()?.getTotalLength() || 0;
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .style('opacity', 1)
        .transition()
        .duration(1000)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);

      // Add dots
      g.selectAll(`.dot-${series.id}`)
        .data(series.values)
        .enter()
        .append('circle')
        .attr('class', `dot-${series.id}`)
        .attr('cx', (d, i) => xScale(data.timestamps[i]))
        .attr('cy', d => yScale(d))
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', 0)
        .on('mouseover', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 5);

          const i = series.values.indexOf(d);
          const tooltip = svg.append('g')
            .attr('class', 'tooltip')
            .attr('transform', `translate(${xScale(data.timestamps[i]) + margin.left},${yScale(d) + margin.top - 30})`);

          tooltip.append('rect')
            .attr('x', -50)
            .attr('y', -20)
            .attr('width', 100)
            .attr('height', 25)
            .attr('fill', 'rgba(0,0,0,0.8)')
            .attr('rx', 4);

          tooltip.append('text')
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .attr('font-size', 12)
            .attr('y', -5)
            .text(`${series.label}: ${d.toFixed(2)}`);
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 3);

          svg.selectAll('.tooltip').remove();
        })
        .transition()
        .delay((d, i) => i * 5)
        .duration(200)
        .attr('opacity', 0.7);
    });

    // Brush
    if (onBrushEnd) {
      const brush = d3.brushX()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on('end', (event) => {
          if (!event.selection) return;

          const [x0, x1] = event.selection as [number, number];
          const startDate = xScale.invert(x0);
          const endDate = xScale.invert(x1);

          onBrushEnd([startDate, endDate]);

          // Clear brush after selection
          g.select('.brush').call(brush.move as any, null);
        });

      g.append('g')
        .attr('class', 'brush')
        .call(brush);
    }

    // Legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - margin.right + 10},${margin.top})`);

    data.series.forEach((series, i) => {
      const color = series.color || COLORS[i % COLORS.length];
      const legendRow = legend.append('g')
        .attr('transform', `translate(0,${i * 25})`)
        .style('cursor', 'pointer')
        .on('click', () => {
          const newSelected = new Set(selectedSeries);
          if (newSelected.has(series.id)) {
            newSelected.delete(series.id);
          } else {
            newSelected.add(series.id);
          }
          setSelectedSeries(newSelected);
        });

      legendRow.append('rect')
        .attr('width', 18)
        .attr('height', 18)
        .attr('fill', color)
        .attr('opacity', selectedSeries.has(series.id) ? 1 : 0.3);

      legendRow.append('text')
        .attr('x', 24)
        .attr('y', 9)
        .attr('dy', '0.32em')
        .attr('class', 'text-sm')
        .attr('fill', selectedSeries.has(series.id) ? '#374151' : '#9ca3af')
        .text(series.label);
    });

  }, [data, width, height, yAxisLabel, onBrushEnd, selectedSeries, loading]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
        style={{ width, height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading chart...</p>
        </div>
      </div>
    );
  }

  if (!data || data.timestamps.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
        style={{ width, height }}
      >
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No data available</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or date range</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {title && (
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      )}
      <svg ref={svgRef} className="border border-gray-200 rounded-lg bg-white" />
      {onBrushEnd && (
        <p className="mt-2 text-xs text-gray-500 italic">
          Click and drag on the chart to select a time range for detailed view
        </p>
      )}
    </div>
  );
};
