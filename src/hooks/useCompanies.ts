import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withRetry } from '../utils/helpers';

export interface Company {
  company_id: string;
  name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  default_weather: 'Clear' | 'Cloudy' | 'Rain';
}

export interface CompanyUser {
  id: string;
  email: string;
  full_name: string | null;
  is_company_admin: boolean;
  is_active: boolean;
}

export function useCompanies() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Query for user's company data
  const userCompanyQuery = useQuery({
    queryKey: ['userCompany', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('get_user_company')
      );
      
      if (error) throw error;
      
      if (data && data.has_company) {
        return {
          userCompany: data.company,
          isAdmin: data.is_admin
        };
      }
      
      return { userCompany: null, isAdmin: false };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    retry: 2,
  });

  // Query for super admin status
  const superAdminQuery = useQuery({
    queryKey: ['isSuperAdmin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('is_super_admin')
      );
      
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Consider data fresh for 10 minutes
    retry: 2,
  });

  // Query for can create company permission
  const canCreateCompanyQuery = useQuery({
    queryKey: ['canCreateCompany', user?.id],
    queryFn: async () => {
      if (!user) return false;
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('can_create_company')
      );
      
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Consider data fresh for 10 minutes
    retry: 2,
  });

  // Query for all companies (super admin only)
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      if (!superAdminQuery.data) return [];
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('companies')
          .select('*')
          .order('name')
      );
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!superAdminQuery.data,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Fetch company users - Memoized with useCallback
  const fetchCompanyUsers = useCallback(async (companyId: string): Promise<CompanyUser[]> => {
    try {
      // Check cache first
      const cachedUsers = queryClient.getQueryData<CompanyUser[]>(['companyUsers', companyId]);
      if (cachedUsers) return cachedUsers;
      
      // If not in cache, fetch from API
      const { data, error } = await withRetry(() => 
        supabase
          .from('users')
          .select('id, email, full_name, is_company_admin, is_active')
          .eq('company_id', companyId)
          .order('is_active', { ascending: false })
          .order('full_name')
      );
      
      if (error) throw error;
      
      // Cache the result
      queryClient.setQueryData(['companyUsers', companyId], data);
      
      return data || [];
    } catch (error) {
      console.error('Error fetching company users:', error);
      toast.error('Failed to fetch company users');
      return [];
    }
  }, [queryClient]);

  // Create company mutation
  const createCompanyMutation = useMutation({
    mutationFn: async (companyData: Omit<Company, 'company_id' | 'created_at' | 'updated_at' | 'default_weather'>) => {
      // Check if user can create a company
      const { data: canCreateData, error: canCreateError } = await withRetry(() => 
        supabase.rpc('can_create_company')
      );
      
      if (canCreateError) throw canCreateError;
      
      if (!canCreateData) {
        throw new Error('You do not have permission to create a new company');
      }
      
      // Create the company
      const { data, error } = await withRetry(() => 
        supabase
          .from('companies')
          .insert(companyData)
          .select()
          .single()
      );
      
      if (error) throw error;
      
      // If this is the user's first company, set it as their company and make them an admin
      if (!userCompanyQuery.data?.userCompany) {
        const { error: userError } = await withRetry(() => 
          supabase
            .from('users')
            .update({
              company_id: data.company_id,
              is_company_admin: true
            })
            .eq('id', user!.id)
        );
        
        if (userError) throw userError;
      }
      
      return data;
    },
    onSuccess: (data) => {
      toast.success('Company created successfully');
      
      // Invalidate relevant queries to trigger refetches
      queryClient.invalidateQueries(['userCompany', user?.id]);
      queryClient.invalidateQueries(['companies']);
      
      // Optimistically update the cache
      if (!userCompanyQuery.data?.userCompany) {
        queryClient.setQueryData(['userCompany', user?.id], {
          userCompany: data,
          isAdmin: true
        });
      }
    },
    onError: (error) => {
      console.error('Error creating company:', error);
      toast.error(`Failed to create company: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update company mutation
  const updateCompanyMutation = useMutation({
    mutationFn: async ({ companyId, companyData }: { companyId: string, companyData: Partial<Company> }) => {
      const { data, error } = await withRetry(() => 
        supabase
          .from('companies')
          .update(companyData)
          .eq('company_id', companyId)
          .select()
          .single()
      );
      
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedCompany) => {
      toast.success('Company updated successfully');
      
      // If this is the user's company, update the cache
      if (userCompanyQuery.data?.userCompany?.company_id === updatedCompany.company_id) {
        queryClient.setQueryData(['userCompany', user?.id], {
          ...userCompanyQuery.data,
          userCompany: updatedCompany
        });
      }
      
      // Update the companies list if it's in the cache
      queryClient.setQueryData<Company[]>(['companies'], (oldData) => {
        if (!oldData) return [updatedCompany];
        return oldData.map(company => 
          company.company_id === updatedCompany.company_id ? updatedCompany : company
        );
      });
    },
    onError: (error) => {
      console.error('Error updating company:', error);
      toast.error(`Failed to update company: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update company default weather mutation
  const updateCompanyDefaultWeatherMutation = useMutation({
    mutationFn: async ({ companyId, weather }: { companyId: string, weather: 'Clear' | 'Cloudy' | 'Rain' }) => {
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_company_default_weather', {
          company_id_param: companyId,
          weather_param: weather
        })
      );
      
      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to update company default weather');
      }
      
      return { companyId, weather };
    },
    onSuccess: ({ companyId, weather }) => {
      // If this is the user's company, update the cache
      if (userCompanyQuery.data?.userCompany?.company_id === companyId) {
        const updatedCompany = {
          ...userCompanyQuery.data.userCompany,
          default_weather: weather
        };
        
        queryClient.setQueryData(['userCompany', user?.id], {
          ...userCompanyQuery.data,
          userCompany: updatedCompany
        });
      }
      
      // Update the companies list if it's in the cache
      queryClient.setQueryData<Company[]>(['companies'], (oldData) => {
        if (!oldData) return [];
        return oldData.map(company => 
          company.company_id === companyId 
            ? { ...company, default_weather: weather } 
            : company
        );
      });
    },
    onError: (error) => {
      console.error('Error updating company default weather:', error);
      toast.error(`Failed to update company default weather: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Add user to company mutation
  const addUserToCompanyMutation = useMutation({
    mutationFn: async ({ email, companyId }: { email: string, companyId: string }) => {
      const { data, error } = await withRetry(() => 
        supabase.rpc('add_user_to_company', {
          p_user_email: email,
          p_company_id: companyId
        })
      );
      
      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to add user to company');
      }
      
      return { email, companyId };
    },
    onSuccess: ({ companyId }) => {
      toast.success('User added to company successfully');
      
      // Invalidate company users query
      queryClient.invalidateQueries(['companyUsers', companyId]);
    },
    onError: (error) => {
      console.error('Error adding user to company:', error);
      toast.error(`Failed to add user to company: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update user admin status mutation
  const updateUserAdminStatusMutation = useMutation({
    mutationFn: async ({ userId, isAdmin, companyId }: { userId: string, isAdmin: boolean, companyId: string }) => {
      if (!userCompanyQuery.data?.userCompany) {
        throw new Error('No company associated with user');
      }
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('update_user_company_admin_status', {
          p_user_id: userId,
          p_is_admin: isAdmin,
          p_company_id: companyId
        })
      );
      
      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to update user admin status');
      }
      
      return { userId, isAdmin, companyId };
    },
    onSuccess: ({ companyId }) => {
      toast.success('User admin status updated');
      
      // Invalidate company users query
      queryClient.invalidateQueries(['companyUsers', companyId]);
    },
    onError: (error) => {
      console.error('Error updating user admin status:', error);
      toast.error(`Failed to update user admin status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Wrapper function for createCompany
  const createCompany = async (companyData: Omit<Company, 'company_id' | 'created_at' | 'updated_at' | 'default_weather'>) => {
    try {
      return await createCompanyMutation.mutateAsync(companyData);
    } catch (error) {
      return null;
    }
  };

  // Wrapper function for updateCompany
  const updateCompany = async (companyId: string, companyData: Partial<Company>) => {
    try {
      return await updateCompanyMutation.mutateAsync({ companyId, companyData });
    } catch (error) {
      return null;
    }
  };

  // Wrapper function for updateCompanyDefaultWeather
  const updateCompanyDefaultWeather = async (companyId: string, weather: 'Clear' | 'Cloudy' | 'Rain') => {
    try {
      await updateCompanyDefaultWeatherMutation.mutateAsync({ companyId, weather });
      return true;
    } catch (error) {
      return false;
    }
  };

  // Wrapper function for addUserToCompany
  const addUserToCompany = async (email: string, companyId: string) => {
    try {
      await addUserToCompanyMutation.mutateAsync({ email, companyId });
      return true;
    } catch (error) {
      return false;
    }
  };

  // Wrapper function for updateUserAdminStatus
  const updateUserAdminStatus = async (userId: string, isAdmin: boolean) => {
    if (!userCompanyQuery.data?.userCompany) {
      toast.error('No company associated with user');
      return false;
    }
    
    try {
      await updateUserAdminStatusMutation.mutateAsync({ 
        userId, 
        isAdmin, 
        companyId: userCompanyQuery.data.userCompany.company_id 
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  // Function to fetch all companies
  const fetchAllCompanies = useCallback(async () => {
    // Simply trigger a refresh of the companies query
    await queryClient.refetchQueries({ queryKey: ['companies'] });
  }, [queryClient]);

  return {
    companies: companiesQuery.data || [],
    userCompany: userCompanyQuery.data?.userCompany || null,
    isAdmin: userCompanyQuery.data?.isAdmin || false,
    isSuperAdmin: superAdminQuery.data || false,
    canCreate: canCreateCompanyQuery.data || false,
    loading: userCompanyQuery.isLoading || superAdminQuery.isLoading || canCreateCompanyQuery.isLoading || companiesQuery.isLoading,
    error: userCompanyQuery.error 
      ? `Failed to load company data: ${String(userCompanyQuery.error)}` 
      : null,
    fetchAllCompanies,
    createCompany,
    updateCompany,
    updateCompanyDefaultWeather,
    fetchCompanyUsers,
    addUserToCompany,
    updateUserAdminStatus
  };
}

export default useCompanies;