import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, X, Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useActiveCompany } from '../../hooks/useActiveCompany';

interface ScopeEntity {
  id: string;
  name: string;
  parentId?: string;
}

interface ScopeSelectorProps {
  programIds: string[];
  siteIds: string[];
  deviceIds: string[];
  onProgramIdsChange: (ids: string[]) => void;
  onSiteIdsChange: (ids: string[]) => void;
  onDeviceIdsChange: (ids: string[]) => void;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  options: ScopeEntity[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      options.filter((o) =>
        o.name.toLowerCase().includes(search.toLowerCase())
      ),
    [options, search]
  );

  const selectedNames = useMemo(
    () =>
      selected
        .map((id) => options.find((o) => o.id === id)?.name)
        .filter(Boolean),
    [selected, options]
  );

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors ${
            disabled
              ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          <span className="truncate">
            {selected.length === 0
              ? placeholder
              : `${selected.length} selected`}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 flex-shrink-0 ml-2" />
          ) : (
            <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2" />
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
                  placeholder="Search..."
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
                      if (selected.length === options.length) {
                        onChange([]);
                      } else {
                        onChange(options.map((o) => o.id));
                      }
                    }}
                    className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left font-medium border-b border-gray-100"
                  >
                    {selected.length === options.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                  {filtered.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(option.id)}
                        onChange={() => toggle(option.id)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 truncate">
                        {option.name}
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
                  const id = options.find((o) => o.name === name)?.id;
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
    </div>
  );
}

export default function ScopeSelector({
  programIds,
  siteIds,
  deviceIds,
  onProgramIdsChange,
  onSiteIdsChange,
  onDeviceIdsChange,
}: ScopeSelectorProps) {
  const { activeCompanyId } = useActiveCompany();
  const [programs, setPrograms] = useState<ScopeEntity[]>([]);
  const [sites, setSites] = useState<ScopeEntity[]>([]);
  const [devices, setDevices] = useState<ScopeEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompanyId) return;

    const fetchPrograms = async () => {
      const { data } = await supabase
        .from('pilot_programs')
        .select('program_id, name')
        .eq('company_id', activeCompanyId)
        .order('name');

      setPrograms(
        (data || []).map((p) => ({ id: p.program_id, name: p.name }))
      );
      setLoading(false);
    };

    fetchPrograms();
  }, [activeCompanyId]);

  useEffect(() => {
    if (programIds.length === 0) {
      setSites([]);
      return;
    }

    const fetchSites = async () => {
      const { data } = await supabase
        .from('sites')
        .select('site_id, name, program_id')
        .in('program_id', programIds)
        .order('name');

      setSites(
        (data || []).map((s) => ({
          id: s.site_id,
          name: s.name,
          parentId: s.program_id,
        }))
      );
    };

    fetchSites();
  }, [programIds]);

  useEffect(() => {
    if (siteIds.length === 0) {
      setDevices([]);
      return;
    }

    const fetchDevices = async () => {
      const { data } = await supabase
        .from('devices')
        .select('device_id, device_code, device_name, site_id')
        .in('site_id', siteIds)
        .order('device_code');

      setDevices(
        (data || []).map((d) => ({
          id: d.device_id,
          name: d.device_code || d.device_name || d.device_id.slice(0, 8),
          parentId: d.site_id,
        }))
      );
    };

    fetchDevices();
  }, [siteIds]);

  useEffect(() => {
    const validSiteIds = sites.map((s) => s.id);
    const filtered = siteIds.filter((id) => validSiteIds.includes(id));
    if (filtered.length !== siteIds.length) {
      onSiteIdsChange(filtered);
    }
  }, [sites]);

  useEffect(() => {
    const validDeviceIds = devices.map((d) => d.id);
    const filtered = deviceIds.filter((id) => validDeviceIds.includes(id));
    if (filtered.length !== deviceIds.length) {
      onDeviceIdsChange(filtered);
    }
  }, [devices]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MultiSelect
        label="Programs"
        options={programs}
        selected={programIds}
        onChange={onProgramIdsChange}
        placeholder="All programs"
      />
      <MultiSelect
        label="Sites"
        options={sites}
        selected={siteIds}
        onChange={onSiteIdsChange}
        placeholder={programIds.length === 0 ? 'Select programs first' : 'All sites'}
        disabled={programIds.length === 0}
      />
      <MultiSelect
        label="Devices"
        options={devices}
        selected={deviceIds}
        onChange={onDeviceIdsChange}
        placeholder={siteIds.length === 0 ? 'Select sites first' : 'All devices'}
        disabled={siteIds.length === 0}
      />
    </div>
  );
}
