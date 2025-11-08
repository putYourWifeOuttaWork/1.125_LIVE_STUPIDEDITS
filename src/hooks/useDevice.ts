import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { Device } from '../lib/types';
import { toast } from 'react-toastify';
import { createLogger } from '../utils/logger';

const logger = createLogger('useDevice');

export const useDevice = (deviceId: string | undefined, refetchInterval: number = 10000) => {
  const queryClient = useQueryClient();

  const {
    data: device,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: async () => {
      if (!deviceId) return null;

      logger.debug('Fetching device', { deviceId });

      const { data, error } = await supabase
        .from('devices')
        .select(`
          *,
          sites:site_id (
            site_id,
            name,
            type,
            program_id
          ),
          pilot_programs:program_id (
            program_id,
            name,
            company_id
          )
        `)
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching device:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Device not found');
      }

      logger.debug('Device fetched successfully');
      return data as Device;
    },
    enabled: !!deviceId,
    refetchInterval,
    staleTime: 5000,
  });

  const mapDeviceMutation = useMutation({
    mutationFn: async (mapping: {
      siteId: string;
      programId: string;
      deviceName?: string;
      wakeScheduleCron?: string;
      notes?: string;
    }) => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Mapping device', { deviceId, mapping });

      const { data, error } = await supabase
        .from('devices')
        .update({
          site_id: mapping.siteId,
          program_id: mapping.programId,
          device_name: mapping.deviceName,
          wake_schedule_cron: mapping.wakeScheduleCron,
          provisioning_status: 'mapped',
          mapped_at: new Date().toISOString(),
          mapped_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          notes: mapping.notes,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error mapping device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Device mapped successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to map device: ${error.message}`);
    }
  });

  const activateDeviceMutation = useMutation({
    mutationFn: async () => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Activating device', { deviceId });

      const { data, error } = await supabase
        .from('devices')
        .update({
          provisioning_status: 'active',
          is_active: true,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error activating device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Device activated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to activate device: ${error.message}`);
    }
  });

  const deactivateDeviceMutation = useMutation({
    mutationFn: async () => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Deactivating device', { deviceId });

      const { data, error } = await supabase
        .from('devices')
        .update({
          provisioning_status: 'inactive',
          is_active: false,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error deactivating device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Device deactivated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to deactivate device: ${error.message}`);
    }
  });

  return {
    device,
    isLoading,
    error: error?.message,
    refetch,
    mapDevice: mapDeviceMutation.mutateAsync,
    activateDevice: activateDeviceMutation.mutateAsync,
    deactivateDevice: deactivateDeviceMutation.mutateAsync,
    isMapping: mapDeviceMutation.isPending,
    isActivating: activateDeviceMutation.isPending,
    isDeactivating: deactivateDeviceMutation.isPending,
  };
};
