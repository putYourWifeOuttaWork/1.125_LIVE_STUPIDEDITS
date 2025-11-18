import { useRef, useEffect, useState } from 'react';
import { Camera, Grid, Move, X, Check, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import Button from '../common/Button';
import Card, { CardHeader, CardContent } from '../common/Card';
import { AvailableDevice } from './DevicePoolSelector';

interface DevicePosition {
  device_id: string;
  device_code: string;
  device_name: string;
  x: number;
  y: number;
  battery_level: number | null;
  status: string;
}

interface SiteMapEditorProps {
  siteLength: number;
  siteWidth: number;
  devices: DevicePosition[];
  onDevicePositionUpdate: (deviceId: string, x: number, y: number) => void;
  onDeviceRemove?: (deviceId: string) => void;
  selectedDevice: AvailableDevice | null;
  onMapClick?: (x: number, y: number) => void;
  className?: string;
}

export default function SiteMapEditor({
  siteLength,
  siteWidth,
  devices,
  onDevicePositionUpdate,
  onDeviceRemove,
  selectedDevice,
  onMapClick,
  className = '',
}: SiteMapEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);

  const gridSize = 10;
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        const aspectRatio = siteWidth / siteLength;
        const height = Math.min(width * aspectRatio, 600);
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
    
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
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
    
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`0,0`, 10, 20);
    ctx.fillText(`${siteLength},0`, canvas.width - 50, 20);
    ctx.fillText(`0,${siteWidth}`, 10, canvas.height - 10);
    ctx.fillText(`${siteLength},${siteWidth}`, canvas.width - 80, canvas.height - 10);
    
    devices.forEach(device => {
      const pixelX = (device.x / siteLength) * canvas.width;
      const pixelY = (device.y / siteWidth) * canvas.height;
      
      const isHovered = hoveredDevice === device.device_id;
      const isDragging = draggingDevice === device.device_id;
      const radius = (isHovered || isDragging) ? 20 : 16;
      
      ctx.shadowBlur = isHovered || isDragging ? 10 : 5;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      
      ctx.fillStyle = isDragging ? '#3b82f6' :
                      device.status === 'active' ? '#10b981' :
                      device.status === 'offline' ? '#ef4444' : '#6b7280';
      
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', pixelX, pixelY);
      
      ctx.fillStyle = '#1f2937';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(device.device_code, pixelX, pixelY + radius + 12);
      
      if (device.battery_level !== null) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`${device.battery_level}%`, pixelX, pixelY + radius + 24);
      }
    });
    
  }, [devices, canvasSize, showGrid, hoveredDevice, draggingDevice, siteLength, siteWidth, scale]);

  const pixelToSiteCoords = (pixelX: number, pixelY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    let x = Math.round((pixelX / canvas.width) * siteLength);
    let y = Math.round((pixelY / canvas.height) * siteWidth);
    
    if (snapToGrid) {
      x = Math.round(x / gridSize) * gridSize;
      y = Math.round(y / gridSize) * gridSize;
    }
    
    x = Math.max(0, Math.min(siteLength, x));
    y = Math.max(0, Math.min(siteWidth, y));
    
    return { x, y };
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

  const findDeviceAtPosition = (pixelX: number, pixelY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    for (const device of devices) {
      const devicePixelX = (device.x / siteLength) * canvas.width;
      const devicePixelY = (device.y / siteWidth) * canvas.height;
      const distance = Math.sqrt(
        Math.pow(pixelX - devicePixelX, 2) + Math.pow(pixelY - devicePixelY, 2)
      );
      if (distance < 20) {
        return device.device_id;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const deviceId = findDeviceAtPosition(x, y);
    
    if (deviceId) {
      setDraggingDevice(deviceId);
    } else if (selectedDevice && onMapClick) {
      const siteCoords = pixelToSiteCoords(x, y);
      onMapClick(siteCoords.x, siteCoords.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    
    if (draggingDevice) {
      const siteCoords = pixelToSiteCoords(x, y);
      onDevicePositionUpdate(draggingDevice, siteCoords.x, siteCoords.y);
    } else {
      const deviceId = findDeviceAtPosition(x, y);
      setHoveredDevice(deviceId);
    }
  };

  const handleMouseUp = () => {
    setDraggingDevice(null);
  };

  return (
    <div className={`flex flex-col h-full ${className}`} ref={containerRef}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Site Map</h3>
          <div className="flex items-center gap-2">
            <Button
              variant={showGrid ? 'primary' : 'outline'}
              size="sm"
              icon={<Grid size={16} />}
              onClick={() => setShowGrid(!showGrid)}
            >
              Grid
            </Button>
            <Button
              variant={snapToGrid ? 'primary' : 'outline'}
              size="sm"
              icon={<Move size={16} />}
              onClick={() => setSnapToGrid(!snapToGrid)}
            >
              Snap
            </Button>
          </div>
        </div>
        
        <div className="text-sm text-gray-600 mb-2">
          <p>Dimensions: {siteLength}ft × {siteWidth}ft</p>
          {selectedDevice && (
            <p className="text-primary-600 mt-1">
              Click on map to place {selectedDevice.device_code}
            </p>
          )}
        </div>
      </div>

      <Card className="flex-1">
        <CardContent className="p-4 h-full">
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="w-full h-full cursor-crosshair border border-gray-200 rounded"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </CardContent>
      </Card>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
        <p className="font-medium text-gray-700 mb-2">Legend</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">Active Device</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">Offline Device</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-600">Dragging</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500" />
            <span className="text-gray-600">Unknown Status</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Drag devices to reposition. Grid size: {gridSize}ft
        </p>
      </div>
    </div>
  );
}
