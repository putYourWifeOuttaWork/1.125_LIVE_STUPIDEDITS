import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Camera, Battery, Clock, Thermometer, Droplets, AlertTriangle } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import { formatDistanceToNow } from 'date-fns';
import { Delaunay } from 'd3-delaunay';
import { scaleSequential } from 'd3-scale';
import { interpolateRdYlBu, interpolateYlGnBu, interpolateRdYlGn } from 'd3-scale-chromatic';
import { getMGIColor, getVelocityColor, getVelocityPulseRadius, isCriticalVelocity } from '../../utils/mgiUtils';

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
  mgi_velocity: number | null;
}

type ZoneMode = 'none' | 'temperature' | 'humidity' | 'battery';

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
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePosition | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: height || 400 });
  const [internalZoneMode, setInternalZoneMode] = useState<ZoneMode>('temperature');
  const [pulseFrame, setPulseFrame] = useState(0);
  const navigate = useNavigate();

  const zoneMode = externalZoneMode !== undefined ? externalZoneMode : internalZoneMode;
  const setZoneMode = onZoneModeChange || setInternalZoneMode;

  // Animation loop for pulse effect
  useEffect(() => {
    let animationId: number;
    const animate = () => {
      setPulseFrame(prev => (prev + 1) % 60); // 60 frames cycle
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

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

    // Draw devices with MGI colors and pulse animations
    devices.forEach(device => {
      const pixelX = (device.x / siteLength) * canvas.width;
      const pixelY = (device.y / siteWidth) * canvas.height;

      const isHovered = hoveredDevice === device.device_id;
      const baseRadius = isHovered ? 18 : 14;

      // Get MGI color for the node circle (always shown, regardless of zone mode)
      const mgiColor = getMGIColor(device.mgi_score);

      // Get velocity color for the pulse ring (separate from node)
      const velocityColor = getVelocityColor(device.mgi_velocity);

      // Draw pulse animation if device has velocity data
      if (device.mgi_velocity !== null && device.mgi_velocity !== undefined) {
        const pulseRadius = getVelocityPulseRadius(device.mgi_velocity, baseRadius);
        const pulseProgress = (pulseFrame % 60) / 60; // 0 to 1
        const pulseAlpha = 1 - pulseProgress; // Fade out as it expands
        const currentPulseRadius = baseRadius + (pulseRadius - baseRadius) * pulseProgress;

        // Use velocity color for pulse, not MGI color
        ctx.strokeStyle = velocityColor.replace(')', `, ${pulseAlpha * 0.6})`).replace('rgb', 'rgba');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, currentPulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shadow
      ctx.shadowBlur = isHovered ? 8 : 4;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';

      // Device marker with MGI color
      ctx.fillStyle = mgiColor;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Critical velocity warning triangle
      if (isCriticalVelocity(device.mgi_velocity)) {
        const triangleSize = baseRadius * 0.6;
        ctx.fillStyle = '#dc2626'; // Red warning
        ctx.beginPath();
        ctx.moveTo(pixelX, pixelY - triangleSize);
        ctx.lineTo(pixelX - triangleSize * 0.866, pixelY + triangleSize * 0.5);
        ctx.lineTo(pixelX + triangleSize * 0.866, pixelY + triangleSize * 0.5);
        ctx.closePath();
        ctx.fill();

        // White exclamation mark
        ctx.fillStyle = 'white';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', pixelX, pixelY);
      } else {
        // Camera icon (only if not showing warning)
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷', pixelX, pixelY);
      }

      // Device code label (always visible)
      ctx.fillStyle = isHovered ? '#1f2937' : '#6b7280';
      ctx.font = isHovered ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(device.device_code, pixelX, pixelY + baseRadius + 14);
    });

  }, [devices, canvasSize, hoveredDevice, siteLength, siteWidth, zoneMode, pulseFrame]);

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

      if (value !== null) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    });

    // Create color scale
    let colorScale;
    if (mode === 'humidity') {
      colorScale = scaleSequential(interpolateYlGnBu).domain([minValue, maxValue]);
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

      if (value === null) {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
      } else {
        const color = colorScale(value);
        // Convert hex or rgb to rgba with 40% opacity
        if (color && typeof color === 'string') {
          if (color.startsWith('#')) {
            // Hex to rgba
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
          } else if (color.startsWith('rgb')) {
            // rgb to rgba
            ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.4)');
          } else {
            // Fallback
            ctx.fillStyle = 'rgba(200, 200, 200, 0.4)';
          }
        } else {
          // Fallback if color is undefined
          ctx.fillStyle = 'rgba(200, 200, 200, 0.4)';
        }
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

    // Track mouse position relative to the canvas
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
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
                    <option value="temperature">Temperature</option>
                    <option value="humidity">Humidity</option>
                    <option value="battery">Battery</option>
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
              onMouseLeave={() => {
                setHoveredDevice(null);
                setMousePosition(null);
              }}
            />

            {/* Device Info Tooltip on Hover - Follows Cursor */}
            {hoveredDeviceData && mousePosition && (
              <div
                className="absolute bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px] z-10 pointer-events-none"
                style={{
                  left: `${mousePosition.x + 20}px`,
                  top: `${mousePosition.y + 20}px`,
                  transform: mousePosition.x > canvasSize.width - 240 ? 'translateX(-100%) translateX(-40px)' : 'none',
                }}
              >
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

                  {hoveredDeviceData.humidity !== null && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Droplets size={14} />
                      <span>{hoveredDeviceData.humidity}%</span>
                    </div>
                  )}

                  {hoveredDeviceData.mgi_score !== null && hoveredDeviceData.mgi_score !== undefined && !isNaN(hoveredDeviceData.mgi_score) && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Camera size={14} />
                      <span>MGI: {(hoveredDeviceData.mgi_score * 100).toFixed(1)}%</span>
                    </div>
                  )}

                  {hoveredDeviceData.mgi_velocity !== null && hoveredDeviceData.mgi_velocity !== undefined && !isNaN(hoveredDeviceData.mgi_velocity) && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <AlertTriangle size={14} />
                      <span>Velocity: {hoveredDeviceData.mgi_velocity >= 0 ? '+' : ''}{(hoveredDeviceData.mgi_velocity * 100).toFixed(1)}%</span>
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
