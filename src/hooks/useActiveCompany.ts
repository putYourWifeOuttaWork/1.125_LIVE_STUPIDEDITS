import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useUserRole } from './useUserRole';

interface Company {
  company_id: string;
  name: string;
}

const STORAGE_KEY = 'activeCompanyId';

export function useActiveCompany() {
  const { userRole, isSuperAdmin } = useUserRole();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load active company from localStorage on mount
  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setActiveCompanyId(stored);
    }
  }, [isSuperAdmin]);

  // Fetch all companies for super admins
  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_id, name')
          .order('name');

        if (error) throw error;
        setCompanies(data || []);
      } catch (error: any) {
        console.error('Error fetching companies:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [isSuperAdmin]);

  // Switch company context
  const switchCompany = (companyId: string | null) => {
    setActiveCompanyId(companyId);
    if (companyId) {
      localStorage.setItem(STORAGE_KEY, companyId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Get active company object
  const activeCompany = activeCompanyId
    ? companies.find(c => c.company_id === activeCompanyId) || null
    : null;

  return {
    companies,
    activeCompanyId,
    activeCompany,
    switchCompany,
    loading,
    isSuperAdmin,
  };
}
