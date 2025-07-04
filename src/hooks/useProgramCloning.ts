import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import { PilotProgram } from '../lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { withRetry } from '../utils/helpers';
import { createLogger } from '../utils/logger';

// Create a logger for program cloning operations
const logger = createLogger('ProgramCloning');

interface CloneProgramParams {
  sourceProgram: PilotProgram;
  newName: string;
  newDescription: string;
  newStartDate: string;
  newEndDate: string;
  newPhaseNumber?: number;
  newPhaseType?: 'control' | 'experimental';
  newPhaseLabel?: string;
  siteOverrides?: Record<string, any>;
}

interface ProgramPhase {
  phase_number: number;
  phase_type: 'control' | 'experimental';
  label: string;
  start_date: string;
  end_date: string;
  notes?: string;
}

interface ProgramLineageItem {
  program_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  index: number;
}

interface SiteLineageItem {
  site_id: string;
  site_code: number;
  name: string;
  program_id: string;
  program_name: string;
}

export function useProgramCloning() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /**
   * Clone a program with all its sites
   */
  const cloneProgram = useCallback(async ({
    sourceProgram,
    newName,
    newDescription,
    newStartDate,
    newEndDate,
    newPhaseNumber,
    newPhaseType = 'experimental',
    newPhaseLabel,
    siteOverrides = {}
  }: CloneProgramParams) => {
    logger.info(`Starting program clone operation`, {
      sourceProgramId: sourceProgram.program_id,
      sourceProgramName: sourceProgram.name,
      newName,
      newPhaseNumber,
      newPhaseType
    });
    
    setLoading(true);
    setError(null);
    
    try {
      logger.debug(`Preparing clone program parameters`, {
        programId: sourceProgram.program_id,
        newName,
        newStartDate,
        newEndDate,
        newPhaseNumber,
        newPhaseType,
        newPhaseLabel,
        siteOverrides: Object.keys(siteOverrides).length > 0 ? 'present' : 'none'
      });
      
      const callStartTime = performance.now();
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('clone_program', {
          p_source_program_id: sourceProgram.program_id,
          p_new_name: newName,
          p_new_description: newDescription,
          p_new_start_date: newStartDate,
          p_new_end_date: newEndDate,
          p_new_phase_number: newPhaseNumber,
          p_new_phase_type: newPhaseType,
          p_new_phase_label: newPhaseLabel,
          p_site_overrides: siteOverrides
        })
      , `cloneProgram(${sourceProgram.program_id})`);
      
      const callDuration = performance.now() - callStartTime;
      logger.debug(`clone_program RPC call completed in ${callDuration.toFixed(2)}ms`);
      
      if (error) {
        logger.error(`Error during clone_program RPC call:`, error);
        throw error;
      }
      
      if (!data.success) {
        logger.error(`clone_program RPC returned failure:`, data.message);
        throw new Error(data.message || 'Failed to clone program');
      }
      
      logger.info(`Program cloned successfully:`, {
        newProgramId: data.program_id,
        siteCount: data.site_count,
        siteMappingCount: Object.keys(data.site_mapping).length,
        phaseNumber: data.phase_number,
        phaseType: data.phase_type
      });
      logger.debug(`Site mapping details:`, data.site_mapping);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries(['programs']);
      
      toast.success('Program cloned successfully');
      return data;
    } catch (err) {
      logger.error('Error cloning program:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`Failed to clone program: ${errorMessage}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  /**
   * Get program phases including phases from ancestor programs
   */
  const getProgramPhases = useCallback(async (programId: string): Promise<ProgramPhase[] | null> => {
    logger.debug(`Getting program phases for program ${programId}`);
    setLoading(true);
    setError(null);
    
    try {
      const callStartTime = performance.now();
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('get_program_phases', {
          p_program_id: programId
        })
      , `getProgramPhases(${programId})`);
      
      const callDuration = performance.now() - callStartTime;
      logger.debug(`get_program_phases RPC call completed in ${callDuration.toFixed(2)}ms`);
      
      if (error) {
        logger.error(`Error during get_program_phases RPC call:`, error);
        throw error;
      }
      
      if (!data.success) {
        logger.error(`get_program_phases RPC returned failure:`, data.message);
        throw new Error(data.message || 'Failed to get program phases');
      }
      
      const phasesCount = data.phases?.length || 0;
      logger.debug(`Retrieved ${phasesCount} program phases for program ${programId}`);
      
      return data.phases;
    } catch (err) {
      logger.error('Error getting program phases:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get program lineage (current program and all ancestors)
   */
  const getProgramLineage = useCallback(async (programId: string): Promise<ProgramLineageItem[] | null> => {
    logger.debug(`Getting program lineage for program ${programId}`);
    setLoading(true);
    setError(null);
    
    try {
      const callStartTime = performance.now();
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('get_program_lineage', {
          p_program_id: programId
        })
      , `getProgramLineage(${programId})`);
      
      const callDuration = performance.now() - callStartTime;
      logger.debug(`get_program_lineage RPC call completed in ${callDuration.toFixed(2)}ms`);
      
      if (error) {
        logger.error(`Error during get_program_lineage RPC call:`, error);
        throw error;
      }
      
      if (!data.success) {
        logger.error(`get_program_lineage RPC returned failure:`, data.message);
        throw new Error(data.message || 'Failed to get program lineage');
      }
      
      const lineageCount = data.lineage?.length || 0;
      logger.debug(`Retrieved program lineage with ${lineageCount} items for program ${programId}`);
      
      return data.lineage;
    } catch (err) {
      logger.error('Error getting program lineage:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    cloneProgram,
    getProgramPhases,
    getProgramLineage,
    loading,
    error
  };
}

export default useProgramCloning;