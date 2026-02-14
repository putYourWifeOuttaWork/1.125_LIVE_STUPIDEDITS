import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { HeatmapCell } from '../../types/analytics';

interface HeatmapChartProps {
  data: HeatmapCell[];
  width?: number;
  height?: number;
  title?: string;
  colorScheme?: 'warm' | 'cool' | 'diverging';
  onCellClick?: (cell: HeatmapCell) => void;
  loading?: boolean;
  xLabel?: string;
  yLabel?: string;
}

const COLOR_SCHEMES = {
  warm: d3.interpolateYlOrRd,
  cool: d3.interpolateYlGnBu,
  diverging: d3.interpolateRdYlGn,
};

export default function HeatmapChart({
  data,
  width = 800,
  height = 400,
  title,
  colorScheme = 'warm',
  onCellClick,
  loading = false,
  xLabel,
  yLabel,
}: HeatmapChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0 || loading) return;

    const measuredWidth = svgRef.current.parentElement?.clientWidth;
    const effectiveWidth = measuredWidth && measuredWidth > 0 ? measuredWidth : width;

    const rows = Array.from(new Set(data.map((d) => d.rowKey)));
    const cols = Array.from(new Set(data.map((d) => d.colKey)));

    const rowLabels = new Map(data.map((d) => [d.rowKey, d.rowLabel]));
    const colLabels = new Map(data.map((d) => [d.colKey, d.colLabel]));

    const margin = {
      top: 20,
      right: 80,
      bottom: Math.min(100, 40 + cols.length * 2),
      left: Math.min(160, 40 + rows.reduce((max, r) => Math.max(max, (rowLabels.get(r) || r).length), 0) * 7),
    };
    const innerWidth = effectiveWidth - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3
      .select(svgRef.current)
      .attr('width', effectiveWidth)
      .attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand().domain(cols).range([0, innerWidth]).padding(0.05);
    const yScale = d3.scaleBand().domain(rows).range([0, innerHeight]).padding(0.05);

    const values = data.map((d) => d.value).filter((v): v is number => v !== null);
    const extent = d3.extent(values) as [number, number];
    const colorInterpolator = COLOR_SCHEMES[colorScheme];
    const colorScale =
      colorScheme === 'diverging'
        ? d3.scaleSequential(colorInterpolator).domain([extent[1], extent[0]])
        : d3.scaleSequential(colorInterpolator).domain(extent);

    const dataMap = new Map(data.map((d) => [`${d.rowKey}-${d.colKey}`, d]));

    g.selectAll('.heatmap-cell')
      .data(
        rows.flatMap((row) =>
          cols.map((col) => ({ row, col, cell: dataMap.get(`${row}-${col}`) }))
        )
      )
      .enter()
      .append('rect')
      .attr('class', 'heatmap-cell')
      .attr('x', (d) => xScale(d.col) || 0)
      .attr('y', (d) => yScale(d.row) || 0)
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('rx', 2)
      .attr('fill', (d) =>
        d.cell?.value != null ? colorScale(d.cell.value) : '#f3f4f6'
      )
      .attr('opacity', 0)
      .style('cursor', onCellClick ? 'pointer' : 'default')
      .on('mouseover', function (event, d) {
        d3.select(this).attr('stroke', '#374151').attr('stroke-width', 2);

        const x = (xScale(d.col) || 0) + xScale.bandwidth() / 2 + margin.left;
        const y = (yScale(d.row) || 0) + margin.top - 8;

        const tooltip = svg.append('g').attr('class', 'tooltip');

        const label = `${rowLabels.get(d.row) || d.row}: ${
          d.cell?.value != null ? d.cell.value.toFixed(2) : 'N/A'
        }`;

        const textEl = tooltip
          .append('text')
          .attr('x', x)
          .attr('y', y - 6)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('font-size', 11)
          .attr('font-weight', 500)
          .text(label);

        const bbox = textEl.node()?.getBBox();
        if (bbox) {
          tooltip
            .insert('rect', 'text')
            .attr('x', bbox.x - 6)
            .attr('y', bbox.y - 4)
            .attr('width', bbox.width + 12)
            .attr('height', bbox.height + 8)
            .attr('fill', 'rgba(0,0,0,0.85)')
            .attr('rx', 4);
        }
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke', 'none');
        svg.selectAll('.tooltip').remove();
      })
      .on('click', function (_, d) {
        if (onCellClick && d.cell) {
          onCellClick(d.cell);
        }
      })
      .transition()
      .duration(600)
      .delay((_, i) => i * 2)
      .attr('opacity', 1);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat((d) => {
        const label = colLabels.get(d) || d;
        return label.length > 10 ? label.slice(0, 10) + '..' : label;
      }))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .attr('font-size', 10);

    g.append('g')
      .call(d3.axisLeft(yScale).tickFormat((d) => {
        const label = rowLabels.get(d) || d;
        return label.length > 18 ? label.slice(0, 18) + '..' : label;
      }))
      .selectAll('text')
      .attr('font-size', 10);

    if (xLabel) {
      svg
        .append('text')
        .attr('x', margin.left + innerWidth / 2)
        .attr('y', height - 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', '#6b7280')
        .text(xLabel);
    }

    if (yLabel) {
      svg
        .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 12)
        .attr('x', -(margin.top + innerHeight / 2))
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', '#6b7280')
        .text(yLabel);
    }

    const legendWidth = 14;
    const legendHeight = innerHeight;
    const legendX = innerWidth + 20;

    const legendScale = d3
      .scaleLinear()
      .domain(extent)
      .range([legendHeight, 0]);

    const legendAxis = d3.axisRight(legendScale).ticks(5);

    const defs = svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'heatmap-gradient')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');

    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const value = extent[0] + t * (extent[1] - extent[0]);
      gradient
        .append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(value));
    }

    const legend = g
      .append('g')
      .attr('transform', `translate(${legendX},0)`);

    legend
      .append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#heatmap-gradient)');

    legend
      .append('g')
      .attr('transform', `translate(${legendWidth},0)`)
      .call(legendAxis)
      .selectAll('text')
      .attr('font-size', 9);
  }, [data, width, height, colorScheme, onCellClick, loading, xLabel, yLabel]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 w-full"
        style={{ height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-sm">Loading heatmap...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 w-full"
        style={{ height }}
      >
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-200 flex items-center justify-center">
            <div className="grid grid-cols-3 gap-0.5">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="w-2 h-2 bg-gray-400 rounded-sm" />
              ))}
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-900">No data available</h3>
          <p className="mt-1 text-xs text-gray-500">
            Adjust filters to see heatmap data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {title && (
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      )}
      <svg
        ref={svgRef}
        className="w-full border border-gray-200 rounded-lg bg-white"
      />
    </div>
  );
}
