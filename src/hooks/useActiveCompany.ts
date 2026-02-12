import { useCompanyFilterStore } from '../stores/companyFilterStore';
import useCompanies from './useCompanies';

interface Company {
  company_id: string;
  name: string;
}

export function useActiveCompany() {
  const { selectedCompanyId, isLoading: storeLoading } = useCompanyFilterStore();
  const { companies, isSuperAdmin, loading: companiesLoading } = useCompanies();

  const activeCompanyId = selectedCompanyId;

  const activeCompany: Company | null = activeCompanyId
    ? companies.find((c) => c.company_id === activeCompanyId) || null
    : null;

  return {
    companies,
    activeCompanyId,
    activeCompany,
    loading: storeLoading || companiesLoading,
    isSuperAdmin,
  };
}
