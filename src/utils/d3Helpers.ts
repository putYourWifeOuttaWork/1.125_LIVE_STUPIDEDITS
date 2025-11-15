import * as d3 from 'd3';

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const defaultMargin: ChartMargin = {
  top: 20,
  right: 80,
  bottom: 30,
  left: 60
};

export const createSvg = (
  container: HTMLElement,
  width: number,
  height: number,
  margin: ChartMargin = defaultMargin
) => {
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  return { svg, g, innerWidth, innerHeight };
};

export const formatNumber = (value: number, decimals: number = 1): string => {
  return value.toFixed(decimals);
};

export const formatDate = (date: Date): string => {
  return d3.timeFormat('%b %d, %H:%M')(date);
};

export const formatDateShort = (date: Date): string => {
  return d3.timeFormat('%m/%d')(date);
};

export const createTooltip = (container: HTMLElement) => {
  return d3.select(container)
    .append('div')
    .attr('class', 'tooltip')
    .style('position', 'absolute')
    .style('visibility', 'hidden')
    .style('background-color', 'white')
    .style('border', '1px solid #ddd')
    .style('border-radius', '4px')
    .style('padding', '8px')
    .style('font-size', '12px')
    .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)')
    .style('pointer-events', 'none')
    .style('z-index', '1000');
};

export const colorScale = {
  temperature: '#ef4444',  // red-500
  humidity: '#3b82f6',     // blue-500
  pressure: '#8b5cf6',     // purple-500
  gasResistance: '#10b981', // green-500
  positive: '#10b981',      // green
  negative: '#ef4444',      // red
  neutral: '#64748b'        // slate-500
};
