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
      logger.info('Fetching devices with filters', { companyId, programId, siteId, provisioningStatus });

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
        // Show all devices including virtual ones (virtual is just a label for testing)
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

      query = query.is('archived_at', null);

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching devices from database:', error);
        throw error;
      }

      logger.info(`Fetched ${data?.length || 0} devices, enriching with image counts...`);

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

      logger.info('Devices enriched successfully', { count: devicesWithStats.length });
      return devicesWithStats;
    },
    refetchInterval,
    staleTime: 15000,
    enabled: true, // Explicitly enable the query
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

// Hook for fetching unmapped devices (company_id is null), including virtual devices for super admins
export const useUnmappedDevices = () => {
  const queryClient = useQueryClient();

  const {
    data: devices = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['unmappedDevices'],
    queryFn: async () => {
      logger.debug('Fetching unmapped devices');

      const { data, error } = await supabase
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
        .is('company_id', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching unmapped devices:', error);
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

      logger.debug('Unmapped devices fetched successfully', { count: devicesWithStats.length });
      return devicesWithStats;
    },
    refetchInterval: 20000,
    staleTime: 15000,
  });

  return {
    devices,
    isLoading,
    error,
    refetch
  };
};

export const useArchivedPoolDevices = () => {
  const {
    data: devices = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['archivedPoolDevices'],
    queryFn: async () => {
      logger.debug('Fetching archived pool devices');

      const { data, error } = await supabase
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
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });

      if (error) {
        logger.error('Error fetching archived pool devices:', error);
        throw error;
      }

      return (data || []) as DeviceWithStats[];
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  return { devices, isLoading, error, refetch };
};

export const useArchiveDevice = () => {
  const queryClient = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: async ({
      deviceId,
      reason,
      userId,
    }: {
      deviceId: string;
      reason: string;
      userId: string;
    }) => {
      const { data, error } = await supabase
        .from('devices')
        .update({
          archived_at: new Date().toISOString(),
          archived_by_user_id: userId,
          archive_reason: reason,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error archiving device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['unmappedDevices'] });
      queryClient.invalidateQueries({ queryKey: ['archivedPoolDevices'] });
      toast.success('Device archived successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive device: ${error.message}`);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const { data, error } = await supabase
        .from('devices')
        .update({
          archived_at: null,
          archived_by_user_id: null,
          archive_reason: null,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error unarchiving device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['unmappedDevices'] });
      queryClient.invalidateQueries({ queryKey: ['archivedPoolDevices'] });
      toast.success('Device restored to pool');
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore device: ${error.message}`);
    },
  });

  return {
    archiveDevice: archiveMutation.mutateAsync,
    unarchiveDevice: unarchiveMutation.mutateAsync,
    isArchiving: archiveMutation.isPending,
    isUnarchiving: unarchiveMutation.isPending,
  };
};
