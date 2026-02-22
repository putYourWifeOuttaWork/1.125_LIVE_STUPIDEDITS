import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { Device } from '../lib/types';
import { toast } from 'react-toastify';
import { createLogger } from '../utils/logger';
import { DeviceService } from '../services/deviceService';

const logger = createLogger('useDevice');

// Hook for managing device images
export const useDeviceImages = (deviceId: string) => {
  const queryClient = useQueryClient();

  const {
    data: images = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['device-images', deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_images')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Add can_retry field to each image
      const imagesWithRetry = (data || []).map(img => ({
        ...img,
        can_retry: img.status === 'failed' && img.retry_count < img.max_retries
      }));

      return imagesWithRetry;
    },
    enabled: !!deviceId,
    refetchInterval: 15000,
  });

  const retryImageMutation = useMutation({
    mutationFn: async ({ imageId, imageName }: { imageId: string; imageName: string }) => {
      // Create a device command to retry the image
      const { data, error } = await supabase
        .from('device_commands')
        .insert({
          device_id: deviceId,
          command_type: 'retry_image',
          command_data: {
            image_id: imageId,
            image_name: imageName,
            reason: 'Manual retry requested'
          },
          priority: 'high',
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      // Update the image status to pending_retry
      const { error: updateError } = await supabase
        .from('device_images')
        .update({
          status: 'pending_retry',
          retry_count: supabase.sql`retry_count + 1`
        })
        .eq('image_id', imageId);

      if (updateError) throw updateError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-images', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Image retry queued successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to queue retry: ${error.message}`);
    }
  });

  const retryAllFailedMutation = useMutation({
    mutationFn: async () => {
      // Get all failed images that can be retried
      const { data: failedImages, error: fetchError } = await supabase
        .from('device_images')
        .select('image_id, image_name')
        .eq('device_id', deviceId)
        .eq('status', 'failed')
        .lt('retry_count', supabase.sql`max_retries`);

      if (fetchError) throw fetchError;
      if (!failedImages || failedImages.length === 0) {
        return { count: 0 };
      }

      // Create retry commands for all failed images
      const commands = failedImages.map(img => ({
        device_id: deviceId,
        command_type: 'retry_image',
        command_data: {
          image_id: img.image_id,
          image_name: img.image_name,
          reason: 'Batch retry requested'
        },
        priority: 'high',
        status: 'pending'
      }));

      const { error: insertError } = await supabase
        .from('device_commands')
        .insert(commands);

      if (insertError) throw insertError;

      // Update all failed images to pending_retry
      const imageIds = failedImages.map(img => img.image_id);
      const { error: updateError } = await supabase
        .from('device_images')
        .update({
          status: 'pending_retry',
          retry_count: supabase.sql`retry_count + 1`
        })
        .in('image_id', imageIds);

      if (updateError) throw updateError;

      return { count: failedImages.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['device-images', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      if (data.count > 0) {
        toast.success(`Queued retry for ${data.count} failed image${data.count > 1 ? 's' : ''}`);
      } else {
        toast.info('No failed images to retry');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to queue retries: ${error.message}`);
    }
  });

  const clearStaleImagesMutation = useMutation({
    mutationFn: async (ageHours: number = 1) => {
      const { data, error } = await supabase
        .rpc('manually_clear_stale_images', {
          p_device_id: deviceId,
          p_age_hours: ageHours
        })
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['device-images', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      const count = data?.count || 0;
      if (count > 0) {
        toast.success(`Cleared ${count} stale image${count > 1 ? 's' : ''}`);
      } else {
        toast.info('No stale images to clear');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to clear stale images: ${error.message}`);
    }
  });

  return {
    images,
    isLoading,
    error,
    refetch,
    retryImage: (imageId: string, imageName: string) => retryImageMutation.mutateAsync({ imageId, imageName }),
    retryFailedImages: () => retryAllFailedMutation.mutateAsync(),
    clearStaleImages: (ageHours?: number) => clearStaleImagesMutation.mutateAsync(ageHours),
    isRetrying: retryImageMutation.isPending || retryAllFailedMutation.isPending,
    isClearingStale: clearStaleImagesMutation.isPending
  };
};

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

      // First get the device
      const { data: deviceData, error: deviceError } = await supabase
        .from('devices')
        .select('*')
        .eq('device_id', deviceId)
        .or('device_type.is.null,device_type.neq.virtual') // Show physical devices (null or not virtual)
        .maybeSingle();

      if (deviceError) {
        logger.error('Error fetching device:', deviceError);
        throw deviceError;
      }

      if (!deviceData) {
        throw new Error('Device not found');
      }

      // Get active site assignment from junction table (source of truth)
      const { data: siteAssignment } = await supabase
        .from('device_site_assignments')
        .select(`
          site_id,
          program_id,
          sites:site_id (
            site_id,
            name,
            type,
            program_id
          )
        `)
        .eq('device_id', deviceId)
        .eq('is_active', true)
        .maybeSingle();

      // Get active program assignment from junction table (source of truth)
      const { data: programAssignment } = await supabase
        .from('device_program_assignments')
        .select(`
          program_id,
          pilot_programs:program_id (
            program_id,
            name,
            company_id
          )
        `)
        .eq('device_id', deviceId)
        .eq('is_active', true)
        .maybeSingle();

      // Combine device data with junction table assignments
      const data = {
        ...deviceData,
        sites: siteAssignment?.sites || null,
        pilot_programs: programAssignment?.pilot_programs || null
      };

      logger.debug('Device fetched successfully with junction table data');
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

      // Step 3: Get company_id from the site
      const { data: siteData, error: siteError } = await supabase
        .from('sites')
        .select('company_id')
        .eq('site_id', mapping.siteId)
        .single();

      if (siteError) {
        logger.error('Error fetching site company:', siteError);
        throw siteError;
      }

      // Step 4: Calculate next_wake_at from cron schedule
      let nextWakeAt = null;
      if (mapping.wakeScheduleCron) {
        try {
          // Parse cron and calculate next wake time
          // For now, use a simple parser for "0 8,16 * * *" format
          const cronParts = mapping.wakeScheduleCron.split(' ');
          if (cronParts.length >= 5) {
            const hours = cronParts[1].split(',').map(h => parseInt(h));
            const now = new Date();
            const currentHour = now.getHours();

            // Find next wake hour
            let nextHour = hours.find(h => h > currentHour);
            if (!nextHour) {
              // Use first hour of next day
              nextHour = hours[0];
              now.setDate(now.getDate() + 1);
            }

            now.setHours(nextHour, 0, 0, 0);
            nextWakeAt = now.toISOString();
          }
        } catch (err) {
          logger.warn('Could not parse cron schedule:', err);
        }
      }

      // Step 5: Update device record with all required fields
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('devices')
        .update({
          site_id: mapping.siteId,
          program_id: mapping.programId,
          company_id: siteData.company_id,
          device_name: mapping.deviceName,
          wake_schedule_cron: mapping.wakeScheduleCron,
          next_wake_at: nextWakeAt,
          provisioning_status: 'mapped',
          mapped_at: now,
          mapped_by_user_id: userId,
          provisioned_at: now,
          provisioned_by_user_id: userId,
          notes: mapping.notes,
          is_active: true,
          last_seen_at: now,
        })
        .eq('device_id', deviceId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating device:', error);
        throw error;
      }

      // Step 6: Queue set_wake_schedule command if wake schedule changed
      if (mapping.wakeScheduleCron && device?.wake_schedule_cron !== mapping.wakeScheduleCron) {
        logger.debug('Wake schedule changed, queuing command', {
          oldSchedule: device?.wake_schedule_cron,
          newSchedule: mapping.wakeScheduleCron
        });

        const { error: commandError } = await supabase
          .from('device_commands')
          .insert({
            device_id: deviceId,
            command_type: 'set_wake_schedule',
            command_payload: {
              cron: mapping.wakeScheduleCron,
              timestamp: new Date().toISOString()
            },
            created_by_user_id: userId,
            notes: 'Wake schedule updated during device setup'
          });

        if (commandError) {
          logger.warn('Failed to queue wake schedule command', commandError);
          // Don't fail the mapping if command queue fails
        } else {
          logger.debug('Wake schedule command queued successfully');
        }
      }

      logger.debug('Device mapped successfully with junction records');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });

      // Show different message if wake schedule was changed
      if (device?.wake_schedule_cron) {
        toast.success('Device mapped successfully. Schedule changes will be sent at next wake.');
      } else {
        toast.success('Device mapped successfully');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to map device: ${error.message}`);
    }
  });

  const activateDeviceMutation = useMutation({
    mutationFn: async () => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Activating device', { deviceId });

      // Calculate next wake if schedule exists
      const updateData: any = {
        provisioning_status: 'active',
        is_active: true,
      };

      // If device has a wake schedule but no next_wake_at, calculate it
      const { data: currentDevice } = await supabase
        .from('devices')
        .select('wake_schedule_cron, next_wake_at, site_id, sites(timezone)')
        .eq('device_id', deviceId)
        .single();

      if (currentDevice?.wake_schedule_cron && !currentDevice.next_wake_at) {
        // Calculate next wake using RPC function
        const timezone = (currentDevice as any).sites?.timezone || 'America/New_York';
        const { data: nextWake } = await supabase.rpc(
          'fn_calculate_next_wake_time',
          {
            p_last_wake_at: new Date().toISOString(),
            p_cron_expression: currentDevice.wake_schedule_cron,
            p_timezone: timezone
          }
        );

        if (nextWake) {
          updateData.next_wake_at = nextWake;
        }
      }

      const { data, error } = await supabase
        .from('devices')
        .update(updateData)
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

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      await supabase
        .from('device_site_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: userId,
          reason: reason || null,
        })
        .eq('device_id', deviceId)
        .eq('is_active', true);

      await supabase
        .from('device_program_assignments')
        .update({
          is_active: false,
          unassigned_at: new Date().toISOString(),
          unassigned_by_user_id: userId,
          reason: reason || null,
        })
        .eq('device_id', deviceId)
        .eq('is_active', true);

      const { data, error } = await supabase
        .from('devices')
        .update({
          site_id: null,
          program_id: null,
          provisioning_status: 'pending_mapping',
          is_active: false,
          mapped_at: null,
          mapped_by_user_id: null,
          notes: device?.notes || null,
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
          notes: mapping.notes,
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
          notes: mapping.notes,
          reason: mapping.reason,
        });

      if (programAssignmentError) {
        logger.error('Error creating program assignment:', programAssignmentError);
        throw programAssignmentError;
      }

      // Step 3: Recalculate next_wake_at if schedule is changing (server-side bookkeeping only)
      let nextWakeAt: string | null | undefined = undefined;
      const isScheduleChange = mapping.wakeScheduleCron !== undefined &&
                               mapping.wakeScheduleCron !== device?.wake_schedule_cron;

      if (isScheduleChange && mapping.wakeScheduleCron) {
        try {
          const { data: siteData } = await supabase
            .from('sites')
            .select('timezone')
            .eq('site_id', mapping.siteId)
            .maybeSingle();

          const timezone = siteData?.timezone || 'America/New_York';
          const { data: nextWake } = await supabase.rpc(
            'fn_calculate_next_wake_time',
            {
              p_last_wake_at: new Date().toISOString(),
              p_cron_expression: mapping.wakeScheduleCron,
              p_timezone: timezone
            }
          );

          if (nextWake) {
            nextWakeAt = nextWake;
          }
        } catch (err) {
          logger.warn('Could not calculate next wake time:', err);
        }
      }

      // Step 4: Update device record (site_id/program_id set by sync triggers from Step 2)
      const deviceUpdate: Record<string, any> = {
        device_name: mapping.deviceName,
        provisioning_status: 'mapped',
        mapped_at: new Date().toISOString(),
        mapped_by_user_id: userId,
        notes: mapping.notes,
        is_active: true,
      };

      if (mapping.wakeScheduleCron !== undefined) {
        deviceUpdate.wake_schedule_cron = mapping.wakeScheduleCron;
      }

      if (nextWakeAt !== undefined) {
        deviceUpdate.next_wake_at = nextWakeAt;
      }

      const { data, error } = await supabase
        .from('devices')
        .update(deviceUpdate)
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

  const updateDeviceMutation = useMutation({
    mutationFn: async (updates: {
      device_name?: string;
      wake_schedule_cron?: string;
      notes?: string;
      zone_label?: string;
      x_position?: number;  // REQUIRED coordinate
      y_position?: number;  // REQUIRED coordinate
      placement_json?: any;
    }) => {
      if (!deviceId) throw new Error('Device ID is required');

      logger.debug('Updating device', { deviceId, updates });

      // Check if wake_schedule_cron is being changed
      const isScheduleChange = updates.wake_schedule_cron !== undefined &&
                               updates.wake_schedule_cron !== device?.wake_schedule_cron;

      // If schedule is changing, use DeviceService to queue command
      if (isScheduleChange) {
        const result = await DeviceService.updateDeviceSettings({
          deviceId,
          deviceName: updates.device_name,
          wakeScheduleCron: updates.wake_schedule_cron,
          notes: updates.notes,
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to update device settings');
        }
      } else {
        // No schedule change, just update directly
        const { error } = await supabase
          .from('devices')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('device_id', deviceId);

        if (error) {
          logger.error('Error updating device:', error);
          throw error;
        }
      }

      // Fetch updated device
      const { data, error: fetchError } = await supabase
        .from('devices')
        .select('*')
        .eq('device_id', deviceId)
        .single();

      if (fetchError) {
        logger.error('Error fetching updated device:', fetchError);
        throw fetchError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      toast.success('Device updated successfully. Schedule change will apply at next wake.');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update device: ${error.message}`);
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
    updateDevice: updateDeviceMutation.mutateAsync,
    isMapping: mapDeviceMutation.isPending,
    isActivating: activateDeviceMutation.isPending,
    isDeactivating: deactivateDeviceMutation.isPending,
    isUnassigning: unassignDeviceMutation.isPending,
    isReassigning: reassignDeviceMutation.isPending,
    isUpdating: updateDeviceMutation.isPending,
  };
};
