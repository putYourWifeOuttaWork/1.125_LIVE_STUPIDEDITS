import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface CustomReport {
  report_id: string;
  name: string;
  description?: string;
  created_by_user_id: string;
  company_id: string;
  program_id?: string;
  configuration: {
    entity: string;
    metrics?: Array<{
      field: string;
      function: string;
    }>;
    time_dimension?: {
      field: string;
      granularity: string;
    };
    filters?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
  };
  created_at: string;
  updated_at: string;
}

// Interface for a single entity's metadata
export interface ReportEntityMetadata {
  entity: string;
  label: string;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    roles: string[];
    enum_values?: string[];
  }>;
  aggregations: Array<{
    name: string;
    label: string;
    function: string;
    field?: string;
  }>;
  join_keys: Record<string, { local: string; foreign: string }>;
}

export interface ReportResult {
  success: boolean;
  query?: string;
  count?: number;
  data?: any[];
  message?: string;
  metadata?: {
    entity: string;
    dimension: string;
    metric: {
      function: string;
      field: string;
    };
  };
}

const useReports = () => {
  const { user } = { user: { id: '' } }; // Get from auth store
  const queryClient = useQueryClient();

  // Query for fetching all reports
  const reportsQuery = useQuery({
    queryKey: ['reports', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .order('name');
        
      if (error) {
        throw error;
      }
      
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Query for fetching report metadata
  const reportMetadataQuery = useQuery({
    queryKey: ['reportMetadata'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_available_report_metadata');
      
      if (error) {
        throw error;
      }
      
      return data as ReportEntityMetadata[];
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - metadata doesn't change often
  });

  // Execute a report query
  const executeReportQuery = async (
    configuration: any,
    limit = 1000,
    offset = 0
  ): Promise<ReportResult | null> => {
    try {
      const { data, error } = await supabase.rpc('execute_custom_report_query', {
        p_report_configuration: configuration,
        p_limit: limit,
        p_offset: offset
      });

      if (error) throw error;

      return data as ReportResult;
    } catch (error) {
      console.error('Error executing report query:', error);
      toast.error('Failed to execute report query');
      return null;
    }
  };

  // Create report mutation
  const createReportMutation = useMutation({
    mutationFn: async (reportData: {
      name: string;
      description?: string;
      program_id?: string;
      configuration: any;
    }) => {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get user's company_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;
      if (!userData?.company_id) throw new Error('User has no company association');

      const fullReportData = {
        name: reportData.name,
        description: reportData.description,
        created_by_user_id: user.id,
        company_id: userData.company_id,
        program_id: reportData.program_id,
        configuration: reportData.configuration
      };

      const { data, error } = await supabase
        .from('custom_reports')
        .insert([fullReportData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (newReport) => {
      queryClient.invalidateQueries(['reports']);
      toast.success('Report created successfully');
    },
    onError: (error) => {
      console.error('Error in createReportMutation:', error);
      toast.error(`Failed to create report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from('custom_reports')
        .delete()
        .eq('report_id', reportId);

      if (error) throw error;
      return reportId;
    },
    onSuccess: (reportId) => {
      queryClient.invalidateQueries(['reports']);
      toast.success('Report deleted successfully');
    },
    onError: (error) => {
      console.error('Error in deleteReportMutation:', error);
      toast.error(`Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Wrapper for createReport
  const createReport = async (
    name: string,
    configuration: any,
    description?: string,
    programId?: string
  ): Promise<CustomReport | null> => {
    try {
      return await createReportMutation.mutateAsync({
        name,
        description,
        program_id: programId,
        configuration
      });
    } catch (error) {
      return null;
    }
  };

  // Wrapper for deleteReport
  const deleteReport = async (reportId: string): Promise<boolean> => {
    try {
      await deleteReportMutation.mutateAsync(reportId);
      return true;
    } catch (error) {
      console.error('Error deleting report:', error);
      return false;
      };
  }

  // Update report
  const updateReport = async (reportId: string, updates: Partial<CustomReport>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('custom_reports')
        .update(updates)
        .eq('report_id', reportId)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      queryClient.invalidateQueries(['reports']);
      queryClient.setQueryData(['report', reportId], data);
      
      return true;
    } catch (error) {
      console.error('Error updating report:', error);
      toast.error('Failed to update report');
      return false;
    }
  };
  
  // Fetch a report by ID
  const fetchReport = async (reportId: string): Promise<CustomReport | null> => {
    try {
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .eq('report_id', reportId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching report:', error);
      return null;
    }
  };

  return {
    reports: reportsQuery.data || [],
    reportMetadata: reportMetadataQuery.data || [], // Now returns the array directly
    isLoading: reportsQuery.isLoading || reportMetadataQuery.isLoading,
    isError: reportsQuery.isError || reportMetadataQuery.isError,
    error: reportsQuery.error || reportMetadataQuery.error,
    createReport,
    deleteReport,
    fetchReport,
    updateReport,
    executeReportQuery
  };
};

export default useReports;