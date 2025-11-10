import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'react-toastify';
import { useUserRole } from '../../hooks/useUserRole';

interface Company {
  company_id: string;
  company_name: string;
}

export function CompanySwitcher() {
  const { userRole } = useUserRole();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_id, company_name')
          .order('company_name');

        if (error) throw error;
        setCompanies(data || []);
      } catch (error: any) {
        console.error('Error fetching companies:', error);
        toast.error(`Failed to load companies: ${error.message}`);
      }
    };

    const fetchActiveCompany = async () => {
      try {
        const { data, error } = await supabase.rpc('get_active_company');
        if (error) throw error;
        setActiveCompanyId(data || '');
      } catch (error: any) {
        console.error('Error fetching active company:', error);
      }
    };

    fetchCompanies();
    fetchActiveCompany();
  }, []);

  const handleSwitch = async (companyId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('set_active_company', {
        p_company_id: companyId,
      });

      if (error) throw error;

      setActiveCompanyId(companyId);
      toast.success('Company context switched');

      // Reload the page to refresh all data with new company context
      window.location.reload();
    } catch (error: any) {
      console.error('Error switching company:', error);
      toast.error(`Failed to switch company: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (userRole !== 'super_admin') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="company-switcher" className="text-sm font-medium text-gray-700">
        Company:
      </label>
      <select
        id="company-switcher"
        value={activeCompanyId}
        onChange={(e) => handleSwitch(e.target.value)}
        disabled={loading}
        className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">Select Company</option>
        {companies.map((company) => (
          <option key={company.company_id} value={company.company_id}>
            {company.company_name}
          </option>
        ))}
      </select>
    </div>
  );
}
