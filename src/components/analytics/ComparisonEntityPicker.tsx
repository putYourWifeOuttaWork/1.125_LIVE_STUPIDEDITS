import { useState, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useActiveCompany } from '../../hooks/useActiveCompany';

interface Entity {
  id: string;
  name: string;
}

interface ComparisonEntityPickerProps {
  entityType: 'program' | 'device' | 'site';
  selected: string[];
  onChange: (ids: string[]) => void;
  scopeDeviceIds?: string[];
  scopeSiteIds?: string[];
  scopeProgramIds?: string[];
}

export default function ComparisonEntityPicker({
  entityType,
  selected,
  onChange,
  scopeDeviceIds = [],
  scopeSiteIds = [],
  scopeProgramIds = [],
}: ComparisonEntityPickerProps) {
  const { activeCompanyId } = useActiveCompany();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);

    const fetch = async () => {
      let data: Entity[] = [];

      if (entityType === 'program') {
        const { data: rows } = await supabase
          .from('pilot_programs')
          .select('program_id, name')
          .eq('company_id', activeCompanyId)
          .order('name');
        data = (rows || []).map((r) => ({ id: r.program_id, name: r.name }));
      } else if (entityType === 'site') {
        const { data: rows } = await supabase
          .from('sites')
          .select('site_id, name, program_id, pilot_programs!inner(company_id)')
          .eq('pilot_programs.company_id', activeCompanyId)
          .order('name');
        data = (rows || []).map((r) => ({ id: r.site_id, name: r.name }));
      } else {
        const { data: rows } = await supabase
          .from('devices')
          .select('device_id, device_code, device_name')
          .eq('company_id', activeCompanyId)
          .order('device_code');
        data = (rows || []).map((r) => ({
          id: r.device_id,
          name: r.device_code || r.device_name || r.device_id.slice(0, 8),
        }));
      }

      setEntities(data);
      setLoading(false);
    };

    fetch();
  }, [activeCompanyId, entityType]);

  useEffect(() => {
    if (entities.length === 0) return;

    const scopeIds =
      entityType === 'device'
        ? scopeDeviceIds
        : entityType === 'site'
          ? scopeSiteIds
          : scopeProgramIds;

    if (scopeIds.length > 0 && selected.length === 0) {
      const validIds = scopeIds.filter((id) =>
        entities.some((e) => e.id === id)
      );
      if (validIds.length > 0) {
        onChange(validIds);
      }
    }
  }, [entities, entityType]);

  const filtered = useMemo(
    () =>
      entities.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase())
      ),
    [entities, search]
  );

  const selectedNames = useMemo(
    () =>
      selected
        .map((id) => entities.find((e) => e.id === id)?.name)
        .filter(Boolean) as string[],
    [selected, entities]
  );

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const label =
    entityType === 'device'
      ? 'Devices'
      : entityType === 'site'
        ? 'Sites'
        : 'Programs';

  if (loading) {
    return (
      <div className="mt-2 h-9 bg-gray-100 rounded-lg animate-pulse" />
    );
  }

  if (entities.length === 0) {
    return (
      <p className="mt-2 text-xs text-gray-500">
        No {label.toLowerCase()} found in this company.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <label className="block text-xs font-medium text-gray-500">
        Compare {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 transition-colors"
        >
          <span className="truncate text-gray-700">
            {selected.length === 0
              ? `Select ${label.toLowerCase()}...`
              : `${selected.length} selected`}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 flex-shrink-0 ml-2 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2 text-gray-400" />
          )}
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-44">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No matches found
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.length === entities.length) {
                        onChange([]);
                      } else {
                        onChange(entities.map((e) => e.id));
                      }
                    }}
                    className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left font-medium border-b border-gray-100"
                  >
                    {selected.length === entities.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                  {filtered.map((entity) => (
                    <label
                      key={entity.id}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(entity.id)}
                        onChange={() => toggle(entity.id)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 truncate">
                        {entity.name}
                      </span>
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedNames.slice(0, 3).map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full"
            >
              {name}
              <button
                type="button"
                onClick={() => {
                  const id = entities.find((e) => e.name === name)?.id;
                  if (id) onChange(selected.filter((s) => s !== id));
                }}
                className="hover:text-blue-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedNames.length > 3 && (
            <span className="text-xs text-gray-500 py-0.5">
              +{selectedNames.length - 3} more
            </span>
          )}
        </div>
      )}

      {selected.length > 0 && selected.length < 2 && (
        <p className="text-xs text-amber-600 mt-1">
          Select at least 2 {label.toLowerCase()} for a meaningful comparison.
        </p>
      )}
    </div>
  );
}
