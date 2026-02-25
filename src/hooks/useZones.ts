import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useCompanyFilterStore } from '../stores/companyFilterStore';
import { toast } from 'react-toastify';

export interface Zone {
  zone_id: string;
  company_id: string;
  site_id: string;
  name: string;
  zone_type: string;
  description: string;
  aliases: string[];
  area_sqft: number | null;
  coordinates: unknown;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useZones(siteId?: string) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyFilterStore();

  const zonesQuery = useQuery({
    queryKey: ['zones', siteId, selectedCompanyId],
    queryFn: async () => {
      let query = supabase
        .from('zones')
        .select('*')
        .neq('status', 'archived')
        .order('name');

      if (siteId) {
        query = query.eq('site_id', siteId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Zone[];
    },
    enabled: !!selectedCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const createZoneMutation = useMutation({
    mutationFn: async (zone: {
      site_id: string;
      name: string;
      zone_type: string;
      description?: string;
      aliases?: string[];
      area_sqft?: number;
    }) => {
      const { data: companyId } = await supabase.rpc('get_active_company_id');
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('zones')
        .insert({
          company_id: companyId,
          site_id: zone.site_id,
          name: zone.name,
          zone_type: zone.zone_type,
          description: zone.description || '',
          aliases: zone.aliases || [zone.name.toLowerCase()],
          area_sqft: zone.area_sqft || null,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Zone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      toast.success('Zone created');
    },
    onError: (err) => {
      toast.error(`Failed to create zone: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({
      zoneId,
      updates,
    }: {
      zoneId: string;
      updates: Partial<Omit<Zone, 'zone_id' | 'company_id' | 'created_at' | 'updated_at'>>;
    }) => {
      const { data, error } = await supabase
        .from('zones')
        .update(updates)
        .eq('zone_id', zoneId)
        .select()
        .single();

      if (error) throw error;
      return data as Zone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      toast.success('Zone updated');
    },
    onError: (err) => {
      toast.error(`Failed to update zone: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const archiveZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      const { error } = await supabase
        .from('zones')
        .update({ status: 'archived' })
        .eq('zone_id', zoneId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      toast.success('Zone archived');
    },
    onError: (err) => {
      toast.error(`Failed to archive zone: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  return {
    zones: zonesQuery.data || [],
    loading: zonesQuery.isLoading,
    error: zonesQuery.error,
    createZone: createZoneMutation.mutateAsync,
    updateZone: updateZoneMutation.mutateAsync,
    archiveZone: archiveZoneMutation.mutateAsync,
    isCreating: createZoneMutation.isPending,
    isUpdating: updateZoneMutation.isPending,
  };
}

export function useZone(zoneId?: string) {
  return useQuery({
    queryKey: ['zone', zoneId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .eq('zone_id', zoneId!)
        .maybeSingle();
      if (error) throw error;
      return data as Zone | null;
    },
    enabled: !!zoneId,
    staleTime: 5 * 60 * 1000,
  });
}
