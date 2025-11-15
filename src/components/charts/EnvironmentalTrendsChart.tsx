import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { createSvg, createTooltip, formatDate, formatNumber, colorScale, defaultMargin } from '../../utils/d3Helpers';

interface TelemetryData {
  timestamp: Date;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  gasResistance: number | null;
}

interface EnvironmentalTrendsChartProps {
  data: TelemetryData[];
  width?: number;
  height?: number;
  showLegend?: boolean;
}

const EnvironmentalTrendsChart = ({
  data,
  width = 800,
  height = 400,
  showLegend = true
}: EnvironmentalTrendsChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMetrics, setActiveMetrics] = useState({
    temperature: true,
    humidity: true,
    pressure: true,
    gasResistance: false
  });

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const margin = { ...defaultMargin, right: 100 };
    const { g, innerWidth, innerHeight } = createSvg(container, width, height, margin);

    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => d.timestamp) as [Date, Date])
      .range([0, innerWidth]);

    const yScales = {
      temperature: d3.scaleLinear()
        .domain([
          d3.min(data, d => d.temperature || 0) as number - 5,
          d3.max(data, d => d.temperature || 0) as number + 5
        ])
        .range([innerHeight, 0]),
      humidity: d3.scaleLinear()
        .domain([0, 100])
        .range([innerHeight, 0]),
      pressure: d3.scaleLinear()
        .domain([
          d3.min(data, d => d.pressure || 0) as number - 10,
          d3.max(data, d => d.pressure || 0) as number + 10
        ])
        .range([innerHeight, 0]),
      gasResistance: d3.scaleLinear()
        .domain([0, d3.max(data, d => d.gasResistance || 0) as number])
        .range([innerHeight, 0])
    };

    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat(d3.timeFormat('%b %d'));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '11px');

    const lineGenerators = {
      temperature: d3.line<TelemetryData>()
        .defined(d => d.temperature !== null)
        .x(d => xScale(d.timestamp))
        .y(d => yScales.temperature(d.temperature || 0))
        .curve(d3.curveMonotoneX),
      humidity: d3.line<TelemetryData>()
        .defined(d => d.humidity !== null)
        .x(d => xScale(d.timestamp))
        .y(d => yScales.humidity(d.humidity || 0))
        .curve(d3.curveMonotoneX),
      pressure: d3.line<TelemetryData>()
        .defined(d => d.pressure !== null)
        .x(d => xScale(d.timestamp))
        .y(d => yScales.pressure(d.pressure || 0))
        .curve(d3.curveMonotoneX),
      gasResistance: d3.line<TelemetryData>()
        .defined(d => d.gasResistance !== null)
        .x(d => xScale(d.timestamp))
        .y(d => yScales.gasResistance(d.gasResistance || 0))
        .curve(d3.curveMonotoneX)
    };

    if (activeMetrics.temperature) {
      g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', colorScale.temperature)
        .attr('stroke-width', 2)
        .attr('d', lineGenerators.temperature);
    }

    if (activeMetrics.humidity) {
      g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', colorScale.humidity)
        .attr('stroke-width', 2)
        .attr('d', lineGenerators.humidity);
    }

    if (activeMetrics.pressure) {
      g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', colorScale.pressure)
        .attr('stroke-width', 2)
        .attr('d', lineGenerators.pressure);
    }

    if (activeMetrics.gasResistance) {
      g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', colorScale.gasResistance)
        .attr('stroke-width', 2)
        .attr('d', lineGenerators.gasResistance);
    }

    const tooltip = createTooltip(container);

    const focus = g.append('g')
      .style('display', 'none');

    focus.append('circle')
      .attr('r', 4)
      .attr('fill', 'steelblue');

    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mouseover', () => {
        focus.style('display', null);
        tooltip.style('visibility', 'visible');
      })
      .on('mouseout', () => {
        focus.style('display', 'none');
        tooltip.style('visibility', 'hidden');
      })
      .on('mousemove', function(event) {
        const [xPos] = d3.pointer(event);
        const x0 = xScale.invert(xPos);
        const bisect = d3.bisector((d: TelemetryData) => d.timestamp).left;
        const index = bisect(data, x0, 1);
        const d0 = data[index - 1];
        const d1 = data[index];
        if (!d0 || !d1) return;

        const d = x0.getTime() - d0.timestamp.getTime() > d1.timestamp.getTime() - x0.getTime() ? d1 : d0;

        let tooltipHtml = `<div style="font-weight: bold; margin-bottom: 4px;">${formatDate(d.timestamp)}</div>`;

        if (activeMetrics.temperature && d.temperature !== null) {
          tooltipHtml += `<div style="color: ${colorScale.temperature};">Temperature: ${formatNumber(d.temperature)}°F</div>`;
        }
        if (activeMetrics.humidity && d.humidity !== null) {
          tooltipHtml += `<div style="color: ${colorScale.humidity};">Humidity: ${formatNumber(d.humidity)}%</div>`;
        }
        if (activeMetrics.pressure && d.pressure !== null) {
          tooltipHtml += `<div style="color: ${colorScale.pressure};">Pressure: ${formatNumber(d.pressure, 0)} hPa</div>`;
        }
        if (activeMetrics.gasResistance && d.gasResistance !== null) {
          tooltipHtml += `<div style="color: ${colorScale.gasResistance};">Gas: ${formatNumber(d.gasResistance, 0)} Ω</div>`;
        }

        tooltip
          .html(tooltipHtml)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      });

    return () => {
      tooltip.remove();
    };
  }, [data, width, height, activeMetrics]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No environmental data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showLegend && (
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => setActiveMetrics(prev => ({ ...prev, temperature: !prev.temperature }))}
            className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors ${
              activeMetrics.temperature
                ? 'bg-red-100 text-red-800 border border-red-300'
                : 'bg-gray-100 text-gray-500 border border-gray-300'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colorScale.temperature }}
            />
            Temperature
          </button>
          <button
            onClick={() => setActiveMetrics(prev => ({ ...prev, humidity: !prev.humidity }))}
            className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors ${
              activeMetrics.humidity
                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                : 'bg-gray-100 text-gray-500 border border-gray-300'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colorScale.humidity }}
            />
            Humidity
          </button>
          <button
            onClick={() => setActiveMetrics(prev => ({ ...prev, pressure: !prev.pressure }))}
            className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors ${
              activeMetrics.pressure
                ? 'bg-purple-100 text-purple-800 border border-purple-300'
                : 'bg-gray-100 text-gray-500 border border-gray-300'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colorScale.pressure }}
            />
            Pressure
          </button>
          <button
            onClick={() => setActiveMetrics(prev => ({ ...prev, gasResistance: !prev.gasResistance }))}
            className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors ${
              activeMetrics.gasResistance
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-gray-100 text-gray-500 border border-gray-300'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colorScale.gasResistance }}
            />
            Gas Resistance
          </button>
        </div>
      )}
      <div ref={containerRef} className="bg-white rounded-lg p-4 border border-gray-200" />
    </div>
  );
};

export default EnvironmentalTrendsChart;
