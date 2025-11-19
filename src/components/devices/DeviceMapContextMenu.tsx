import { useEffect, useRef } from 'react';
import { Settings, Edit, MapPin, Shuffle, Unlink, Power, Trash2, Bell } from 'lucide-react';

interface DeviceMapContextMenuProps {
  x: number;
  y: number;
  deviceId: string;
  deviceName: string;
  onEdit: () => void;
  onSettings: () => void;
  onAlertThresholds: () => void;
  onPlacement: () => void;
  onReassign: () => void;
  onUnassign: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function DeviceMapContextMenu({
  x,
  y,
  deviceId,
  deviceName,
  onEdit,
  onSettings,
  onAlertThresholds,
  onPlacement,
  onReassign,
  onUnassign,
  onDeactivate,
  onDelete,
  onClose,
}: DeviceMapContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuItems = [
    { icon: Edit, label: 'Edit Device', onClick: onEdit, color: 'text-gray-700' },
    { icon: MapPin, label: 'Edit Placement', onClick: onPlacement, color: 'text-gray-700' },
    { icon: Settings, label: 'Device Settings', onClick: onSettings, color: 'text-gray-700' },
    { icon: Bell, label: 'Alert Thresholds', onClick: onAlertThresholds, color: 'text-gray-700' },
    { type: 'divider' as const },
    { icon: Shuffle, label: 'Reassign', onClick: onReassign, color: 'text-gray-700' },
    { icon: Unlink, label: 'Unassign', onClick: onUnassign, color: 'text-gray-700' },
    { type: 'divider' as const },
    { icon: Power, label: 'Deactivate', onClick: onDeactivate, color: 'text-warning-600' },
    { icon: Trash2, label: 'Delete', onClick: onDelete, color: 'text-error-600' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-500">Device Actions</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{deviceName}</p>
      </div>

      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return <div key={`divider-${index}`} className="my-1 border-t border-gray-100" />;
        }

        const Icon = item.icon!;
        return (
          <button
            key={item.label}
            onClick={() => {
              item.onClick!();
              onClose();
            }}
            className={`w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors ${item.color}`}
          >
            <Icon size={16} />
            <span className="text-sm">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
