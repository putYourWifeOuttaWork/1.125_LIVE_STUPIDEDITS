import { useState } from 'react';
import { Plus, Search, MapPin } from 'lucide-react';
import { useZones, Zone } from '../../hooks/useZones';
import { ZoneCard } from './ZoneCard';
import { ZoneFormModal } from './ZoneFormModal';

interface ZoneListPanelProps {
  siteId: string;
}

export function ZoneListPanel({ siteId }: ZoneListPanelProps) {
  const { zones, loading, createZone, updateZone, archiveZone, isCreating, isUpdating } = useZones(siteId);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);

  const filtered = zones.filter(
    (z) =>
      z.name.toLowerCase().includes(search.toLowerCase()) ||
      z.zone_type.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (data: {
    name: string;
    zone_type: string;
    description: string;
    aliases: string[];
    area_sqft?: number;
  }) => {
    if (editingZone) {
      await updateZone({ zoneId: editingZone.zone_id, updates: data });
    } else {
      await createZone({ site_id: siteId, ...data });
    }
    setShowModal(false);
    setEditingZone(null);
  };

  const handleEdit = (zone: Zone) => {
    setEditingZone(zone);
    setShowModal(true);
  };

  const handleArchive = async (zone: Zone) => {
    if (window.confirm(`Archive zone "${zone.name}"?`)) {
      await archiveZone(zone.zone_id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-gray-500" />
          <h3 className="font-semibold text-gray-900">Zones</h3>
          <span className="text-sm text-gray-400">({zones.length})</span>
        </div>
        <button
          onClick={() => { setEditingZone(null); setShowModal(true); }}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus size={14} /> Add Zone
        </button>
      </div>

      {zones.length > 3 && (
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search zones..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <MapPin size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {search ? 'No zones match your search' : 'No zones yet. Create your first zone.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((zone) => (
            <ZoneCard
              key={zone.zone_id}
              zone={zone}
              onEdit={handleEdit}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      <ZoneFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingZone(null); }}
        onSubmit={handleSubmit}
        zone={editingZone}
        isLoading={isCreating || isUpdating}
      />
    </div>
  );
}
