import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { DeviceSnapshotData, SiteLayoutData } from '../../lib/types';
import { getMGIColor } from './MGILegend';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import Button from '../common/Button';

interface SiteMapViewerProps {
  siteLayout: SiteLayoutData;
  devices: DeviceSnapshotData[];
  onDeviceClick?: (device: DeviceSnapshotData) => void;
  selectedDeviceId?: string | null;
  className?: string;
}

export function SiteMapViewer({
  siteLayout,
  devices,
  onDeviceClick,
  selectedDeviceId,
  className = '',
}: SiteMapViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // Maintain aspect ratio based on site dimensions
        const aspectRatio = siteLayout.width / siteLayout.length;
        const height = Math.min(width * aspectRatio, 600);
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [siteLayout]);

  // Render the site map with D3
  useEffect(() => {
    if (!svgRef.current || !siteLayout || !devices) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const { width, height } = dimensions;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create scales for site coordinates to SVG coordinates
    const xScale = d3
      .scaleLinear()
      .domain([0, siteLayout.length])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, siteLayout.width])
      .range([0, innerHeight]);

    // Main group with margins
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add background
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', '#f9fafb')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 2)
      .attr('rx', 4);

    // Draw walls
    if (siteLayout.wall_details && Array.isArray(siteLayout.wall_details)) {
      const wallsGroup = g.append('g').attr('class', 'walls');

      siteLayout.wall_details.forEach((wall) => {
        if (wall.start_point && wall.end_point) {
          wallsGroup
            .append('line')
            .attr('x1', xScale(wall.start_point.x))
            .attr('y1', yScale(wall.start_point.y))
            .attr('x2', xScale(wall.end_point.x))
            .attr('y2', yScale(wall.end_point.y))
            .attr('stroke', '#374151')
            .attr('stroke-width', 3)
            .attr('stroke-linecap', 'round');

          // Add wall label
          const midX = (wall.start_point.x + wall.end_point.x) / 2;
          const midY = (wall.start_point.y + wall.end_point.y) / 2;

          wallsGroup
            .append('text')
            .attr('x', xScale(midX))
            .attr('y', yScale(midY))
            .attr('text-anchor', 'middle')
            .attr('dy', -8)
            .attr('font-size', 11)
            .attr('fill', '#6b7280')
            .text(wall.orientation || '');
        }
      });
    }

    // Draw grid (optional, for reference)
    const gridGroup = g.append('g').attr('class', 'grid').attr('opacity', 0.1);

    // Vertical grid lines every 10ft
    for (let x = 0; x <= siteLayout.length; x += 10) {
      gridGroup
        .append('line')
        .attr('x1', xScale(x))
        .attr('y1', 0)
        .attr('x2', xScale(x))
        .attr('y2', innerHeight)
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 0.5);
    }

    // Horizontal grid lines every 10ft
    for (let y = 0; y <= siteLayout.width; y += 10) {
      gridGroup
        .append('line')
        .attr('x1', 0)
        .attr('y1', yScale(y))
        .attr('x2', innerWidth)
        .attr('y2', yScale(y))
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 0.5);
    }

    // Draw devices
    const devicesGroup = g.append('g').attr('class', 'devices');

    devices.forEach((device) => {
      const deviceGroup = devicesGroup
        .append('g')
        .attr('class', 'device')
        .attr('data-device-id', device.device_id)
        .style('cursor', 'pointer')
        .on('click', () => {
          if (onDeviceClick) {
            onDeviceClick(device);
          }
        });

      const cx = xScale(device.x_position);
      const cy = yScale(device.y_position);
      const isSelected = device.device_id === selectedDeviceId;

      // Device outer ring (for selection highlight)
      if (isSelected) {
        deviceGroup
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 14)
          .attr('fill', 'none')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 3);
      }

      // Device circle (colored by MGI)
      deviceGroup
        .append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 10)
        .attr('fill', getMGIColor(device.mgi_score))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('transition', 'all 0.3s ease');

      // Device label
      deviceGroup
        .append('text')
        .attr('x', cx)
        .attr('y', cy + 24)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', isSelected ? 600 : 400)
        .attr('fill', isSelected ? '#1f2937' : '#6b7280')
        .text(device.device_name);

      // Tooltip on hover
      deviceGroup
        .append('title')
        .text(
          `${device.device_name}\n` +
            `MGI: ${device.mgi_score !== null ? device.mgi_score.toFixed(3) : 'N/A'}\n` +
            `Temp: ${device.temperature !== null ? device.temperature.toFixed(1) + '°F' : 'N/A'}\n` +
            `RH: ${device.humidity !== null ? device.humidity.toFixed(1) + '%' : 'N/A'}\n` +
            `Position: (${device.x_position}, ${device.y_position})`
        );
    });

    // Add scale reference
    const scaleGroup = g
      .append('g')
      .attr('class', 'scale-reference')
      .attr('transform', `translate(10, ${innerHeight - 30})`);

    scaleGroup
      .append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', xScale(10))
      .attr('y2', 0)
      .attr('stroke', '#374151')
      .attr('stroke-width', 2);

    scaleGroup
      .append('text')
      .attr('x', xScale(5))
      .attr('y', -5)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#374151')
      .text('10 ft');
  }, [siteLayout, devices, selectedDeviceId, dimensions, onDeviceClick]);

  return (
    <div ref={containerRef} className={`relative bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Map info header */}
      <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm px-3 py-2 rounded shadow-sm border border-gray-200">
        <div className="text-xs text-gray-600">
          <div className="font-semibold text-gray-800">Site Dimensions</div>
          <div>
            {siteLayout.length} ft × {siteLayout.width} ft
          </div>
          <div className="mt-1 text-gray-500">
            {devices.length} device{devices.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full"
      />
    </div>
  );
}
