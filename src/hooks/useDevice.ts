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

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      // Step 1: Mark any existing assignments as inactive
      const { error: deactivateError } = await supabase
        .from('device_site_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: userId,
        })
        .eq('device_id', deviceId)
        .eq('is_active', true);

      if (deactivateError) {
        logger.error('Error deactivating old site assignments:', deactivateError);
        throw deactivateError;
      }

      const { error: deactivateProgramError } = await supabase
        .from('device_program_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: userId,
        })
        .eq('device_id', deviceId)
        .eq('is_active', true);

      if (deactivateProgramError) {
        logger.error('Error deactivating old program assignments:', deactivateProgramError);
        throw deactivateProgramError;
      }

      // Step 2: Create new junction table records
      const { error: siteAssignmentError } = await supabase
        .from('device_site_assignments')
        .insert({
          device_id: deviceId,
          site_id: mapping.siteId,
          program_id: mapping.programId,
          is_primary: true,
          is_active: true,
          assigned_by_user_id: userId,
          notes: mapping.notes,
        });

      if (siteAssignmentError) {
        logger.error('Error creating site assignment:', siteAssignmentError);
        throw siteAssignmentError;
      }

      const { error: programAssignmentError } = await supabase
        .from('device_program_assignments')
        .insert({
          device_id: deviceId,
          program_id: mapping.programId,
          is_primary: true,
          is_active: true,
          assigned_by_user_id: userId,
          notes: mapping.notes,
        });

      if (programAssignmentError) {
        logger.error('Error creating program assignment:', programAssignmentError);
        throw programAssignmentError;
      }

      // Step 3: Update device record
      const { data, error } = await supabase
        .from('devices')
        .update({
          site_id: mapping.siteId,
          program_id: mapping.programId,
          device_name: mapping.deviceName,
          wake_schedule_cron: mapping.wakeScheduleCron,
          provisioning_status: 'mapped',
          mapped_at: new Date().toISOString(),
          mapped_by_user_id: userId,
          notes: mapping.notes,
          is_active: true,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating device:', error);
        throw error;
      }

      logger.debug('Device mapped successfully with junction records');
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

  const unassignDeviceMutation = useMutation({
    mutationFn: async (reason?: string) => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Unassigning device', { deviceId, reason });

      const { data, error } = await supabase
        .from('devices')
        .update({
          site_id: null,
          program_id: null,
          provisioning_status: 'pending_mapping',
          is_active: false,
          mapped_at: null,
          mapped_by_user_id: null,
          notes: reason ? `Unassigned: ${reason}\n\n${device?.notes || ''}` : device?.notes,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error unassigning device:', error);
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Device unassigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to unassign device: ${error.message}`);
    }
  });

  const reassignDeviceMutation = useMutation({
    mutationFn: async (mapping: {
      siteId: string;
      programId: string;
      deviceName?: string;
      wakeScheduleCron?: string;
      notes?: string;
      reason?: string;
    }) => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Reassigning device', { deviceId, mapping });

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const notesWithReason = mapping.reason
        ? `Reassigned: ${mapping.reason}\n\n${mapping.notes || device?.notes || ''}`
        : mapping.notes;

      // Step 1: Mark existing assignments as inactive (preserve history)
      const { error: deactivateError } = await supabase
        .from('device_site_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: userId,
          reason: mapping.reason,
        })
        .eq('device_id', deviceId)
        .eq('is_active', true);

      if (deactivateError) {
        logger.error('Error deactivating old site assignments:', deactivateError);
        throw deactivateError;
      }

      const { error: deactivateProgramError } = await supabase
        .from('device_program_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: userId,
          reason: mapping.reason,
        })
        .eq('device_id', deviceId)
        .eq('is_active', true);

      if (deactivateProgramError) {
        logger.error('Error deactivating old program assignments:', deactivateProgramError);
        throw deactivateProgramError;
      }

      // Step 2: Create new assignment records
      const { error: siteAssignmentError } = await supabase
        .from('device_site_assignments')
        .insert({
          device_id: deviceId,
          site_id: mapping.siteId,
          program_id: mapping.programId,
          is_primary: true,
          is_active: true,
          assigned_by_user_id: userId,
          notes: notesWithReason,
          reason: mapping.reason,
        });

      if (siteAssignmentError) {
        logger.error('Error creating site assignment:', siteAssignmentError);
        throw siteAssignmentError;
      }

      const { error: programAssignmentError } = await supabase
        .from('device_program_assignments')
        .insert({
          device_id: deviceId,
          program_id: mapping.programId,
          is_primary: true,
          is_active: true,
          assigned_by_user_id: userId,
          notes: notesWithReason,
          reason: mapping.reason,
        });

      if (programAssignmentError) {
        logger.error('Error creating program assignment:', programAssignmentError);
        throw programAssignmentError;
      }

      // Step 3: Update device record
      const { data, error } = await supabase
        .from('devices')
        .update({
          site_id: mapping.siteId,
          program_id: mapping.programId,
          device_name: mapping.deviceName,
          wake_schedule_cron: mapping.wakeScheduleCron,
          provisioning_status: 'mapped',
          mapped_at: new Date().toISOString(),
          mapped_by_user_id: userId,
          notes: notesWithReason,
          is_active: true,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating device:', error);
        throw error;
      }

      logger.debug('Device reassigned successfully with new junction records');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Device reassigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reassign device: ${error.message}`);
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
    unassignDevice: unassignDeviceMutation.mutateAsync,
    reassignDevice: reassignDeviceMutation.mutateAsync,
    isMapping: mapDeviceMutation.isPending,
    isActivating: activateDeviceMutation.isPending,
    isDeactivating: deactivateDeviceMutation.isPending,
    isUnassigning: unassignDeviceMutation.isPending,
    isReassigning: reassignDeviceMutation.isPending,
  };
};
