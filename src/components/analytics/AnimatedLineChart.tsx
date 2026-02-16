import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { MultiMetricSeries } from '../../services/analyticsService';
import type { MetricAxisInfo } from './LineChartWithBrush';

interface AnimatedLineChartData {
  timestamps: Date[];
  series: (MultiMetricSeries & { lineStyle?: 'solid' | 'dashed' })[];
}

interface AnimatedLineChartProps {
  data: AnimatedLineChartData;
  width?: number;
  height?: number;
  yAxisLabel?: string;
  secondaryYAxisLabel?: string;
  metricInfo?: MetricAxisInfo[];
  transitionDuration?: number;
}

const FALLBACK_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed'];

export const AnimatedLineChart: React.FC<AnimatedLineChartProps> = ({
  data,
  width = 800,
  height = 440,
  yAxisLabel = 'Value',
  secondaryYAxisLabel,
  metricInfo,
  transitionDuration = 800,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const initializedRef = useRef(false);
  const prevDataRef = useRef<AnimatedLineChartData | null>(null);
  const [effectiveWidth, setEffectiveWidth] = useState(width);

  const hasSecondaryAxis = useMemo(
    () => !!secondaryYAxisLabel && metricInfo && metricInfo.some(m => m.axis === 'secondary'),
    [secondaryYAxisLabel, metricInfo]
  );

  const margin = useMemo(
    () => ({
      top: 20,
      right: hasSecondaryAxis ? 70 : 30,
      bottom: 80,
      left: 60,
    }),
    [hasSecondaryAxis]
  );

  useEffect(() => {
    if (!svgRef.current) return;
    const measured = svgRef.current.parentElement?.clientWidth;
    if (measured && measured > 0) setEffectiveWidth(measured);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) setEffectiveWidth(entry.contentRect.width);
      }
    });
    if (svgRef.current.parentElement) observer.observe(svgRef.current.parentElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data || data.timestamps.length === 0) return;

    const svg = d3.select(svgRef.current);
    const innerWidth = effectiveWidth - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    if (innerWidth <= 0 || innerHeight <= 0) return;

    const getAxisForSeries = (s: MultiMetricSeries): 'primary' | 'secondary' => {
      if (!metricInfo) return 'primary';
      const info = metricInfo.find(m => m.name === s.metricName);
      return info?.axis || 'primary';
    };

    const primarySeries = data.series.filter(s => getAxisForSeries(s) === 'primary');
    const secondarySeries = data.series.filter(s => getAxisForSeries(s) === 'secondary');

    const primaryValues = primarySeries.flatMap(s => s.values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v as number)));
    const secondaryValues = secondarySeries.flatMap(s => s.values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v as number)));

    const primaryExtent = d3.extent(primaryValues) as [number, number];
    const secondaryExtent = d3.extent(secondaryValues) as [number, number];

    const pad = (ext: [number, number]) => {
      const range = ext[1] - ext[0] || 1;
      return [ext[0] - range * 0.05, ext[1] + range * 0.05] as [number, number];
    };

    const xScale = d3.scaleTime()
      .domain(d3.extent(data.timestamps) as [Date, Date])
      .range([0, innerWidth]);

    const yScalePrimary = d3.scaleLinear()
      .domain(primaryValues.length ? pad(primaryExtent) : [0, 1])
      .range([innerHeight, 0])
      .nice();

    const yScaleSecondary = hasSecondaryAxis && secondaryValues.length
      ? d3.scaleLinear()
          .domain(pad(secondaryExtent))
          .range([innerHeight, 0])
          .nice()
      : null;

    const getScale = (s: MultiMetricSeries) =>
      getAxisForSeries(s) === 'secondary' && yScaleSecondary
        ? yScaleSecondary
        : yScalePrimary;

    if (!initializedRef.current) {
      svg.selectAll('*').remove();

      svg.attr('width', effectiveWidth).attr('height', height);

      const g = svg.append('g')
        .attr('class', 'chart-area')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${innerHeight})`);

      g.append('g').attr('class', 'y-axis-primary');

      if (hasSecondaryAxis) {
        g.append('g')
          .attr('class', 'y-axis-secondary')
          .attr('transform', `translate(${innerWidth},0)`);
      }

      g.append('g').attr('class', 'lines-group');
      g.append('g').attr('class', 'dots-group');

      svg.append('text')
        .attr('class', 'y-label-primary')
        .attr('transform', 'rotate(-90)')
        .attr('y', 15)
        .attr('x', -(height / 2))
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('fill', '#6b7280')
        .text(yAxisLabel);

      if (hasSecondaryAxis && secondaryYAxisLabel) {
        svg.append('text')
          .attr('class', 'y-label-secondary')
          .attr('transform', 'rotate(90)')
          .attr('y', -(effectiveWidth - 12))
          .attr('x', height / 2)
          .attr('text-anchor', 'middle')
          .attr('font-size', 12)
          .attr('fill', '#6b7280')
          .text(secondaryYAxisLabel);
      }

      initializedRef.current = true;
    }

    svg.attr('width', effectiveWidth).attr('height', height);

    const g = svg.select<SVGGElement>('.chart-area');
    const t = d3.transition().duration(transitionDuration).ease(d3.easeCubicInOut);

    g.select<SVGGElement>('.x-axis')
      .transition(t as any)
      .call(d3.axisBottom(xScale).ticks(Math.min(data.timestamps.length, 8)));

    g.select<SVGGElement>('.y-axis-primary')
      .transition(t as any)
      .call(d3.axisLeft(yScalePrimary));

    if (yScaleSecondary) {
      g.select<SVGGElement>('.y-axis-secondary')
        .attr('transform', `translate(${innerWidth},0)`)
        .transition(t as any)
        .call(d3.axisRight(yScaleSecondary));
    }

    svg.select('.y-label-primary').text(yAxisLabel);
    if (secondaryYAxisLabel) {
      svg.select('.y-label-secondary')
        .attr('y', -(effectiveWidth - 12))
        .text(secondaryYAxisLabel);
    }

    const linesGroup = g.select('.lines-group');
    const dotsGroup = g.select('.dots-group');

    if (!g.select('.bars-group').node()) {
      g.insert('g', '.lines-group').attr('class', 'bars-group');
    }
    const barsGroup = g.select('.bars-group');

    const barSeriesList = data.series.filter(s => s.renderAs === 'bar');
    const lineSeriesList = data.series.filter(s => s.renderAs !== 'bar');

    const barCountPerTimestamp = barSeriesList.length;
    const maxBarWidth = barCountPerTimestamp > 0
      ? Math.min(28, Math.max(6, innerWidth / data.timestamps.length * 0.5 / barCountPerTimestamp))
      : 0;
    const barGroupWidth = maxBarWidth * barCountPerTimestamp;

    barSeriesList.forEach((series, barIdx) => {
      const color = series.color || FALLBACK_COLORS[barIdx % FALLBACK_COLORS.length];
      const yScale = getScale(series);
      const safeCls = series.id.replace(/[^a-zA-Z0-9-]/g, '_');
      const yBaseline = yScale(yScale.domain()[0]);

      const barData = series.values
        .map((val, idx) => ({ val, idx }))
        .filter(d => d.val !== null && d.val !== undefined && !isNaN(d.val as number));

      const bars = barsGroup.selectAll<SVGRectElement, { val: number | null; idx: number }>(`.bar-${safeCls}`)
        .data(barData, (d: { val: number | null; idx: number }) => d.idx);

      bars.exit()
        .transition(t as any)
        .attr('height', 0)
        .attr('y', yBaseline)
        .remove();

      bars.enter()
        .append('rect')
        .attr('class', `bar-${safeCls}`)
        .attr('x', d => xScale(data.timestamps[d.idx]) - barGroupWidth / 2 + barIdx * maxBarWidth)
        .attr('y', yBaseline)
        .attr('width', maxBarWidth)
        .attr('height', 0)
        .attr('fill', color)
        .attr('opacity', 0.35)
        .attr('rx', 2)
        .attr('ry', 2)
        .merge(bars as any)
        .transition(t as any)
        .attr('x', (d: { val: number | null; idx: number }) => xScale(data.timestamps[d.idx]) - barGroupWidth / 2 + barIdx * maxBarWidth)
        .attr('width', maxBarWidth)
        .attr('y', (d: { val: number | null; idx: number }) => yScale(d.val as number))
        .attr('height', (d: { val: number | null; idx: number }) => Math.max(0, yBaseline - yScale(d.val as number)))
        .attr('fill', color)
        .attr('opacity', 0.35);
    });

    const activeBarClasses = new Set(barSeriesList.map(s => `bar-${s.id.replace(/[^a-zA-Z0-9-]/g, '_')}`));
    barsGroup.selectAll('rect').nodes().forEach(n => {
      const cls = (n as SVGRectElement).getAttribute('class') || '';
      if (cls.startsWith('bar-') && !activeBarClasses.has(cls)) {
        d3.select(n).transition(t as any).attr('height', 0).style('opacity', 0).remove();
      }
    });

    const lineGenerator = (series: MultiMetricSeries) => {
      const yScale = getScale(series);
      return d3.line<number | null>()
        .defined(d => d !== null && d !== undefined && !isNaN(d as number))
        .x((_d, idx) => xScale(data.timestamps[idx]))
        .y(d => yScale(d as number))
        .curve(d3.curveMonotoneX);
    };

    const paths = linesGroup.selectAll<SVGPathElement, MultiMetricSeries>('.series-line')
      .data(lineSeriesList, (d: MultiMetricSeries) => d.id);

    paths.exit()
      .transition(t as any)
      .style('opacity', 0)
      .remove();

    paths.enter()
      .append('path')
      .attr('class', 'series-line')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .merge(paths as any)
      .each(function (d: MultiMetricSeries, i: number) {
        const color = d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
        const isDashed = d.lineStyle === 'dashed';
        const line = lineGenerator(d);

        d3.select(this)
          .attr('stroke', color)
          .attr('stroke-dasharray', isDashed ? '6,3' : 'none')
          .transition(t as any)
          .attr('d', line(d.values) as string)
          .style('opacity', 1);
      });

    lineSeriesList.forEach((series, seriesIdx) => {
      const color = series.color || FALLBACK_COLORS[seriesIdx % FALLBACK_COLORS.length];
      const yScale = getScale(series);
      const safeCls = series.id.replace(/[^a-zA-Z0-9-]/g, '_');

      const dotData = series.values
        .map((val, idx) => ({ val, idx }))
        .filter(d => d.val !== null && d.val !== undefined && !isNaN(d.val as number));

      const dots = dotsGroup.selectAll<SVGCircleElement, { val: number | null; idx: number }>(`.dot-${safeCls}`)
        .data(dotData, (d: { val: number | null; idx: number }) => d.idx);

      dots.exit()
        .transition(t as any)
        .attr('r', 0)
        .remove();

      dots.enter()
        .append('circle')
        .attr('class', `dot-${safeCls}`)
        .attr('r', 0)
        .attr('fill', color)
        .attr('opacity', 0.7)
        .merge(dots as any)
        .transition(t as any)
        .attr('cx', (d: { val: number | null; idx: number }) => xScale(data.timestamps[d.idx]))
        .attr('cy', (d: { val: number | null; idx: number }) => yScale(d.val as number))
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', 0.7);
    });

    const staleClasses = dotsGroup.selectAll('circle')
      .nodes()
      .map(n => (n as SVGCircleElement).getAttribute('class') || '')
      .filter(c => c.startsWith('dot-'));

    const activeClasses = new Set(lineSeriesList.map(s => `dot-${s.id.replace(/[^a-zA-Z0-9-]/g, '_')}`));
    staleClasses.forEach(cls => {
      if (!activeClasses.has(cls)) {
        dotsGroup.selectAll(`.${cls}`)
          .transition(t as any)
          .attr('r', 0)
          .style('opacity', 0)
          .remove();
      }
    });

    prevDataRef.current = data;
  }, [data, effectiveWidth, height, yAxisLabel, secondaryYAxisLabel, metricInfo, hasSecondaryAxis, margin, transitionDuration]);

  const legendItems = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((s, i) => ({
      id: s.id,
      label: s.label,
      color: s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      dashed: s.lineStyle === 'dashed',
      isBar: s.renderAs === 'bar',
    }));
  }, [data]);

  return (
    <div className="w-full">
      <svg ref={svgRef} className="w-full" />
      {legendItems.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 mt-3 px-4">
          {legendItems.map(item => (
            <div key={item.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              {item.isBar ? (
                <svg width="20" height="10">
                  <rect x="2" y="0" width="16" height="10" rx="2" fill={item.color} opacity={0.45} />
                </svg>
              ) : (
                <svg width="20" height="10">
                  <line
                    x1="0" y1="5" x2="20" y2="5"
                    stroke={item.color}
                    strokeWidth="2"
                    strokeDasharray={item.dashed ? '4,2' : 'none'}
                  />
                  <circle cx="10" cy="5" r="2.5" fill={item.color} />
                </svg>
              )}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnimatedLineChart;
