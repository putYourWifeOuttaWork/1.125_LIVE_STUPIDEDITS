import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';

interface Site {
  site_id: string;
  site_name: string;
  timezone: string;
}

interface SiteSelectorProps {
  value: string;
  onChange: (siteId: string, timezone: string) => void;
}

export function SiteSelector({ value, onChange }: SiteSelectorProps) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const { data, error } = await supabase
          .from('sites')
          .select('site_id, name')
          .order('name');

        if (error) throw error;
        // Map to expected interface format
        const mappedSites = (data || []).map(site => ({
          site_id: site.site_id,
          site_name: site.name,
          timezone: 'UTC' // Default timezone since sites table doesn't have this column yet
        }));
        setSites(mappedSites);
      } catch (error: any) {
        console.error('Error fetching sites:', error);
        toast.error(`Failed to load sites: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const siteId = e.target.value;
    const site = sites.find((s) => s.site_id === siteId);
    if (site) {
      onChange(site.site_id, site.timezone || 'UTC');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="site-selector" className="text-sm font-medium text-gray-700">
        Site:
      </label>
      <select
        id="site-selector"
        value={value}
        onChange={handleChange}
        disabled={loading}
        className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">Select Site</option>
        {sites.map((site) => (
          <option key={site.site_id} value={site.site_id}>
            {site.site_name}
          </option>
        ))}
      </select>
    </div>
  );
}
