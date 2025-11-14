import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { Device, DeviceWithStats } from '../lib/types';
import { toast } from 'react-toastify';
import { createLogger } from '../utils/logger';

const logger = createLogger('useDevices');

interface UseDevicesOptions {
  companyId?: string;
  programId?: string;
  siteId?: string;
  provisioningStatus?: string;
  refetchInterval?: number;
}

export const useDevices = (options: UseDevicesOptions = {}) => {
  const {
    companyId,
    programId,
    siteId,
    provisioningStatus,
    refetchInterval = 30000
  } = options;

  const queryClient = useQueryClient();

  const {
    data: devices = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['devices', companyId, programId, siteId, provisioningStatus],
    queryFn: async () => {
      logger.debug('Fetching devices', { companyId, programId, siteId, provisioningStatus });

      let query = supabase
        .from('devices')
        .select(`
          *,
          sites:site_id (
            site_id,
            name,
            type
          ),
          pilot_programs:program_id (
            program_id,
            name
          )
        `)
        .or('device_type.is.null,device_type.neq.virtual') // Show physical devices (null or not virtual)
        .order('created_at', { ascending: false });

      if (programId) {
        query = query.eq('program_id', programId);
      }

      if (siteId) {
        query = query.eq('site_id', siteId);
      }

      if (provisioningStatus) {
        query = query.eq('provisioning_status', provisioningStatus);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching devices:', error);
        throw error;
      }

      // Enrich devices with image counts
      const devicesWithStats: DeviceWithStats[] = await Promise.all(
        (data || []).map(async (device) => {
          const { count: totalImages } = await supabase
            .from('device_images')
            .select('*', { count: 'exact', head: true })
            .eq('device_id', device.device_id);

          const { count: pendingImages } = await supabase
            .from('device_images')
            .select('*', { count: 'exact', head: true })
            .eq('device_id', device.device_id)
            .eq('status', 'receiving');

          return {
            ...device,
            total_images: totalImages || 0,
            pending_images: pendingImages || 0
          } as DeviceWithStats;
        })
      );

      logger.debug('Devices fetched successfully', { count: devicesWithStats.length });
      return devicesWithStats;
    },
    refetchInterval,
    staleTime: 15000,
  });

  const updateDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, updates }: { deviceId: string; updates: Partial<Device> }) => {
      logger.debug('Updating device', { deviceId, updates });

      const { data, error } = await supabase
        .from('devices')
        .update(updates)
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', data.device_id] });
      toast.success('Device updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update device: ${error.message}`);
    }
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      logger.debug('Deleting device', { deviceId });

      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('device_id', deviceId);

      if (error) {
        logger.error('Error deleting device:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete device: ${error.message}`);
    }
  });

  const updateDevice = useCallback(
    (deviceId: string, updates: Partial<Device>) => {
      return updateDeviceMutation.mutateAsync({ deviceId, updates });
    },
    [updateDeviceMutation]
  );

  const deleteDevice = useCallback(
    (deviceId: string) => {
      return deleteDeviceMutation.mutateAsync(deviceId);
    },
    [deleteDeviceMutation]
  );

  return {
    devices,
    isLoading,
    error: error?.message,
    refetch,
    updateDevice,
    deleteDevice,
    isUpdating: updateDeviceMutation.isPending,
    isDeleting: deleteDeviceMutation.isPending,
  };
};

export const usePendingDevices = () => {
  return useDevices({
    provisioningStatus: 'pending_mapping',
    refetchInterval: 20000
  });
};
