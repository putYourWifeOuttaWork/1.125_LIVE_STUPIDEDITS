import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface HistogramChartProps {
  data: number[];
  title: string;
  xAxisLabel: string;
  unit: string;
  color?: string;
  height?: number;
  bins?: number;
}

export default function HistogramChart({
  data,
  title,
  xAxisLabel,
  unit,
  color = '#10b981',
  height = 250,
  bins = 20,
}: HistogramChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const containerWidth = container.clientWidth;

    const margin = { top: 20, right: 20, bottom: 50, left: 50 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    svg.selectAll('*').remove();

    const g = svg
      .attr('width', containerWidth)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const validData = data.filter(d => !isNaN(d) && d !== null);

    if (validData.length === 0) {
      g.append('text')
        .attr('x', width / 2)
        .attr('y', chartHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'text-sm fill-gray-500')
        .text('No data available');
      return;
    }

    // Calculate statistics
    const mean = d3.mean(validData)!;
    const stdDev = d3.deviation(validData)!;

    // Create histogram
    const xScale = d3.scaleLinear()
      .domain([d3.min(validData)!, d3.max(validData)!])
      .range([0, width])
      .nice();

    const histogram = d3.histogram()
      .domain(xScale.domain() as [number, number])
      .thresholds(xScale.ticks(bins));

    const binData = histogram(validData);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(binData, d => d.length)!])
      .range([chartHeight, 0])
      .nice();

    // Draw bars
    g.selectAll('.bar')
      .data(binData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.x0!))
      .attr('y', d => yScale(d.length))
      .attr('width', d => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 1))
      .attr('height', d => chartHeight - yScale(d.length))
      .attr('fill', color)
      .attr('opacity', 0.7)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1);

        const tooltip = g.append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xScale((d.x0! + d.x1!) / 2)},${yScale(d.length) - 10})`);

        tooltip.append('rect')
          .attr('x', -50)
          .attr('y', -40)
          .attr('width', 100)
          .attr('height', 35)
          .attr('fill', 'white')
          .attr('stroke', '#e5e7eb')
          .attr('rx', 4);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', -25)
          .attr('class', 'text-xs font-medium')
          .text(`${d.x0!.toFixed(1)}-${d.x1!.toFixed(1)}${unit}`);

        tooltip.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', -10)
          .attr('class', 'text-xs text-gray-600')
          .text(`Count: ${d.length}`);
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.7);
        g.selectAll('.tooltip').remove();
      });

    // Mean line
    g.append('line')
      .attr('x1', xScale(mean))
      .attr('x2', xScale(mean))
      .attr('y1', 0)
      .attr('y2', chartHeight)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    g.append('text')
      .attr('x', xScale(mean))
      .attr('y', -5)
      .attr('text-anchor', 'middle')
      .attr('class', 'text-xs font-medium fill-red-600')
      .text(`Mean: ${mean.toFixed(1)}${unit}`);

    // Standard deviation range
    g.append('rect')
      .attr('x', xScale(mean - stdDev))
      .attr('y', 0)
      .attr('width', xScale(mean + stdDev) - xScale(mean - stdDev))
      .attr('height', chartHeight)
      .attr('fill', '#fbbf24')
      .attr('opacity', 0.1);

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(8)
      .tickFormat(d => `${d}${unit}` as any);

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('class', 'text-xs fill-gray-600');

    // X Axis Label
    g.append('text')
      .attr('x', width / 2)
      .attr('y', chartHeight + 40)
      .attr('text-anchor', 'middle')
      .attr('class', 'text-sm font-medium fill-gray-700')
      .text(xAxisLabel);

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(6);

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('class', 'text-xs fill-gray-600');

    // Y Axis Label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -chartHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('class', 'text-sm font-medium fill-gray-700')
      .text('Frequency');

  }, [data, color, height, bins, unit, xAxisLabel]);

  return (
    <div ref={containerRef} className="w-full">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      <svg ref={svgRef} className="w-full" />
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <span>{data.length} samples</span>
        {data.length > 0 && (
          <span>
            μ={d3.mean(data)?.toFixed(2)}{unit}, σ={d3.deviation(data)?.toFixed(2)}{unit}
          </span>
        )}
      </div>
    </div>
  );
}
