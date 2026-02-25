import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Pencil, Archive, MapPin } from 'lucide-react';
import type { Zone } from '../../hooks/useZones';

const ZONE_TYPE_COLORS: Record<string, string> = {
  grow: 'bg-primary-100 text-primary-700',
  storage: 'bg-secondary-100 text-secondary-700',
  drying: 'bg-warning-100 text-warning-700',
  processing: 'bg-accent-100 text-accent-700',
  cold_storage: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-600',
};

interface ZoneCardProps {
  zone: Zone;
  onEdit: (zone: Zone) => void;
  onArchive: (zone: Zone) => void;
}

export function ZoneCard({ zone, onEdit, onArchive }: ZoneCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeColor = ZONE_TYPE_COLORS[zone.zone_type] || ZONE_TYPE_COLORS.other;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900">{zone.name}</h3>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <MoreVertical size={16} className="text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px] z-10">
              <button
                onClick={() => { onEdit(zone); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={() => { onArchive(zone); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-error-600"
              >
                <Archive size={14} /> Archive
              </button>
            </div>
          )}
        </div>
      </div>

      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeColor} mb-2`}>
        {zone.zone_type.replace(/_/g, ' ')}
      </span>

      {zone.description && (
        <p className="text-sm text-gray-500 mb-2 line-clamp-2">{zone.description}</p>
      )}

      {zone.aliases && zone.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {zone.aliases.slice(0, 3).map((alias, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {alias}
            </span>
          ))}
          {zone.aliases.length > 3 && (
            <span className="text-xs text-gray-400">+{zone.aliases.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}
