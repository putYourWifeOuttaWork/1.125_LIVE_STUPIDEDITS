import { useRef, useEffect, useState, useMemo } from 'react';
import { MapPin, Camera, Battery, Clock, Thermometer, Droplets, AlertTriangle, Wind, Gauge, ShieldAlert } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import { formatDistanceToNow } from 'date-fns';
import { getMGIColor, getVelocityColor, getVelocityPulseRadius, isCriticalVelocity } from '../../utils/mgiUtils';
import {
  type ContourZoneMode,
  type SensorPoint,
  buildIDWGrid,
  buildConfidenceGrid,
  generateContourBands,
  renderContourToCanvas,
  getValueLabel,
  getModeDomain,
  buildLegendStops,
} from '../../utils/idwContour';

export interface DevicePosition {
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
  pressure: number | null;
  gas_resistance: number | null;
  mgi_score: number | null;
  mgi_velocity: number | null;
  vtt_mold_risk: number | null;
}

export type ZoneMode = ContourZoneMode;

interface SiteMapAnalyticsViewerProps {
  siteLength: number;
  siteWidth: number;
  siteName: string;
  devices: DevicePosition[];
  onDeviceClick?: (deviceId: string) => void;
  highlightDeviceId?: string | null;
  className?: string;
  showControls?: boolean;
  height?: number;
  zoneMode?: ZoneMode;
  onZoneModeChange?: (mode: ZoneMode) => void;
}

function getDeviceValue(device: DevicePosition, mode: ZoneMode): number | null {
  switch (mode) {
    case 'temperature': return device.temperature;
    case 'humidity': return device.humidity;
    case 'battery': return device.battery_level;
    case 'pressure': return device.pressure;
    case 'gas_resistance': return device.gas_resistance;
    case 'mold_risk': return device.vtt_mold_risk ?? device.mgi_score;
    default: return null;
  }
}

function getZoneModeIcon(mode: ZoneMode, size: number) {
  switch (mode) {
    case 'temperature': return <Thermometer size={size} />;
    case 'humidity': return <Droplets size={size} />;
    case 'battery': return <Battery size={size} />;
    case 'pressure': return <Gauge size={size} />;
    case 'gas_resistance': return <Wind size={size} />;
    case 'mold_risk': return <ShieldAlert size={size} />;
    default: return null;
  }
}

function getZoneModeLabel(mode: ZoneMode): string {
  switch (mode) {
    case 'temperature': return 'Temperature';
    case 'humidity': return 'Humidity';
    case 'battery': return 'Battery';
    case 'pressure': return 'Air Pressure';
    case 'gas_resistance': return 'Gas Resistance';
    case 'mold_risk': return 'Mold Risk Index';
    default: return '';
  }
}

export default function SiteMapAnalyticsViewer({
  siteLength,
  siteWidth,
  siteName,
  devices,
  onDeviceClick,
  highlightDeviceId,
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
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: height || 400 });
  const [internalZoneMode, setInternalZoneMode] = useState<ZoneMode>('temperature');
  const [pulseFrame, setPulseFrame] = useState(0);

  const zoneMode = externalZoneMode !== undefined ? externalZoneMode : internalZoneMode;
  const setZoneMode = onZoneModeChange || setInternalZoneMode;

  useEffect(() => {
    let animationId: number;
    const animate = () => {
      setPulseFrame(prev => (prev + 1) % 60);
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

  const contourData = useMemo(() => {
    if (zoneMode === 'none' || devices.length < 1) return null;

    const sensors: SensorPoint[] = [];
    for (const device of devices) {
      const value = getDeviceValue(device, zoneMode);
      if (value !== null) {
        sensors.push({ x: device.x, y: device.y, value });
      }
    }
    if (sensors.length === 0) return null;

    const maxDiagonal = Math.sqrt(siteLength * siteLength + siteWidth * siteWidth);
    const maxRadius = Math.min(maxDiagonal * 0.6, 80);

    if (sensors.length === 1) {
      return { sensors, maxRadius, type: 'single' as const };
    }

    const grid = buildIDWGrid(siteLength, siteWidth, sensors);
    const confidenceGrid = buildConfidenceGrid(siteLength, siteWidth, sensors, 1, maxRadius);
    return { sensors, grid, confidenceGrid, maxRadius, type: 'multi' as const };
  }, [devices, zoneMode, siteLength, siteWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (contourData && contourData.type === 'multi') {
      const bands = generateContourBands(contourData.grid, zoneMode, canvas.width, canvas.height);
      renderContourToCanvas(ctx, canvas, bands, contourData.confidenceGrid, contourData.grid.cols, contourData.grid.rows);
    } else if (contourData && contourData.type === 'single') {
      drawSingleDeviceGradient(ctx, canvas, contourData.sensors[0]);
    }

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    const gridOpacity = zoneMode !== 'none' && contourData ? 0.15 : 1;
    ctx.strokeStyle = `rgba(229, 231, 235, ${gridOpacity})`;
    ctx.lineWidth = 0.5;
    const gridSpacingX = (canvas.width / siteLength);
    const gridSpacingY = (canvas.height / siteWidth);
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

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('0,0', 10, 18);
    ctx.textAlign = 'right';
    ctx.fillText(`${siteLength}ft,0`, canvas.width - 10, 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`0,${siteWidth}ft`, 10, canvas.height - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${siteLength}ft,${siteWidth}ft`, canvas.width - 10, canvas.height - 8);

    drawDeviceNodes(ctx, canvas);
  }, [devices, canvasSize, hoveredDevice, siteLength, siteWidth, zoneMode, pulseFrame, highlightDeviceId, contourData]);

  function drawSingleDeviceGradient(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, sensor: SensorPoint) {
    const domain = getModeDomain(zoneMode);
    const minVal = domain ? domain[0] : sensor.value - 5;
    const maxVal = domain ? domain[1] : sensor.value + 5;

    const stops = buildLegendStops(zoneMode, minVal, maxVal, 2);
    const centerColor = stops.length > 0 ? stops[0].color : 'rgb(200,200,200)';

    const match = centerColor.match(/\d+/g);
    const r = match ? parseInt(match[0]) : 200;
    const g = match ? parseInt(match[1]) : 200;
    const b = match ? parseInt(match[2]) : 200;

    const pixelX = (sensor.x / siteLength) * canvas.width;
    const pixelY = (sensor.y / siteWidth) * canvas.height;

    const pixelsPerFootX = canvas.width / siteLength;
    const pixelsPerFootY = canvas.height / siteWidth;
    const pixelsPerFoot = (pixelsPerFootX + pixelsPerFootY) / 2;
    const radiusPixels = Math.sqrt(2000 / Math.PI) * pixelsPerFoot;

    const gradient = ctx.createRadialGradient(pixelX, pixelY, 0, pixelX, pixelY, radiusPixels);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.65)`);
    gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.45)`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.2)`);
    gradient.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, 0.08)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.01)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawDeviceNodes(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    devices.forEach(device => {
      const pixelX = (device.x / siteLength) * canvas.width;
      const pixelY = (device.y / siteWidth) * canvas.height;
      const isHovered = hoveredDevice === device.device_id;
      const baseRadius = isHovered ? 18 : 16;

      const mgiColor = getMGIColor(device.mgi_score);
      const velocityColor = getVelocityColor(device.mgi_velocity);

      if (device.mgi_velocity !== null && device.mgi_velocity !== undefined) {
        const pulseRadius = getVelocityPulseRadius(device.mgi_velocity, baseRadius);
        const pulseProgress = (pulseFrame % 60) / 60;
        const pulseAlpha = 1 - pulseProgress;
        const currentPulseRadius = baseRadius + (pulseRadius - baseRadius) * pulseProgress;
        ctx.strokeStyle = velocityColor.replace(')', `, ${pulseAlpha * 0.6})`).replace('rgb', 'rgba');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, currentPulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(pixelX, pixelY, baseRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();

      ctx.shadowBlur = isHovered ? 10 : 5;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.fillStyle = mgiColor;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isCriticalVelocity(device.mgi_velocity)) {
        const triangleSize = baseRadius * 0.6;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(pixelX, pixelY - triangleSize);
        ctx.lineTo(pixelX - triangleSize * 0.866, pixelY + triangleSize * 0.5);
        ctx.lineTo(pixelX + triangleSize * 0.866, pixelY + triangleSize * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', pixelX, pixelY);
      } else {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83D\uDCF7', pixelX, pixelY);
      }

      if (highlightDeviceId === device.device_id) {
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, baseRadius + 6, 0, Math.PI * 2);
        ctx.stroke();
        const alertPulseProgress = (pulseFrame % 60) / 60;
        const alertPulseRadius = baseRadius + 6 + (12 * alertPulseProgress);
        const alertPulseAlpha = 1 - alertPulseProgress;
        ctx.strokeStyle = `rgba(220, 38, 38, ${alertPulseAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, alertPulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (zoneMode !== 'none') {
        const value = getDeviceValue(device, zoneMode);
        if (value !== null) {
          const label = getValueLabel(value, zoneMode);
          ctx.font = 'bold 12px sans-serif';
          const metrics = ctx.measureText(label);
          const labelPadding = 4;
          const labelY = pixelY - baseRadius - 12;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          const lw = metrics.width + labelPadding * 2;
          const lh = 18;
          const lx = pixelX - lw / 2;
          const ly = labelY - lh / 2;
          const cr = 4;
          ctx.moveTo(lx + cr, ly);
          ctx.lineTo(lx + lw - cr, ly);
          ctx.quadraticCurveTo(lx + lw, ly, lx + lw, ly + cr);
          ctx.lineTo(lx + lw, ly + lh - cr);
          ctx.quadraticCurveTo(lx + lw, ly + lh, lx + lw - cr, ly + lh);
          ctx.lineTo(lx + cr, ly + lh);
          ctx.quadraticCurveTo(lx, ly + lh, lx, ly + lh - cr);
          ctx.lineTo(lx, ly + cr);
          ctx.quadraticCurveTo(lx, ly, lx + cr, ly);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, pixelX, labelY);
        }
      }

      ctx.fillStyle = isHovered ? '#1f2937' : '#6b7280';
      ctx.font = isHovered ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(device.device_code, pixelX, pixelY + baseRadius + 6);
    });
  }

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
      if (distance < 24) return device;
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const device = findDeviceAtPosition(x, y);
    setHoveredDevice(device?.device_id || null);
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const device = findDeviceAtPosition(x, y);
    if (device && onDeviceClick) onDeviceClick(device.device_id);
  };

  const hoveredDeviceData = devices.find(d => d.device_id === hoveredDevice);

  if (devices.length === 0) return null;

  const calculateAverage = (values: (number | null)[]) => {
    const validValues = values.filter(v => v !== null) as number[];
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  };

  const devicesWithData = devices.filter(d => getDeviceValue(d, zoneMode) !== null).length;
  const avgValue = calculateAverage(devices.map(d => getDeviceValue(d, zoneMode)));

  const legendStops = useMemo(() => {
    if (zoneMode === 'none' || !contourData) return null;
    if (contourData.type === 'multi') {
      return buildLegendStops(zoneMode, contourData.grid.minValue, contourData.grid.maxValue, 6);
    }
    const domain = getModeDomain(zoneMode);
    if (domain) return buildLegendStops(zoneMode, domain[0], domain[1], 6);
    return null;
  }, [zoneMode, contourData]);

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
              {showControls && devices.length >= 1 && (
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
                    <option value="pressure">Air Pressure</option>
                    <option value="gas_resistance">Gas Resistance</option>
                    <option value="mold_risk">Mold Risk Index</option>
                  </select>
                </div>
              )}
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <span className="font-medium">{devices.length} {devices.length === 1 ? 'device' : 'devices'}</span>
                <span className="text-gray-400">&bull;</span>
                <span>{siteName} &bull; {siteLength}ft &times; {siteWidth}ft</span>
              </div>
            </div>
          </div>
          {zoneMode !== 'none' && devicesWithData > 0 && (
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                {getZoneModeIcon(zoneMode, 14)}
                <span>
                  Avg: {getValueLabel(avgValue, zoneMode)} ({devicesWithData}/{devices.length} devices)
                </span>
              </div>
              {devices.length >= 2 && (
                <span className="text-gray-400">Interpolated from {devicesWithData} sensors</span>
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

            {hoveredDeviceData && mousePosition && (() => {
              const tooltipWidth = 260;
              const tooltipHeight = 240;
              const offset = 20;
              const wouldOverflowRight = mousePosition.x + offset + tooltipWidth > canvasSize.width;
              const wouldOverflowBottom = mousePosition.y + offset + tooltipHeight > canvasSize.height;
              const wouldOverflowLeft = mousePosition.x - offset - tooltipWidth < 0;
              const wouldOverflowTop = mousePosition.y - offset - tooltipHeight < 0;
              let left = mousePosition.x + offset;
              let top = mousePosition.y + offset;
              if (wouldOverflowRight && !wouldOverflowLeft) left = mousePosition.x - offset - tooltipWidth;
              else if (wouldOverflowRight && wouldOverflowLeft) left = canvasSize.width / 2 - tooltipWidth / 2;
              if (wouldOverflowBottom && !wouldOverflowTop) top = mousePosition.y - offset - tooltipHeight;
              else if (wouldOverflowBottom && wouldOverflowTop) top = canvasSize.height / 2 - tooltipHeight / 2;

              return (
                <div
                  className="absolute bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[220px] max-w-[260px] z-10 pointer-events-none"
                  style={{
                    left: `${Math.max(0, Math.min(left, canvasSize.width - tooltipWidth))}px`,
                    top: `${Math.max(0, Math.min(top, canvasSize.height - tooltipHeight))}px`,
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
                        <span>{hoveredDeviceData.temperature.toFixed(1)}&deg;F</span>
                      </div>
                    )}
                    {hoveredDeviceData.humidity !== null && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Droplets size={14} />
                        <span>{hoveredDeviceData.humidity.toFixed(0)}%</span>
                      </div>
                    )}
                    {hoveredDeviceData.pressure !== null && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Gauge size={14} />
                        <span>{hoveredDeviceData.pressure.toFixed(0)} hPa</span>
                      </div>
                    )}
                    {hoveredDeviceData.gas_resistance !== null && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Wind size={14} />
                        <span>{(hoveredDeviceData.gas_resistance / 1000).toFixed(1)} k&Omega;</span>
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
                    {hoveredDeviceData.vtt_mold_risk !== null && hoveredDeviceData.vtt_mold_risk !== undefined && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <ShieldAlert size={14} />
                        <span>Mold Risk: {(hoveredDeviceData.vtt_mold_risk * 100).toFixed(0)}%</span>
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
              );
            })()}
          </div>

          {zoneMode !== 'none' && legendStops && legendStops.length > 0 && (
            <div className="mt-3 pt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-500">{getZoneModeLabel(zoneMode)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500 min-w-[40px] text-right">{legendStops[0].label}</span>
                <div className="flex-1 h-3 rounded-sm overflow-hidden flex">
                  {legendStops.map((stop, i) => {
                    if (i === legendStops.length - 1) return null;
                    const next = legendStops[i + 1];
                    return (
                      <div
                        key={i}
                        className="flex-1 h-full"
                        style={{
                          background: `linear-gradient(to right, ${stop.color}, ${next.color})`,
                          opacity: 0.7,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] text-gray-500 min-w-[40px]">{legendStops[legendStops.length - 1].label}</span>
              </div>
            </div>
          )}

          <div className={`${legendStops && zoneMode !== 'none' ? 'mt-2' : 'mt-3'} pt-2 border-t border-gray-100`}>
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
