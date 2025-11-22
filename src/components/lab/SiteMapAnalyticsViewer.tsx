import { useRef, useEffect, useState } from 'react';
import { Camera, Grid, ZoomIn, ZoomOut, Maximize2, Minimize2, Activity, Thermometer, Droplets } from 'lucide-react';
import Button from '../common/Button';

interface DeviceData {
  device_id: string;
  device_code: string;
  device_name?: string;
  x_position: number;
  y_position: number;
  battery_voltage?: number;
  battery_health_percent?: number;
  status?: string;
  last_seen_at?: string;
  temperature?: number;
  humidity?: number;
  mgi_score?: number;
  zone_label?: string;
}

interface SiteMapAnalyticsViewerProps {
  siteLength: number;
  siteWidth: number;
  siteName?: string;
  devices: DeviceData[];
  onDeviceClick?: (deviceId: string) => void;
  showControls?: boolean;
  height?: number;
  zoneMode?: 'none' | 'temperature' | 'humidity' | 'mgi';
  onZoneModeChange?: (mode: 'none' | 'temperature' | 'humidity' | 'mgi') => void;
  className?: string;
}

export default function SiteMapAnalyticsViewer({
  siteLength,
  siteWidth,
  siteName,
  devices,
  onDeviceClick,
  showControls = true,
  height = 500,
  zoneMode = 'none',
  onZoneModeChange,
  className = '',
}: SiteMapAnalyticsViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height });
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const gridSize = 1;

  // Update canvas size based on container
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const aspectRatio = siteWidth / siteLength;
        const calculatedHeight = Math.min(width * aspectRatio, height);
        setCanvasSize({ width, height: calculatedHeight });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [siteLength, siteWidth, height]);

  // Get color based on value and zone mode
  const getZoneColor = (device: DeviceData): string => {
    if (zoneMode === 'temperature' && device.temperature != null) {
      const temp = device.temperature;
      if (temp < 15) return 'rgba(59, 130, 246, 0.3)'; // Blue - cold
      if (temp < 20) return 'rgba(34, 197, 94, 0.3)'; // Green - cool
      if (temp < 25) return 'rgba(234, 179, 8, 0.3)'; // Yellow - warm
      return 'rgba(239, 68, 68, 0.3)'; // Red - hot
    }
    if (zoneMode === 'humidity' && device.humidity != null) {
      const humidity = device.humidity;
      if (humidity < 30) return 'rgba(239, 68, 68, 0.3)'; // Red - dry
      if (humidity < 50) return 'rgba(234, 179, 8, 0.3)'; // Yellow - low
      if (humidity < 70) return 'rgba(34, 197, 94, 0.3)'; // Green - ideal
      return 'rgba(59, 130, 246, 0.3)'; // Blue - humid
    }
    if (zoneMode === 'mgi' && device.mgi_score != null) {
      const mgi = device.mgi_score;
      if (mgi < 25) return 'rgba(34, 197, 94, 0.3)'; // Green - good
      if (mgi < 50) return 'rgba(234, 179, 8, 0.3)'; // Yellow - moderate
      if (mgi < 75) return 'rgba(249, 115, 22, 0.3)'; // Orange - concerning
      return 'rgba(239, 68, 68, 0.3)'; // Red - critical
    }
    return 'transparent';
  };

  // Get device color based on status
  const getDeviceColor = (device: DeviceData): string => {
    if (device.status === 'inactive') return '#9ca3af';
    if (device.battery_health_percent != null) {
      if (device.battery_health_percent < 20) return '#ef4444'; // Red - low battery
      if (device.battery_health_percent < 40) return '#f59e0b'; // Orange - moderate
    }
    return '#3b82f6'; // Blue - good
  };

  // Render the map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Grid
    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.5;
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
    }

    // Draw zone overlays if zone mode is active
    if (zoneMode !== 'none') {
      devices.forEach((device) => {
        const x = (device.x_position / siteLength) * canvas.width;
        const y = (device.y_position / siteWidth) * canvas.height;
        const zoneRadius = 40;

        ctx.fillStyle = getZoneColor(device);
        ctx.beginPath();
        ctx.arc(x, y, zoneRadius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw devices
    devices.forEach((device) => {
      const x = (device.x_position / siteLength) * canvas.width;
      const y = (device.y_position / siteWidth) * canvas.height;
      const radius = 8;
      const isHovered = hoveredDevice === device.device_id;

      // Device circle
      ctx.fillStyle = getDeviceColor(device);
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? radius * 1.5 : radius, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = isHovered ? '#1e40af' : '#fff';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.stroke();

      // Device label
      if (isHovered || devices.length < 20) {
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(device.device_code || device.device_name || 'Device', x, y - 15);

        // Show zone label if available
        if (device.zone_label) {
          ctx.fillStyle = '#6b7280';
          ctx.font = '9px Inter, sans-serif';
          ctx.fillText(`Zone: ${device.zone_label}`, x, y - 25);
        }
      }
    });

    // Scale indicator
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${siteLength}m × ${siteWidth}m`, 10, canvas.height - 10);

  }, [devices, canvasSize, showGrid, scale, hoveredDevice, siteLength, siteWidth, zoneMode]);

  // Handle mouse move for hover effects
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let foundDevice: string | null = null;

    for (const device of devices) {
      const x = (device.x_position / siteLength) * canvas.width;
      const y = (device.y_position / siteWidth) * canvas.height;
      const distance = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));

      if (distance < 12) {
        foundDevice = device.device_id;
        break;
      }
    }

    setHoveredDevice(foundDevice);
  };

  // Handle click
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredDevice && onDeviceClick) {
      onDeviceClick(hoveredDevice);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header with controls */}
      {showControls && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                {siteName || 'Site Map'}
              </h3>
              <span className="text-sm text-gray-500">
                ({devices.length} device{devices.length !== 1 ? 's' : ''})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showGrid ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(Math.min(scale + 0.25, 2))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(Math.max(scale - 0.25, 0.5))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Zone mode selector */}
          {onZoneModeChange && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Zone View:</span>
              <Button
                variant={zoneMode === 'none' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => onZoneModeChange('none')}
              >
                None
              </Button>
              <Button
                variant={zoneMode === 'temperature' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => onZoneModeChange('temperature')}
              >
                <Thermometer className="w-4 h-4 mr-1" />
                Temperature
              </Button>
              <Button
                variant={zoneMode === 'humidity' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => onZoneModeChange('humidity')}
              >
                <Droplets className="w-4 h-4 mr-1" />
                Humidity
              </Button>
              <Button
                variant={zoneMode === 'mgi' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => onZoneModeChange('mgi')}
              >
                <Activity className="w-4 h-4 mr-1" />
                MGI
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-4' : 'p-4'}`}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="w-full h-auto cursor-pointer"
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>

      {/* Hover tooltip */}
      {hoveredDevice && (
        <div className="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none">
          {devices.find(d => d.device_id === hoveredDevice)?.device_code}
        </div>
      )}
    </div>
  );
}
