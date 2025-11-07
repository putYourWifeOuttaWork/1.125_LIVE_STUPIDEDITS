import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import {
  fetchPetriObservationsBySubmissionId,
  fetchPetriObservationsBySiteId,
  fetchGasifierObservationsBySubmissionId,
  fetchGasifierObservationsBySiteId,
} from '../lib/api';
import { PetriObservation, GasifierObservation } from '../lib/types';
import { createLogger } from '../utils/logger';
import { toast } from 'react-toastify';

const logger = createLogger('useDeviceObservations');

interface UseDeviceObservationsOptions {
  submissionId?: string;
  siteId?: string;
  enabled?: boolean;
}

/**
 * Custom hook for managing device observations (petri dishes and gasifiers)
 *
 * @param options Configuration options
 * @returns Device observation data and mutations
 *
 * @example
 * // Fetch devices for a submission
 * const { petriObservations, gasifierObservations, isLoading } =
 *   useDeviceObservations({ submissionId: 'xxx' });
 *
 * @example
 * // Fetch all device history for a site
 * const { petriObservations, gasifierObservations } =
 *   useDeviceObservations({ siteId: 'xxx' });
 */
export const useDeviceObservations = (options: UseDeviceObservationsOptions) => {
  const { submissionId, siteId, enabled = true } = options;
  const queryClient = useQueryClient();

  // Fetch petri observations
  const {
    data: petriObservations,
    isLoading: petriLoading,
    error: petriError,
  } = useQuery({
    queryKey: submissionId
      ? ['petri-observations', 'submission', submissionId]
      : ['petri-observations', 'site', siteId],
    queryFn: async () => {
      if (submissionId) {
        const { data, error } = await fetchPetriObservationsBySubmissionId(submissionId);
        if (error) throw error;
        return data;
      } else if (siteId) {
        const { data, error } = await fetchPetriObservationsBySiteId(siteId);
        if (error) throw error;
        return data;
      }
      return [];
    },
    enabled: enabled && (!!submissionId || !!siteId),
  });

  // Fetch gasifier observations
  const {
    data: gasifierObservations,
    isLoading: gasifierLoading,
    error: gasifierError,
  } = useQuery({
    queryKey: submissionId
      ? ['gasifier-observations', 'submission', submissionId]
      : ['gasifier-observations', 'site', siteId],
    queryFn: async () => {
      if (submissionId) {
        const { data, error } = await fetchGasifierObservationsBySubmissionId(submissionId);
        if (error) throw error;
        return data;
      } else if (siteId) {
        const { data, error } = await fetchGasifierObservationsBySiteId(siteId);
        if (error) throw error;
        return data;
      }
      return [];
    },
    enabled: enabled && (!!submissionId || !!siteId),
  });

  // Update petri observation
  const updatePetriObservation = useMutation({
    mutationFn: async (updates: Partial<PetriObservation> & { observation_id: string }) => {
      logger.debug('Updating petri observation', updates.observation_id);
      const { data, error } = await supabase
        .from('petri_observations')
        .update(updates)
        .eq('observation_id', updates.observation_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      if (submissionId) {
        queryClient.invalidateQueries({ queryKey: ['petri-observations', 'submission', submissionId] });
      }
      if (siteId) {
        queryClient.invalidateQueries({ queryKey: ['petri-observations', 'site', siteId] });
      }
      toast.success('Petri observation updated successfully');
      logger.info('Petri observation updated', data.observation_id);
    },
    onError: (error) => {
      logger.error('Failed to update petri observation:', error);
      toast.error('Failed to update petri observation');
    },
  });

  // Update gasifier observation
  const updateGasifierObservation = useMutation({
    mutationFn: async (updates: Partial<GasifierObservation> & { observation_id: string }) => {
      logger.debug('Updating gasifier observation', updates.observation_id);
      const { data, error } = await supabase
        .from('gasifier_observations')
        .update(updates)
        .eq('observation_id', updates.observation_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      if (submissionId) {
        queryClient.invalidateQueries({ queryKey: ['gasifier-observations', 'submission', submissionId] });
      }
      if (siteId) {
        queryClient.invalidateQueries({ queryKey: ['gasifier-observations', 'site', siteId] });
      }
      toast.success('Gasifier observation updated successfully');
      logger.info('Gasifier observation updated', data.observation_id);
    },
    onError: (error) => {
      logger.error('Failed to update gasifier observation:', error);
      toast.error('Failed to update gasifier observation');
    },
  });

  // Delete petri observation
  const deletePetriObservation = useMutation({
    mutationFn: async (observationId: string) => {
      logger.debug('Deleting petri observation', observationId);
      const { error } = await supabase
        .from('petri_observations')
        .delete()
        .eq('observation_id', observationId);

      if (error) throw error;
      return observationId;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      if (submissionId) {
        queryClient.invalidateQueries({ queryKey: ['petri-observations', 'submission', submissionId] });
      }
      if (siteId) {
        queryClient.invalidateQueries({ queryKey: ['petri-observations', 'site', siteId] });
      }
      toast.success('Petri observation deleted successfully');
    },
    onError: (error) => {
      logger.error('Failed to delete petri observation:', error);
      toast.error('Failed to delete petri observation');
    },
  });

  // Delete gasifier observation
  const deleteGasifierObservation = useMutation({
    mutationFn: async (observationId: string) => {
      logger.debug('Deleting gasifier observation', observationId);
      const { error } = await supabase
        .from('gasifier_observations')
        .delete()
        .eq('observation_id', observationId);

      if (error) throw error;
      return observationId;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      if (submissionId) {
        queryClient.invalidateQueries({ queryKey: ['gasifier-observations', 'submission', submissionId] });
      }
      if (siteId) {
        queryClient.invalidateQueries({ queryKey: ['gasifier-observations', 'site', siteId] });
      }
      toast.success('Gasifier observation deleted successfully');
    },
    onError: (error) => {
      logger.error('Failed to delete gasifier observation:', error);
      toast.error('Failed to delete gasifier observation');
    },
  });

  // Computed values
  const totalDeviceObservations = (petriObservations?.length || 0) + (gasifierObservations?.length || 0);
  const isLoading = petriLoading || gasifierLoading;
  const error = petriError || gasifierError;

  // Get unique device codes
  const uniquePetriCodes = [...new Set(petriObservations?.map(p => p.petri_code) || [])];
  const uniqueGasifierCodes = [...new Set(gasifierObservations?.map(g => g.gasifier_code) || [])];

  return {
    // Data
    petriObservations: petriObservations || [],
    gasifierObservations: gasifierObservations || [],
    totalDeviceObservations,
    uniquePetriCodes,
    uniqueGasifierCodes,

    // Loading & Error states
    isLoading,
    petriLoading,
    gasifierLoading,
    error,
    petriError,
    gasifierError,

    // Mutations
    updatePetriObservation: updatePetriObservation.mutate,
    updateGasifierObservation: updateGasifierObservation.mutate,
    deletePetriObservation: deletePetriObservation.mutate,
    deleteGasifierObservation: deleteGasifierObservation.mutate,

    // Mutation states
    isUpdatingPetri: updatePetriObservation.isPending,
    isUpdatingGasifier: updateGasifierObservation.isPending,
    isDeletingPetri: deletePetriObservation.isPending,
    isDeletingGasifier: deleteGasifierObservation.isPending,
  };
};

/**
 * Hook for fetching device observations with statistics
 *
 * @example
 * const { stats, isLoading } = useDeviceStatistics({ siteId: 'xxx' });
 * console.log(`Total devices: ${stats.totalDevices}`);
 * console.log(`Avg petri growth index: ${stats.avgPetriGrowthIndex}`);
 */
export const useDeviceStatistics = (options: UseDeviceObservationsOptions) => {
  const { petriObservations, gasifierObservations, isLoading, error } = useDeviceObservations(options);

  // Calculate statistics
  const stats = {
    totalPetris: petriObservations.length,
    totalGasifiers: gasifierObservations.length,
    totalDevices: petriObservations.length + gasifierObservations.length,

    // Petri statistics
    petrisWithImages: petriObservations.filter(p => p.image_url).length,
    petrisWithFungicide: petriObservations.filter(p => p.fungicide_used === 'Yes').length,
    uniquePetriTypes: [...new Set(petriObservations.map(p => p.plant_type))].length,

    // Gasifier statistics
    gasifiersWithImages: gasifierObservations.filter(g => g.image_url).length,
    gasifiersWithAnomalies: gasifierObservations.filter(g => g.anomaly).length,
    uniqueChemicalTypes: [...new Set(gasifierObservations.map(g => g.chemical_type))].length,

    // Placement distribution
    petriPlacementDistribution: petriObservations.reduce((acc, p) => {
      if (p.placement) {
        acc[p.placement] = (acc[p.placement] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>),

    gasifierPlacementDistribution: gasifierObservations.reduce((acc, g) => {
      if (g.directional_placement) {
        acc[g.directional_placement] = (acc[g.directional_placement] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>),
  };

  return {
    stats,
    isLoading,
    error,
  };
};
