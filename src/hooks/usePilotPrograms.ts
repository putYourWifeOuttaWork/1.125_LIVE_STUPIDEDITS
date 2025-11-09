import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { PilotProgram, ProgramPhase } from '../lib/types';
import { toast } from 'react-toastify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withRetry } from '../utils/helpers';
import { createLogger } from '../utils/logger';

// Create a logger for pilot programs operations
const logger = createLogger('PilotPrograms');

interface UsePilotProgramsResult {
  programs: PilotProgram[];
  isLoading: boolean;
  error: string | null;
  refetchPrograms: () => Promise<void>;
  createProgram: (programData: Omit<PilotProgram, 'program_id' | 'total_submissions' | 'total_sites' | 'created_at' | 'updated_at'>) => Promise<PilotProgram | null>;
  updateProgram: (programId: string, programData: Partial<PilotProgram>) => Promise<PilotProgram | null>;
  deleteProgram: (programId: string) => Promise<boolean>;
  fetchPilotProgram: (programId: string) => Promise<PilotProgram | null>;
}

// Helper function to sort programs by phase
const sortProgramsByPhase = (programs: PilotProgram[]) => {
  return [...programs].sort((a, b) => {
    // Get latest phase number from program a
    const aPhaseNumber = a.phases && Array.isArray(a.phases) && a.phases.length > 0
      ? Math.max(...a.phases.map(p => typeof p.phase_number === 'number' ? p.phase_number : parseInt(p.phase_number as any, 10)))
      : 0;
    
    // Get latest phase number from program b
    const bPhaseNumber = b.phases && Array.isArray(b.phases) && b.phases.length > 0
      ? Math.max(...b.phases.map(p => typeof p.phase_number === 'number' ? p.phase_number : parseInt(p.phase_number as any, 10)))
      : 0;
    
    // Sort by phase number first
    if (aPhaseNumber !== bPhaseNumber) {
      return aPhaseNumber - bPhaseNumber;
    }
    
    // If phase numbers are the same, sort by end date (ascending)
    const aEndDate = new Date(a.end_date).getTime();
    const bEndDate = new Date(b.end_date).getTime();
    return aEndDate - bEndDate;
  });
};

export const usePilotPrograms = (): UsePilotProgramsResult => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Use React Query for fetching programs
  // Note: No manual company filtering needed - RLS policies handle company isolation
  const programsQuery = useQuery({
    queryKey: ['programs', user?.id],
    queryFn: async () => {
      if (!user) return [];

      logger.debug('Fetching programs for user:', user.id);

      // RLS policies automatically filter programs based on:
      // - Super admins: see programs in their active company context
      // - Company admins: see all programs in their company
      // - Regular users: see only programs they have explicit access to
      const { data, error } = await withRetry(() =>
        supabase
          .from('pilot_programs_with_progress')
          .select('*, phases')
          .order('name')
      , 'fetchPilotPrograms');

      if (error) {
        logger.error('Error fetching programs:', error);
        throw error;
      }

      logger.debug(`Successfully fetched ${data?.length || 0} programs (filtered by RLS)`);

      // Sort programs by phase number and then end date
      return sortProgramsByPhase(data || []);
    },
    enabled: !!user,
    staleTime: 0, // Always refetch on window focus
    refetchOnWindowFocus: true,
  });

  // Use React Query for fetching a single program
  const fetchPilotProgram = async (programId: string): Promise<PilotProgram | null> => {
    try {
      logger.debug(`Fetching program with ID: ${programId}`);
      
      // Check cache first
      const cachedProgram = queryClient.getQueryData<PilotProgram>(['program', programId]);
      if (cachedProgram) {
        logger.debug('Using cached program data:', cachedProgram.name);
        return cachedProgram;
      }
      
      const { data, error } = await withRetry(() => 
        // Update to use the new view instead of the direct table
        supabase
          .from('pilot_programs_with_progress')
          .select('*, phases')
          .eq('program_id', programId)
          .single()
      , `fetchPilotProgram(${programId})`);
        
      if (error) {
        logger.error('Error fetching pilot program:', error);
        return null;
      }
      
      logger.debug('Successfully fetched program:', data?.name);
      
      // Cache the result
      queryClient.setQueryData(['program', programId], data);
      return data;
    } catch (err) {
      logger.error('Error in fetchPilotProgram:', err);
      return null;
    }
  };

  // Create program mutation
  const createProgramMutation = useMutation({
    mutationFn: async (programData: Omit<PilotProgram, 'program_id' | 'total_submissions' | 'total_sites' | 'created_at' | 'updated_at'>) => {
      // Calculate status based on date range
      const today = new Date();
      const startDate = new Date(programData.start_date);
      const endDate = new Date(programData.end_date);
      
      const calculatedStatus = 
        (today >= startDate && today <= endDate) ? 'active' : 'inactive';
        
      // Create initial phases array with Phase 1
      const initialPhase: ProgramPhase = {
        phase_number: 1,
        phase_type: 'control', // First phase is typically control
        label: 'Phase 1 (control)',
        start_date: programData.start_date,
        end_date: programData.end_date
      };
        
      const phases = [initialPhase];
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('pilot_programs')
          .insert({
            ...programData,
            status: calculatedStatus,
            total_submissions: 0,
            total_sites: 0,
            phases: phases
          })
          .select()
          .single()
      , 'createProgram');
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate and refetch programs query
      queryClient.invalidateQueries({queryKey: ['programs']});
      
      // Add the new program to the cache
      queryClient.setQueryData(['program', data.program_id], data);
      
      toast.success('Program created successfully');
    },
    onError: (error) => {
      logger.error('Error creating program:', error);
      toast.error(`Failed to create program: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Update program mutation
  const updateProgramMutation = useMutation({
    mutationFn: async ({ programId, programData }: { programId: string, programData: Partial<PilotProgram> }) => {
      const { data, error } = await withRetry(() => 
        supabase
          .from('pilot_programs')
          .update(programData)
          .eq('program_id', programId)
          .select()
          .single()
      , `updateProgram(${programId})`);
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update the cache for this program
      queryClient.setQueryData(['program', data.program_id], data);
      
      // Update the program in the programs list
      queryClient.setQueryData<PilotProgram[]>(['programs', user?.id], (oldData) => {
        if (!oldData) return [data];
        return oldData.map(p => 
          p.program_id === data.program_id ? data : p
        );
      });
      
      toast.success('Program updated successfully');
    },
    onError: (error) => {
      logger.error('Error updating program:', error);
      toast.error(`Failed to update program: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Delete program mutation
  const deleteProgramMutation = useMutation({
    mutationFn: async (programId: string) => {
      const { error } = await withRetry(() => 
        supabase
          .from('pilot_programs')
          .delete()
          .eq('program_id', programId)
      , `deleteProgram(${programId})`);
      
      if (error) throw error;
      return programId;
    },
    onSuccess: (programId) => {
      // Remove the program from the cache
      queryClient.removeQueries({queryKey: ['program', programId]});
      
      // Remove the program from the programs list
      queryClient.setQueryData<PilotProgram[]>(['programs', user?.id], (oldData) => {
        if (!oldData) return [];
        return oldData.filter(p => p.program_id !== programId);
      });
      
      toast.success('Program deleted successfully');
    },
    onError: (error) => {
      logger.error('Error deleting program:', error);
      toast.error(`Failed to delete program: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Wrapper for createProgram
  const createProgram = async (programData: Omit<PilotProgram, 'program_id' | 'total_submissions' | 'total_sites' | 'created_at' | 'updated_at'>): Promise<PilotProgram | null> => {
    try {
      return await createProgramMutation.mutateAsync(programData);
    } catch (error) {
      return null;
    }
  };

  // Wrapper for updateProgram
  const updateProgram = async (programId: string, programData: Partial<PilotProgram>): Promise<PilotProgram | null> => {
    try {
      return await updateProgramMutation.mutateAsync({ programId, programData });
    } catch (error) {
      return null;
    }
  };

  // Wrapper for deleteProgram
  const deleteProgram = async (programId: string): Promise<boolean> => {
    try {
      await deleteProgramMutation.mutateAsync(programId);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Force refetch programs
  const refetchPrograms = useCallback(async () => {
    logger.debug("Forcing program refetch");
    await queryClient.invalidateQueries({queryKey: ['programs']});
  }, [queryClient]);

  return {
    programs: programsQuery.data || [],
    isLoading: programsQuery.isLoading,
    error: programsQuery.error ? String(programsQuery.error) : null,
    refetchPrograms,
    createProgram,
    updateProgram,
    deleteProgram,
    fetchPilotProgram
  };
};

export default usePilotPrograms;