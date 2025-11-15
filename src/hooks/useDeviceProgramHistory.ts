import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface DeviceProgramAssignment {
  assignment_id: string;
  device_id: string;
  program_id: string;
  site_id?: string;
  is_primary: boolean;
  is_active: boolean;
  assigned_at: string;
  unassigned_at: string | null;
  reason?: string;
  notes?: string;
  pilot_programs?: {
    program_id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
  };
  sites?: {
    site_id: string;
    name: string;
    site_code: number;
  };
}

interface DeviceProgramHistoryReturn {
  assignments: DeviceProgramAssignment[];
  activePrograms: DeviceProgramAssignment[];
  historicalPrograms: DeviceProgramAssignment[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useDeviceProgramHistory = (deviceId: string | undefined): DeviceProgramHistoryReturn => {
  const [assignments, setAssignments] = useState<DeviceProgramAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProgramHistory = async () => {
    if (!deviceId) {
      setAssignments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch from device_program_assignments
      const { data: programAssignments, error: programError } = await supabase
        .from('device_program_assignments')
        .select(`
          assignment_id,
          device_id,
          program_id,
          is_primary,
          is_active,
          assigned_at,
          unassigned_at,
          reason,
          notes,
          pilot_programs!inner (
            program_id,
            name,
            start_date,
            end_date,
            status
          )
        `)
        .eq('device_id', deviceId)
        .order('assigned_at', { ascending: false });

      if (programError) throw programError;

      // Fetch site assignments to enrich the data
      const { data: siteAssignments, error: siteError } = await supabase
        .from('device_site_assignments')
        .select(`
          program_id,
          site_id,
          sites!inner (
            site_id,
            name,
            site_code
          )
        `)
        .eq('device_id', deviceId);

      if (siteError) throw siteError;

      // Merge site data into program assignments
      const enrichedAssignments = (programAssignments || []).map(assignment => {
        const siteAssignment = siteAssignments?.find(
          sa => sa.program_id === assignment.program_id
        );
        return {
          ...assignment,
          site_id: siteAssignment?.site_id,
          sites: siteAssignment?.sites
        };
      });

      setAssignments(enrichedAssignments);
    } catch (err) {
      console.error('Error fetching device program history:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProgramHistory();
  }, [deviceId]);

  // Split into active and historical
  const activePrograms = assignments.filter(a => a.is_active && !a.unassigned_at);
  const historicalPrograms = assignments.filter(a => !a.is_active || a.unassigned_at);

  return {
    assignments,
    activePrograms,
    historicalPrograms,
    isLoading,
    error,
    refetch: fetchProgramHistory
  };
};
