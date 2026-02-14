import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { MultiMetricSeries } from '../../services/analyticsService';

export interface LineChartData {
  timestamps: Date[];
  series: (MultiMetricSeries | {
    id: string;
    label: string;
    values: number[];
    color?: string;
    metricName?: string;
    lineStyle?: 'solid' | 'dashed';
  })[];
}

export interface MetricAxisInfo {
  name: string;
  label: string;
  unit: string;
  axis: 'primary' | 'secondary';
}

interface LineChartWithBrushProps {
  data: LineChartData;
  width?: number;
  height?: number;
  title?: string;
  yAxisLabel?: string;
  secondaryYAxisLabel?: string;
  metricInfo?: MetricAxisInfo[];
  onBrushEnd?: (timeRange: [Date, Date]) => void;
  loading?: boolean;
}

const FALLBACK_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed'];

export const LineChartWithBrush: React.FC<LineChartWithBrushProps> = ({
  data,
  width = 800,
  height = 400,
  title,
  yAxisLabel = 'Value',
  secondaryYAxisLabel,
  metricInfo,
  onBrushEnd,
  loading = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (data?.series && data.series.length > 0) {
      setSelectedSeries(new Set(data.series.map(s => s.id)));
    }
  }, [data]);

  const hasSecondaryAxis = !!secondaryYAxisLabel && metricInfo && metricInfo.some(m => m.axis === 'secondary');

  useEffect(() => {
    if (!svgRef.current || !data || data.timestamps.length === 0 || loading) return;

    const measuredWidth = svgRef.current.parentElement?.clientWidth;
    const effectiveWidth = measuredWidth && measuredWidth > 0 ? measuredWidth : width;

    const margin = {
      top: 20,
      right: hasSecondaryAxis ? 70 : 30,
      bottom: 80,
      left: 60,
    };
    const innerWidth = Math.max(0, effectiveWidth - margin.left - margin.right);
    const innerHeight = Math.max(0, height - margin.top - margin.bottom);

    if (innerWidth < 50 || innerHeight < 50) return;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', effectiveWidth)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleTime()
      .domain(d3.extent(data.timestamps) as [Date, Date])
      .range([0, innerWidth]);

    const filteredSeries = data.series.filter(s => selectedSeries.has(s.id));

    const secondaryMetrics = new Set(
      metricInfo?.filter(m => m.axis === 'secondary').map(m => m.name) || []
    );

    const primarySeries = filteredSeries.filter(s => !secondaryMetrics.has(s.metricName || ''));
    const secondarySeries = filteredSeries.filter(s => secondaryMetrics.has(s.metricName || ''));

    const buildScale = (seriesList: typeof filteredSeries) => {
      const allVals = seriesList.flatMap(s => s.values.filter(v => v !== null && v !== undefined && !isNaN(v)));
      if (allVals.length === 0) return d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
      const ext = d3.extent(allVals) as [number, number];
      const pad = (ext[1] - ext[0]) * 0.1 || 1;
      return d3.scaleLinear()
        .domain([ext[0] - pad, ext[1] + pad])
        .range([innerHeight, 0])
        .nice();
    };

    const yScalePrimary = buildScale(hasSecondaryAxis ? primarySeries : filteredSeries);
    const yScaleSecondary = hasSecondaryAxis ? buildScale(secondarySeries) : null;

    const getScale = (s: typeof filteredSeries[0]) => {
      if (hasSecondaryAxis && secondaryMetrics.has(s.metricName || '')) {
        return yScaleSecondary!;
      }
      return yScalePrimary;
    };

    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.08)
      .call(
        d3.axisLeft(yScalePrimary)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    const tickCount = Math.max(5, Math.min(15, Math.floor(innerWidth / 80)));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(tickCount))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    g.append('g').call(d3.axisLeft(yScalePrimary));

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 15)
      .attr('x', -(height / 2))
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', '#6b7280')
      .text(yAxisLabel);

    if (yScaleSecondary && secondaryYAxisLabel) {
      g.append('g')
        .attr('transform', `translate(${innerWidth},0)`)
        .call(d3.axisRight(yScaleSecondary));

      svg.append('text')
        .attr('transform', 'rotate(90)')
        .attr('y', -(effectiveWidth - 12))
        .attr('x', height / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('fill', '#6b7280')
        .text(secondaryYAxisLabel);
    }

    const getMetricUnit = (metricName: string) => {
      if (!metricInfo) return '';
      const info = metricInfo.find(m => m.name === metricName);
      return info?.unit || '';
    };

    const getMetricLabel = (metricName: string) => {
      if (!metricInfo) return metricName;
      const info = metricInfo.find(m => m.name === metricName);
      return info?.label || metricName;
    };

    const formatTooltipDate = (date: Date) => {
      const month = date.toLocaleString('default', { month: 'short' });
      const day = date.getDate();
      const hours = date.getHours();
      const mins = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${month} ${day}, ${h12}:${mins} ${ampm}`;
    };

    if (onBrushEnd) {
      const brush = d3.brushX()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on('end', (event) => {
          if (!event.selection) return;
          const [x0, x1] = event.selection as [number, number];
          onBrushEnd([xScale.invert(x0), xScale.invert(x1)]);
          g.select('.brush').call(brush.move as any, null);
        });

      g.append('g')
        .attr('class', 'brush')
        .call(brush);
    }

    filteredSeries.forEach((series, i) => {
      const color = series.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      const yScale = getScale(series);
      const isDashed = series.lineStyle === 'dashed';

      const line = d3.line<number>()
        .defined((d) => d !== null && d !== undefined && !isNaN(d))
        .x((_d, idx) => xScale(data.timestamps[idx]))
        .y(d => yScale(d))
        .curve(d3.curveMonotoneX);

      const path = g.append('path')
        .datum(series.values)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line as any)
        .style('opacity', 0);

      if (isDashed) {
        path.attr('stroke-dasharray', '6,3');
      }

      const totalLength = path.node()?.getTotalLength() || 0;
      if (isDashed) {
        path.style('opacity', 1);
      } else {
        path
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .style('opacity', 1)
          .transition()
          .duration(800)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
      }

      const safeCls = series.id.replace(/[^a-zA-Z0-9-]/g, '_');

      g.selectAll(`.dot-${safeCls}`)
        .data(series.values)
        .enter()
        .append('circle')
        .attr('class', `dot-${safeCls}`)
        .attr('cx', (_d, idx) => xScale(data.timestamps[idx]))
        .attr('cy', d => yScale(d))
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', 0)
        .on('mouseover', function (event: MouseEvent, d: number) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 6)
            .attr('opacity', 1);

          svg.selectAll('.chart-tooltip').remove();

          const idx = series.values.indexOf(d);
          const timestamp = data.timestamps[idx];
          const unit = getMetricUnit(series.metricName || '');
          const metricLabel = getMetricLabel(series.metricName || '');
          const deviceName = series.label.split(' - ')[0];

          const tooltipG = svg.append('g').attr('class', 'chart-tooltip');

          const lineTexts = [
            deviceName,
            `${metricLabel}: ${d.toFixed(2)}${unit ? ' ' + unit : ''}`,
            formatTooltipDate(timestamp),
          ];

          const tooltipPadX = 12;
          const tooltipPadY = 8;
          const lineHeight = 18;
          const tooltipH = lineTexts.length * lineHeight + tooltipPadY * 2;

          const tempTexts = lineTexts.map((text, tIdx) => {
            return tooltipG.append('text')
              .attr('font-size', tIdx === 0 ? 12 : 11)
              .attr('font-weight', tIdx === 0 ? 600 : 400)
              .attr('fill', 'white')
              .text(text);
          });

          let maxTextW = 0;
          tempTexts.forEach(t => {
            const bbox = t.node()?.getBBox();
            if (bbox && bbox.width > maxTextW) maxTextW = bbox.width;
          });
          tempTexts.forEach(t => t.remove());

          const tooltipW = maxTextW + tooltipPadX * 2 + 16;

          let tx = xScale(timestamp) + margin.left + 12;
          let ty = yScale(d) + margin.top - tooltipH - 8;

          if (tx + tooltipW > width - 10) {
            tx = xScale(timestamp) + margin.left - tooltipW - 12;
          }
          if (ty < 5) {
            ty = yScale(d) + margin.top + 12;
          }

          tooltipG.attr('transform', `translate(${tx},${ty})`);

          tooltipG.append('rect')
            .attr('width', tooltipW)
            .attr('height', tooltipH)
            .attr('fill', 'rgba(17,24,39,0.92)')
            .attr('rx', 6)
            .attr('ry', 6);

          tooltipG.append('circle')
            .attr('cx', tooltipPadX)
            .attr('cy', tooltipPadY + 8)
            .attr('r', 4)
            .attr('fill', color);

          lineTexts.forEach((text, tIdx) => {
            tooltipG.append('text')
              .attr('x', tooltipPadX + (tIdx === 0 ? 12 : 0))
              .attr('y', tooltipPadY + lineHeight * (tIdx + 1) - 4)
              .attr('font-size', tIdx === 0 ? 12 : 11)
              .attr('font-weight', tIdx === 0 ? 600 : 400)
              .attr('fill', tIdx === 2 ? '#9ca3af' : 'white')
              .text(text);
          });
        })
        .on('mouseout', function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 3)
            .attr('opacity', 0.7);

          svg.selectAll('.chart-tooltip').remove();
        })
        .transition()
        .delay((_d, idx) => idx * 3)
        .duration(200)
        .attr('opacity', 0.7);
    });
  }, [data, width, height, yAxisLabel, secondaryYAxisLabel, metricInfo, onBrushEnd, selectedSeries, loading, hasSecondaryAxis]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 w-full"
        style={{ height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading chart...</p>
        </div>
      </div>
    );
  }

  if (!data || data.timestamps.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 w-full"
        style={{ height }}
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

  const toggleSeries = (seriesId: string) => {
    const newSelected = new Set(selectedSeries);
    if (newSelected.has(seriesId)) {
      newSelected.delete(seriesId);
    } else {
      newSelected.add(seriesId);
    }
    setSelectedSeries(newSelected);
  };

  return (
    <div className="relative">
      {title && (
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
      )}
      <svg ref={svgRef} className="w-full border border-gray-200 rounded-lg bg-white" />

      {data && data.series && data.series.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 justify-center">
          {data.series.map((series, i) => {
            const color = series.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
            const isSelected = selectedSeries.has(series.id);
            const isDashed = series.lineStyle === 'dashed';

            return (
              <button
                key={series.id}
                onClick={() => toggleSeries(series.id)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                <svg width="20" height="12" className="flex-shrink-0">
                  <line
                    x1="0" y1="6" x2="20" y2="6"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={isDashed ? '4,2' : 'none'}
                    opacity={isSelected ? 1 : 0.3}
                  />
                  <circle cx="10" cy="6" r="3" fill={color} opacity={isSelected ? 1 : 0.3} />
                </svg>
                <span
                  className="text-sm font-medium"
                  style={{ color: isSelected ? '#374151' : '#9ca3af' }}
                >
                  {series.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {onBrushEnd && (
        <p className="mt-2 text-xs text-gray-500 italic text-center">
          Click and drag on the chart to select a time range for detailed view
        </p>
      )}
    </div>
  );
};
