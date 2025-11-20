import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Camera, Battery, Clock, Thermometer, Droplets } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import { formatDistanceToNow } from 'date-fns';
import { Delaunay } from 'd3-delaunay';
import { scaleSequential } from 'd3-scale';
import { interpolateRdYlBu, interpolateYlGnBu, interpolateRdYlGn } from 'd3-scale-chromatic';

interface DevicePosition {
  device_id: string;
  device_code: string;
  device_name: string;
  x: number;
  y: number;
  battery_level: number | null;
  status: string;
  last_seen: string | null;
  temperature: number | null;
  humidity: number | null;
  mgi_score: number | null;
}

type ZoneMode = 'none' | 'temperature' | 'humidity' | 'battery' | 'mgi';

interface SiteMapAnalyticsViewerProps {
  siteLength: number;
  siteWidth: number;
  siteName: string;
  devices: DevicePosition[];
  onDeviceClick?: (deviceId: string) => void;
  className?: string;
  showControls?: boolean;
  height?: number;
  zoneMode?: ZoneMode;
  onZoneModeChange?: (mode: ZoneMode) => void;
}

export default function SiteMapAnalyticsViewer({
  siteLength,
  siteWidth,
  siteName,
  devices,
  onDeviceClick,
  className = '',
  showControls = true,
  height,
  zoneMode: externalZoneMode,
  onZoneModeChange,
}: SiteMapAnalyticsViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePosition | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: height || 400 });
  const [internalZoneMode, setInternalZoneMode] = useState<ZoneMode>('temperature');
  const navigate = useNavigate();

  const zoneMode = externalZoneMode !== undefined ? externalZoneMode : internalZoneMode;
  const setZoneMode = onZoneModeChange || setInternalZoneMode;

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const aspectRatio = siteWidth / siteLength;
        const calculatedHeight = height || Math.min(width * aspectRatio, 400);
        setCanvasSize({ width, height: calculatedHeight });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [siteLength, siteWidth, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Voronoi zones if enabled and we have enough devices
    if (zoneMode !== 'none' && devices.length >= 2) {
      drawVoronoiZones(ctx, canvas, zoneMode);
    } else {
      // Background
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Grid (lighter when zones are shown)
    ctx.strokeStyle = zoneMode !== 'none' ? 'rgba(229, 231, 235, 0.3)' : '#e5e7eb';
    ctx.lineWidth = 0.5;
    const gridSize = 1;
    const gridSpacingX = (canvas.width / siteLength) * gridSize;
    const gridSpacingY = (canvas.height / siteWidth) * gridSize;

    for (let x = gridSpacingX; x < canvas.width; x += gridSpacingX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = gridSpacingY; y < canvas.height; y += gridSpacingY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Dimension labels
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`0,0`, 10, 18);
    ctx.fillText(`${siteLength}ft,0`, canvas.width - 55, 18);
    ctx.fillText(`0,${siteWidth}ft`, 10, canvas.height - 8);
    ctx.fillText(`${siteLength}ft,${siteWidth}ft`, canvas.width - 80, canvas.height - 8);

    // Draw devices
    devices.forEach(device => {
      const pixelX = (device.x / siteLength) * canvas.width;
      const pixelY = (device.y / siteWidth) * canvas.height;

      const isHovered = hoveredDevice === device.device_id;
      const radius = isHovered ? 18 : 14;

      // Shadow
      ctx.shadowBlur = isHovered ? 8 : 4;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';

      // Device marker color based on status
      ctx.fillStyle = device.status === 'active' ? '#10b981' :
                      device.status === 'offline' ? '#ef4444' :
                      device.status === 'deactivated' ? '#9ca3af' : '#6b7280';

      ctx.beginPath();
      ctx.arc(pixelX, pixelY, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Camera icon
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', pixelX, pixelY);

      // Device code label
      ctx.fillStyle = '#1f2937';
      ctx.font = isHovered ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(device.device_code, pixelX, pixelY + radius + 12);

      // Battery level
      if (device.battery_level !== null) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = device.battery_level < 20 ? '#ef4444' : '#6b7280';
        ctx.fillText(`${device.battery_level}%`, pixelX, pixelY + radius + 23);
      }
    });

  }, [devices, canvasSize, hoveredDevice, siteLength, siteWidth, zoneMode]);

  const drawVoronoiZones = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, mode: ZoneMode) => {
    if (devices.length < 2) return;

    // Convert device positions to pixel coordinates
    const points: [number, number][] = devices.map(device => [
      (device.x / siteLength) * canvas.width,
      (device.y / siteWidth) * canvas.height,
    ]);

    // Create Delaunay triangulation and Voronoi diagram
    const delaunay = Delaunay.from(points);
    const voronoi = delaunay.voronoi([0, 0, canvas.width, canvas.height]);

    // Get data range for color scale
    let minValue = Infinity;
    let maxValue = -Infinity;

    devices.forEach(device => {
      let value: number | null = null;
      if (mode === 'temperature') value = device.temperature;
      else if (mode === 'humidity') value = device.humidity;
      else if (mode === 'battery') value = device.battery_level;
      else if (mode === 'mgi') value = device.mgi_score;

      if (value !== null) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    });

    // Create color scale
    let colorScale;
    if (mode === 'humidity') {
      colorScale = scaleSequential(interpolateYlGnBu).domain([minValue, maxValue]);
    } else if (mode === 'mgi') {
      // MGI: Green (low/good) to Red (high/bad)
      colorScale = scaleSequential(interpolateRdYlGn).domain([maxValue, minValue]); // Inverted: 0=green, 1=red
    } else {
      // Temperature and battery: Red (hot/low) to Blue (cold/high)
      colorScale = scaleSequential(interpolateRdYlBu).domain([maxValue, minValue]);
    }

    // Draw Voronoi cells
    devices.forEach((device, i) => {
      const cell = voronoi.cellPolygon(i);
      if (!cell) return;

      let value: number | null = null;
      if (mode === 'temperature') value = device.temperature;
      else if (mode === 'humidity') value = device.humidity;
      else if (mode === 'battery') value = device.battery_level;
      else if (mode === 'mgi') value = device.mgi_score;

      if (value === null) {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
      } else {
        const color = colorScale(value);
        ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.4)');
      }

      ctx.beginPath();
      ctx.moveTo(cell[0][0], cell[0][1]);
      for (let j = 1; j < cell.length; j++) {
        ctx.lineTo(cell[j][0], cell[j][1]);
      }
      ctx.closePath();
      ctx.fill();

      // Draw cell borders
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw zone value label
      if (value !== null) {
        const pixelX = (device.x / siteLength) * canvas.width;
        const pixelY = (device.y / siteWidth) * canvas.height;

        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let label = '';
        if (mode === 'temperature') label = `${value.toFixed(1)}°F`;
        else if (mode === 'humidity') label = `${value.toFixed(0)}%`;
        else if (mode === 'battery') label = `${value}%`;
        else if (mode === 'mgi') label = `MGI ${(value * 100).toFixed(0)}%`;

        // Draw label background
        const metrics = ctx.measureText(label);
        const padding = 4;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(
          pixelX - metrics.width / 2 - padding,
          pixelY - 30,
          metrics.width + padding * 2,
          20
        );

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillText(label, pixelX, pixelY - 20);
      }
    });
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const findDeviceAtPosition = (pixelX: number, pixelY: number): DevicePosition | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    for (const device of devices) {
      const devicePixelX = (device.x / siteLength) * canvas.width;
      const devicePixelY = (device.y / siteWidth) * canvas.height;
      const distance = Math.sqrt(
        Math.pow(pixelX - devicePixelX, 2) + Math.pow(pixelY - devicePixelY, 2)
      );
      if (distance < 20) {
        return device;
      }
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const device = findDeviceAtPosition(x, y);
    setHoveredDevice(device?.device_id || null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const device = findDeviceAtPosition(x, y);

    if (device) {
      if (onDeviceClick) {
        onDeviceClick(device.device_id);
      } else {
        navigate(`/devices/${device.device_id}`);
      }
    }
  };

  const hoveredDeviceData = devices.find(d => d.device_id === hoveredDevice);

  if (devices.length === 0) {
    return null;
  }

  // Calculate zone statistics
  const zoneStats = {
    avgTemp: devices.filter(d => d.temperature !== null).reduce((sum, d) => sum + (d.temperature || 0), 0) / devices.filter(d => d.temperature !== null).length || 0,
    avgHumidity: devices.filter(d => d.humidity !== null).reduce((sum, d) => sum + (d.humidity || 0), 0) / devices.filter(d => d.humidity !== null).length || 0,
    avgBattery: devices.filter(d => d.battery_level !== null).reduce((sum, d) => sum + (d.battery_level || 0), 0) / devices.filter(d => d.battery_level !== null).length || 0,
    avgMGI: devices.filter(d => d.mgi_score !== null).reduce((sum, d) => sum + (d.mgi_score || 0), 0) / devices.filter(d => d.mgi_score !== null).length || 0,
  };

  return (
    <div className={`${className}`} ref={containerRef}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="text-primary-600" size={18} />
              <h3 className="text-lg font-semibold text-gray-900">Site Map</h3>
            </div>
            <div className="flex items-center gap-4">
              {showControls && devices.length >= 2 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Zones:</span>
                  <select
                    value={zoneMode}
                    onChange={(e) => setZoneMode(e.target.value as ZoneMode)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <option value="none">None</option>
                    <option value="temperature">Temperature</option>
                    <option value="humidity">Humidity</option>
                    <option value="battery">Battery</option>
                    <option value="mgi">Mold Growth (MGI)</option>
                  </select>
                </div>
              )}
              <div className="text-sm text-gray-600">
                {siteName} • {siteLength}ft × {siteWidth}ft
              </div>
            </div>
          </div>
          {zoneMode !== 'none' && devices.length >= 2 && (
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
              {zoneMode === 'temperature' && (
                <div className="flex items-center gap-1">
                  <Thermometer size={14} />
                  <span>Avg: {zoneStats.avgTemp.toFixed(1)}°F</span>
                </div>
              )}
              {zoneMode === 'humidity' && (
                <div className="flex items-center gap-1">
                  <Droplets size={14} />
                  <span>Avg: {zoneStats.avgHumidity.toFixed(0)}%</span>
                </div>
              )}
              {zoneMode === 'battery' && (
                <div className="flex items-center gap-1">
                  <Battery size={14} />
                  <span>Avg: {zoneStats.avgBattery.toFixed(0)}%</span>
                </div>
              )}
              {zoneMode === 'mgi' && (
                <div className="flex items-center gap-1">
                  <Camera size={14} />
                  <span>Avg MGI: {(zoneStats.avgMGI * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="w-full border border-gray-200 rounded cursor-pointer"
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              onMouseLeave={() => setHoveredDevice(null)}
            />

            {/* Device Info Tooltip on Hover */}
            {hoveredDeviceData && (
              <div className="absolute top-2 right-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px] z-10">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-gray-900">{hoveredDeviceData.device_name}</p>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    hoveredDeviceData.status === 'active' ? 'bg-green-100 text-green-800' :
                    hoveredDeviceData.status === 'offline' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {hoveredDeviceData.status}
                  </span>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Camera size={14} />
                    <span>{hoveredDeviceData.device_code}</span>
                  </div>

                  {hoveredDeviceData.battery_level !== null && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Battery size={14} />
                      <span>{hoveredDeviceData.battery_level}%</span>
                    </div>
                  )}

                  {hoveredDeviceData.temperature !== null && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Thermometer size={14} />
                      <span>{hoveredDeviceData.temperature}°F</span>
                    </div>
                  )}

                  {hoveredDeviceData.last_seen && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock size={14} />
                      <span>{formatDistanceToNow(new Date(hoveredDeviceData.last_seen), { addSuffix: true })}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={14} />
                    <span>({hoveredDeviceData.x}, {hoveredDeviceData.y})</span>
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-2">Click to view details</p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span>Active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span>Offline</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <span>Deactivated</span>
                </div>
              </div>
              <span>{devices.length} {devices.length === 1 ? 'device' : 'devices'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
