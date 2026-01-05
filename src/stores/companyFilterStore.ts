import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabaseClient';

interface CompanyFilterState {
  selectedCompanyId: string | null;
  isLoading: boolean;
  error: string | null;
  setSelectedCompanyId: (companyId: string | null) => void;
  setActiveCompanyContext: (companyId: string) => Promise<boolean>;
  loadActiveCompanyContext: () => Promise<void>;
  clearFilter: () => void;
}

export const useCompanyFilterStore = create<CompanyFilterState>()(
  persist(
    (set, get) => ({
      selectedCompanyId: null,
      isLoading: false,
      error: null,

      // Set the selected company ID locally (for UI state)
      setSelectedCompanyId: (companyId) => {
        console.log('Setting selectedCompanyId:', companyId);
        set({ selectedCompanyId: companyId });
      },

      // Set the active company context in the database (for super admins)
      setActiveCompanyContext: async (companyId: string): Promise<boolean> => {
        set({ isLoading: true, error: null });

        try {
          const { data, error } = await supabase.rpc('set_active_company_context', {
            p_company_id: companyId
          });

          if (error) {
            console.error('Error setting active company context:', error);
            set({ error: error.message, isLoading: false });
            return false;
          }

          if (!data.success) {
            console.error('Failed to set company context:', data.message);
            set({ error: data.message, isLoading: false });
            return false;
          }

          // Update local state to match database
          set({
            selectedCompanyId: companyId,
            isLoading: false,
            error: null
          });

          return true;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('Error in setActiveCompanyContext:', err);
          set({ error: errorMessage, isLoading: false });
          return false;
        }
      },

      // Load the active company context from the database
      loadActiveCompanyContext: async () => {
        set({ isLoading: true, error: null });

        try {
          const { data, error } = await supabase.rpc('get_active_company_context');

          if (error) {
            console.error('Error loading active company context:', error);
            set({ error: error.message, isLoading: false });
            return;
          }

          if (!data.success) {
            console.error('Failed to load company context:', data.message);
            set({ error: data.message, isLoading: false });
            return;
          }

          // Update local state with the active company from database
          set({
            selectedCompanyId: data.active_company_id,
            isLoading: false,
            error: null
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('Error in loadActiveCompanyContext:', err);
          set({ error: errorMessage, isLoading: false });
        }
      },

      // Clear the company filter (for local state only, doesn't change DB)
      clearFilter: () => set({ selectedCompanyId: null }),
    }),
    {
      name: 'company-filter-storage',
    }
  )
);
