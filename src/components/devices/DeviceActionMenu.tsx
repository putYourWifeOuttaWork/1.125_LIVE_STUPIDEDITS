import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit, MapPin, Settings, X } from 'lucide-react';
import { Device } from '../../lib/types';

interface DeviceActionMenuProps {
  device: Device;
  onEdit: () => void;
  onUnmap: () => void;
  onSettings: () => void;
}

export default function DeviceActionMenu({
  device,
  onEdit,
  onUnmap,
  onSettings,
}: DeviceActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        aria-label="Device actions"
      >
        <MoreVertical size={18} className="text-gray-600" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <button
            onClick={() => handleAction(onEdit)}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <Edit size={16} />
            <span>Edit Device</span>
          </button>

          <button
            onClick={() => handleAction(onUnmap)}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <X size={16} />
            <span>Remove from Site</span>
          </button>

          <button
            onClick={() => handleAction(onSettings)}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <Settings size={16} />
            <span>Device Settings</span>
          </button>
        </div>
      )}
    </div>
  );
}
