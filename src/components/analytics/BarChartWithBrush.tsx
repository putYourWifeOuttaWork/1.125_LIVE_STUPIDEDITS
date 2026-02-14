import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface BarChartData {
  labels: string[];
  datasets: {
    metricName: string;
    values: number[];
    color?: string;
  }[];
}

interface BarChartWithBrushProps {
  data: BarChartData;
  width?: number;
  height?: number;
  title?: string;
  yAxisLabel?: string;
  onBarClick?: (label: string, value: number) => void;
  loading?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const BarChartWithBrush: React.FC<BarChartWithBrushProps> = ({
  data,
  width = 800,
  height = 400,
  title,
  yAxisLabel = 'Value',
  onBarClick,
  loading = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || data.labels.length === 0 || loading) return;

    const margin = { top: 20, right: 120, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x0 = d3.scaleBand()
      .domain(data.labels)
      .range([0, innerWidth])
      .padding(0.1);

    const x1 = d3.scaleBand()
      .domain(data.datasets.map(d => d.metricName))
      .range([0, x0.bandwidth()])
      .padding(0.05);

    const allValues = data.datasets.flatMap(d => d.values);
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allValues) || 100])
      .range([innerHeight, 0])
      .nice();

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x0))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g')
      .call(d3.axisLeft(yScale));

    // Y-axis label
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 15)
      .attr('x', -(height / 2))
      .attr('text-anchor', 'middle')
      .attr('class', 'text-sm fill-gray-600')
      .text(yAxisLabel);

    // Bars
    const groups = g.selectAll('.bar-group')
      .data(data.labels)
      .enter()
      .append('g')
      .attr('class', 'bar-group')
      .attr('transform', d => `translate(${x0(d)},0)`);

    data.datasets.forEach((dataset, i) => {
      const color = dataset.color || COLORS[i % COLORS.length];

      groups.selectAll(`.bar-${i}`)
        .data((label, j) => [{ label, value: dataset.values[j], metric: dataset.metricName }])
        .enter()
        .append('rect')
        .attr('class', `bar-${i}`)
        .attr('x', () => x1(dataset.metricName) || 0)
        .attr('width', x1.bandwidth())
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('fill', color)
        .style('cursor', onBarClick ? 'pointer' : 'default')
        .on('mouseover', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('opacity', 0.8);

          const xPos = (x0(d.label) || 0) + (x1(d.metric) || 0) + x1.bandwidth() / 2;
          const yPos = yScale(d.value);

          const tooltip = svg.append('g')
            .attr('class', 'tooltip')
            .attr('transform', `translate(${xPos + margin.left},${yPos + margin.top - 30})`);

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
            .text(`${d.metric}: ${d.value.toFixed(2)}`);
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('opacity', 1);

          svg.selectAll('.tooltip').remove();
        })
        .on('click', function(event, d) {
          if (onBarClick) {
            onBarClick(d.label, d.value);
          }
        })
        .transition()
        .duration(800)
        .delay((d, j) => j * 50)
        .attr('y', d => yScale(d.value))
        .attr('height', d => innerHeight - yScale(d.value));
    });

    // Legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - margin.right + 10},${margin.top})`);

    data.datasets.forEach((dataset, i) => {
      const color = dataset.color || COLORS[i % COLORS.length];
      const legendRow = legend.append('g')
        .attr('transform', `translate(0,${i * 25})`);

      legendRow.append('rect')
        .attr('width', 18)
        .attr('height', 18)
        .attr('fill', color);

      legendRow.append('text')
        .attr('x', 24)
        .attr('y', 9)
        .attr('dy', '0.32em')
        .attr('class', 'text-sm fill-gray-700')
        .text(dataset.metricName);
    });

  }, [data, width, height, yAxisLabel, onBarClick, loading]);

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

  if (!data || data.labels.length === 0) {
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
          <p className="mt-1 text-sm text-gray-500">Try adjusting your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {title && (
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      )}
      <svg ref={svgRef} className="w-full border border-gray-200 rounded-lg bg-white" />
    </div>
  );
};
