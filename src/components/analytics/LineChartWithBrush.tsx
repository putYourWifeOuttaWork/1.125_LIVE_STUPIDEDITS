import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { MultiMetricSeries } from '../../services/analyticsService';

export interface LineChartData {
  timestamps: Date[];
  series: (MultiMetricSeries | {
    id: string;
    label: string;
    values: (number | null)[];
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

export interface ChartAnnotation {
  type: 'threshold_line' | 'highlight_point' | 'vertical_marker' | 'shaded_region' | 'time_range_highlight';
  value?: number;
  timestamp?: Date;
  startTimestamp?: Date;
  endTimestamp?: Date;
  y1?: number;
  y2?: number;
  label?: string;
  color?: string;
  metricName?: string;
}

interface LineChartWithBrushProps {
  data: LineChartData;
  width?: number;
  height?: number;
  title?: string;
  yAxisLabel?: string;
  secondaryYAxisLabel?: string;
  metricInfo?: MetricAxisInfo[];
  annotations?: ChartAnnotation[];
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
  annotations,
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

    const clipId = `chart-clip-${Math.random().toString(36).slice(2, 9)}`;
    svg.append('defs').append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const plotArea = g.append('g')
      .attr('clip-path', `url(#${clipId})`);

    const xScale = d3.scaleTime()
      .domain(d3.extent(data.timestamps) as [Date, Date])
      .range([0, innerWidth]);

    const filteredSeries = data.series.filter(s => selectedSeries.has(s.id));

    const secondaryMetrics = new Set(
      metricInfo?.filter(m => m.axis === 'secondary').map(m => m.name) || []
    );

    const primarySeries = filteredSeries.filter(s => !secondaryMetrics.has(s.metricName || ''));
    const secondarySeries = filteredSeries.filter(s => secondaryMetrics.has(s.metricName || ''));

    const collectAnnotationValues = (metricNames: Set<string>, isPrimary: boolean) => {
      if (!annotations || annotations.length === 0) return [];
      const vals: number[] = [];
      for (const ann of annotations) {
        const belongsToPrimary = !ann.metricName || !secondaryMetrics.has(ann.metricName);
        const belongsToSecondary = ann.metricName && secondaryMetrics.has(ann.metricName);
        const matches = isPrimary ? belongsToPrimary : belongsToSecondary;
        if (!matches) continue;

        if ((ann.type === 'threshold_line' || ann.type === 'highlight_point') && ann.value !== undefined) {
          vals.push(ann.value);
        }
        if (ann.type === 'shaded_region') {
          if (ann.y1 !== undefined) vals.push(ann.y1);
          if (ann.y2 !== undefined) vals.push(ann.y2);
        }
      }
      return vals;
    };

    const buildScale = (seriesList: typeof filteredSeries, extraValues: number[] = []) => {
      const allVals = seriesList.flatMap(s => s.values.filter(v => v !== null && v !== undefined && !isNaN(v)));
      const combined = [...allVals, ...extraValues] as number[];
      if (combined.length === 0) return d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
      const ext = d3.extent(combined) as [number, number];
      const pad = (ext[1] - ext[0]) * 0.1 || 1;
      const domainMin = ext[0] >= 0 ? Math.max(0, ext[0] - pad) : ext[0] - pad;
      return d3.scaleLinear()
        .domain([domainMin, ext[1] + pad])
        .range([innerHeight, 0])
        .nice();
    };

    const primaryMetricNames = new Set(primarySeries.map(s => s.metricName || ''));
    const primaryAnnotationVals = collectAnnotationValues(primaryMetricNames, true);
    const secondaryAnnotationVals = hasSecondaryAxis ? collectAnnotationValues(secondaryMetrics, false) : [];

    const yScalePrimary = buildScale(hasSecondaryAxis ? primarySeries : filteredSeries, primaryAnnotationVals);
    const yScaleSecondary = hasSecondaryAxis ? buildScale(secondarySeries, secondaryAnnotationVals) : null;

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

    const formatMetricValue = (value: number, metricName: string, unit: string) => {
      const pctMetrics = ['mgi_score', 'mgi_velocity', 'mgi_speed', 'humidity', 'wake_reliability', 'image_success_rate'];
      const intMetrics = ['alert_count'];
      if (intMetrics.includes(metricName)) return `${Math.round(value)}${unit ? ' ' + unit : ''}`;
      if (pctMetrics.includes(metricName)) return `${value.toFixed(1)}${unit ? ' ' + unit : ''}`;
      if (metricName === 'battery_voltage') return `${value.toFixed(2)}${unit ? ' ' + unit : ''}`;
      if (metricName === 'gas_resistance_zscore') return `${value.toFixed(2)}${unit ? ' ' + unit : ''}`;
      if (metricName === 'gas_resistance_deviation') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}${unit ? ' ' + unit : ''}`;
      return `${value.toFixed(1)}${unit ? ' ' + unit : ''}`;
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

    const barSeriesList = filteredSeries.filter(s => s.renderAs === 'bar');
    const lineSeriesList = filteredSeries.filter(s => s.renderAs !== 'bar');

    const barCountPerTimestamp = barSeriesList.length;
    const maxBarWidth = barCountPerTimestamp > 0
      ? Math.min(28, Math.max(6, innerWidth / data.timestamps.length * 0.5 / barCountPerTimestamp))
      : 0;
    const barGroupWidth = maxBarWidth * barCountPerTimestamp;

    const showTooltip = (
      svgEl: d3.Selection<SVGSVGElement, unknown, null, undefined>,
      color: string,
      seriesItem: typeof filteredSeries[0],
      d: { val: number | null; idx: number },
      yScale: d3.ScaleLinear<number, number>,
    ) => {
      svgEl.selectAll('.chart-tooltip').remove();

      const timestamp = data.timestamps[d.idx];
      const unit = getMetricUnit(seriesItem.metricName || '');
      const metricLabel = getMetricLabel(seriesItem.metricName || '');
      const deviceName = seriesItem.label.split(' - ')[0];

      const tooltipG = svgEl.append('g').attr('class', 'chart-tooltip');

      const lineTexts = [
        deviceName,
        `${metricLabel}: ${formatMetricValue(d.val as number, seriesItem.metricName || '', unit)}`,
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
      let ty = yScale(d.val as number) + margin.top - tooltipH - 8;

      if (tx + tooltipW > effectiveWidth - 10) {
        tx = xScale(timestamp) + margin.left - tooltipW - 12;
      }
      if (ty < 5) {
        ty = yScale(d.val as number) + margin.top + 12;
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
    };

    barSeriesList.forEach((series, barIdx) => {
      const color = series.color || FALLBACK_COLORS[barIdx % FALLBACK_COLORS.length];
      const yScale = getScale(series);
      const safeCls = series.id.replace(/[^a-zA-Z0-9-]/g, '_');
      const yBaseline = innerHeight;

      const barData = series.values
        .map((val, idx) => ({ val, idx }))
        .filter(d => d.val !== null && d.val !== undefined && !isNaN(d.val as number));

      plotArea.selectAll(`.bar-${safeCls}`)
        .data(barData)
        .enter()
        .append('rect')
        .attr('class', `bar-${safeCls}`)
        .attr('x', d => {
          const cx = xScale(data.timestamps[d.idx]);
          return cx - barGroupWidth / 2 + barIdx * maxBarWidth;
        })
        .attr('y', yBaseline)
        .attr('width', maxBarWidth)
        .attr('height', 0)
        .attr('fill', color)
        .attr('opacity', 0.35)
        .attr('rx', 2)
        .attr('ry', 2)
        .on('mouseover', function (_event: MouseEvent, d: { val: number | null; idx: number }) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('opacity', 0.7);
          showTooltip(svg, color, series, d, yScale);
        })
        .on('mouseout', function () {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('opacity', 0.35);
          svg.selectAll('.chart-tooltip').remove();
        })
        .transition()
        .duration(600)
        .delay((_d, idx) => idx * 20)
        .attr('y', d => yScale(d.val as number))
        .attr('height', d => Math.max(0, yBaseline - yScale(d.val as number)));
    });

    lineSeriesList.forEach((series, i) => {
      const color = series.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      const yScale = getScale(series);
      const isDashed = series.lineStyle === 'dashed';

      const line = d3.line<number | null>()
        .defined((d) => d !== null && d !== undefined && !isNaN(d as number))
        .x((_d, idx) => xScale(data.timestamps[idx]))
        .y(d => yScale(d as number))
        .curve(d3.curveMonotoneX);

      const path = plotArea.append('path')
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

      const dotData = series.values
        .map((val, idx) => ({ val, idx }))
        .filter(d => d.val !== null && d.val !== undefined && !isNaN(d.val as number));

      plotArea.selectAll(`.dot-${safeCls}`)
        .data(dotData)
        .enter()
        .append('circle')
        .attr('class', `dot-${safeCls}`)
        .attr('cx', d => xScale(data.timestamps[d.idx]))
        .attr('cy', d => yScale(d.val as number))
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', 0)
        .on('mouseover', function (_event: MouseEvent, d: { val: number | null; idx: number }) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('r', 6)
            .attr('opacity', 1);
          showTooltip(svg, color, series, d, yScale);
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

    if (annotations && annotations.length > 0) {
      const annotationGroup = g.append('g').attr('class', 'annotations');

      const getAnnotationScale = (ann: ChartAnnotation) => {
        if (hasSecondaryAxis && ann.metricName && secondaryMetrics.has(ann.metricName) && yScaleSecondary) {
          return yScaleSecondary;
        }
        return yScalePrimary;
      };

      annotations.forEach((ann) => {
        const annColor = ann.color || '#dc2626';

        if (ann.type === 'threshold_line' && ann.value !== undefined) {
          const yScale = getAnnotationScale(ann);
          const yPos = Math.max(0, Math.min(innerHeight, yScale(ann.value)));

          annotationGroup.append('line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', yPos)
            .attr('y2', yPos)
            .attr('stroke', annColor)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.8);

          if (ann.label) {
            const labelY = Math.max(18, Math.min(innerHeight - 4, yPos));
            annotationGroup.append('rect')
              .attr('x', innerWidth - ann.label.length * 6.5 - 12)
              .attr('y', labelY - 18)
              .attr('width', ann.label.length * 6.5 + 10)
              .attr('height', 16)
              .attr('fill', 'white')
              .attr('rx', 3)
              .attr('opacity', 0.9);

            annotationGroup.append('text')
              .attr('x', innerWidth - 6)
              .attr('y', labelY - 7)
              .attr('text-anchor', 'end')
              .attr('font-size', 10)
              .attr('font-weight', 600)
              .attr('fill', annColor)
              .text(ann.label);
          }
        }

        if (ann.type === 'vertical_marker' && ann.timestamp) {
          const xPos = xScale(ann.timestamp);
          if (xPos >= 0 && xPos <= innerWidth) {
            annotationGroup.append('line')
              .attr('x1', xPos)
              .attr('x2', xPos)
              .attr('y1', 0)
              .attr('y2', innerHeight)
              .attr('stroke', annColor)
              .attr('stroke-width', 1)
              .attr('stroke-dasharray', '4,3')
              .attr('opacity', 0.6);

            if (ann.label) {
              annotationGroup.append('text')
                .attr('x', xPos + 4)
                .attr('y', 12)
                .attr('font-size', 9)
                .attr('fill', annColor)
                .attr('opacity', 0.8)
                .text(ann.label);
            }
          }
        }

        if (ann.type === 'shaded_region' && ann.y1 !== undefined && ann.y2 !== undefined) {
          const yScale = getAnnotationScale(ann);
          const yTop = yScale(Math.max(ann.y1, ann.y2));
          const yBottom = yScale(Math.min(ann.y1, ann.y2));
          const regionHeight = Math.max(0, yBottom - yTop);

          if (regionHeight > 0) {
            annotationGroup.append('rect')
              .attr('x', 0)
              .attr('y', yTop)
              .attr('width', innerWidth)
              .attr('height', regionHeight)
              .attr('fill', annColor)
              .attr('opacity', 0.08);
          }
        }

        if (ann.type === 'time_range_highlight' && ann.startTimestamp && ann.endTimestamp) {
          const x1 = Math.max(0, xScale(ann.startTimestamp));
          const x2 = Math.min(innerWidth, xScale(ann.endTimestamp));
          const bandWidth = Math.max(0, x2 - x1);

          if (bandWidth > 0) {
            annotationGroup.append('rect')
              .attr('x', x1)
              .attr('y', 0)
              .attr('width', bandWidth)
              .attr('height', innerHeight)
              .attr('fill', annColor)
              .attr('opacity', 0.10);

            annotationGroup.append('line')
              .attr('x1', x1).attr('x2', x1)
              .attr('y1', 0).attr('y2', innerHeight)
              .attr('stroke', annColor)
              .attr('stroke-width', 1.5)
              .attr('stroke-dasharray', '5,3')
              .attr('opacity', 0.5);

            annotationGroup.append('line')
              .attr('x1', x2).attr('x2', x2)
              .attr('y1', 0).attr('y2', innerHeight)
              .attr('stroke', annColor)
              .attr('stroke-width', 1.5)
              .attr('stroke-dasharray', '5,3')
              .attr('opacity', 0.5);

            if (ann.label) {
              const midX = x1 + bandWidth / 2;
              const labelText = ann.label;
              const estimatedWidth = labelText.length * 6 + 16;
              annotationGroup.append('rect')
                .attr('x', midX - estimatedWidth / 2)
                .attr('y', 4)
                .attr('width', estimatedWidth)
                .attr('height', 18)
                .attr('fill', annColor)
                .attr('rx', 3)
                .attr('opacity', 0.85);

              annotationGroup.append('text')
                .attr('x', midX)
                .attr('y', 16)
                .attr('text-anchor', 'middle')
                .attr('font-size', 10)
                .attr('font-weight', 600)
                .attr('fill', 'white')
                .text(labelText);
            }
          }
        }

        if (ann.type === 'highlight_point' && ann.timestamp && ann.value !== undefined) {
          const yScale = getAnnotationScale(ann);
          const cx = Math.max(0, Math.min(innerWidth, xScale(ann.timestamp)));
          const cy = Math.max(0, Math.min(innerHeight, yScale(ann.value)));

          annotationGroup.append('circle')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', 12)
            .attr('fill', annColor)
            .attr('opacity', 0.12);

          annotationGroup.append('circle')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', 7)
            .attr('fill', annColor)
            .attr('stroke', 'white')
            .attr('stroke-width', 2)
            .attr('opacity', 0.9);

          const labelText = ann.label || `${ann.value.toFixed(1)}`;
          const labelY = cy <= 24 ? cy + 22 : cy - 16;
          annotationGroup.append('rect')
            .attr('x', cx - labelText.length * 3.5 - 6)
            .attr('y', labelY - 10)
            .attr('width', labelText.length * 7 + 12)
            .attr('height', 16)
            .attr('fill', annColor)
            .attr('rx', 3)
            .attr('opacity', 0.9);

          annotationGroup.append('text')
            .attr('x', cx)
            .attr('y', labelY + 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', 10)
            .attr('font-weight', 600)
            .attr('fill', 'white')
            .text(labelText);
        }
      });
    }
  }, [data, width, height, yAxisLabel, secondaryYAxisLabel, metricInfo, annotations, onBrushEnd, selectedSeries, loading, hasSecondaryAxis]);

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
            const isBar = series.renderAs === 'bar';

            return (
              <button
                key={series.id}
                onClick={() => toggleSeries(series.id)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              >
                {isBar ? (
                  <svg width="20" height="12" className="flex-shrink-0">
                    <rect
                      x="2" y="1" width="16" height="10" rx="2"
                      fill={color}
                      opacity={isSelected ? 0.45 : 0.15}
                    />
                  </svg>
                ) : (
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
                )}
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
