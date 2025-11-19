import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Camera, Battery, Clock, Thermometer } from 'lucide-react';
import Card, { CardHeader, CardContent } from '../common/Card';
import { formatDistanceToNow } from 'date-fns';

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
}

interface SiteMapAnalyticsViewerProps {
  siteLength: number;
  siteWidth: number;
  siteName: string;
  devices: DevicePosition[];
  onDeviceClick?: (deviceId: string) => void;
  className?: string;
}

export default function SiteMapAnalyticsViewer({
  siteLength,
  siteWidth,
  siteName,
  devices,
  onDeviceClick,
  className = '',
}: SiteMapAnalyticsViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePosition | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });
  const navigate = useNavigate();

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const aspectRatio = siteWidth / siteLength;
        const height = Math.min(width * aspectRatio, 400);
        setCanvasSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [siteLength, siteWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    const gridSize = 10;
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

  }, [devices, canvasSize, hoveredDevice, siteLength, siteWidth]);

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

  return (
    <div className={`${className}`} ref={containerRef}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="text-primary-600" size={18} />
              <h3 className="text-lg font-semibold text-gray-900">Site Map</h3>
            </div>
            <div className="text-sm text-gray-600">
              {siteName} • {siteLength}ft × {siteWidth}ft
            </div>
          </div>
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
