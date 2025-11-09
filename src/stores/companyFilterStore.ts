import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompanyFilterState {
  selectedCompanyId: string | 'all' | null;
  setSelectedCompanyId: (companyId: string | 'all' | null) => void;
  clearFilter: () => void;
}

export const useCompanyFilterStore = create<CompanyFilterState>()(
  persist(
    (set) => ({
      selectedCompanyId: null,
      setSelectedCompanyId: (companyId) => set({ selectedCompanyId: companyId }),
      clearFilter: () => set({ selectedCompanyId: null }),
    }),
    {
      name: 'company-filter-storage',
    }
  )
);
