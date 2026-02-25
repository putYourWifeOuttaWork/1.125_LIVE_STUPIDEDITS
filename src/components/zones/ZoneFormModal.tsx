import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import type { Zone } from '../../hooks/useZones';

const ZONE_TYPES = [
  { value: 'grow', label: 'Grow' },
  { value: 'storage', label: 'Storage' },
  { value: 'drying', label: 'Drying' },
  { value: 'processing', label: 'Processing' },
  { value: 'cold_storage', label: 'Cold Storage' },
  { value: 'other', label: 'Other' },
];

interface ZoneFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    zone_type: string;
    description: string;
    aliases: string[];
    area_sqft?: number;
  }) => void;
  zone?: Zone | null;
  isLoading?: boolean;
}

export function ZoneFormModal({ isOpen, onClose, onSubmit, zone, isLoading }: ZoneFormModalProps) {
  const [name, setName] = useState('');
  const [zoneType, setZoneType] = useState('grow');
  const [description, setDescription] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [areaSqft, setAreaSqft] = useState('');

  useEffect(() => {
    if (zone) {
      setName(zone.name);
      setZoneType(zone.zone_type);
      setDescription(zone.description || '');
      setAliases(zone.aliases || []);
      setAreaSqft(zone.area_sqft?.toString() || '');
    } else {
      setName('');
      setZoneType('grow');
      setDescription('');
      setAliases([]);
      setAliasInput('');
      setAreaSqft('');
    }
  }, [zone, isOpen]);

  if (!isOpen) return null;

  const addAlias = () => {
    const trimmed = aliasInput.trim().toLowerCase();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
      setAliasInput('');
    }
  };

  const removeAlias = (idx: number) => {
    setAliases(aliases.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAliases = aliases.length > 0
      ? aliases
      : [name.toLowerCase()];

    onSubmit({
      name,
      zone_type: zoneType,
      description,
      aliases: finalAliases,
      area_sqft: areaSqft ? Number(areaSqft) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {zone ? 'Edit Zone' : 'New Zone'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {ZONE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Area (sq ft)</label>
            <input
              type="number"
              value={areaSqft}
              onChange={(e) => setAreaSqft(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice Aliases</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                placeholder="Add alias..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                type="button"
                onClick={addAlias}
                className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {aliases.map((alias, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs"
                >
                  {alias}
                  <button type="button" onClick={() => removeAlias(i)} className="hover:text-error-500">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={!name || isLoading}
              className="flex-1 py-2 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : zone ? 'Update Zone' : 'Create Zone'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
