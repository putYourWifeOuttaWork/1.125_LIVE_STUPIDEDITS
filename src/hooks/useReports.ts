import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'react-toastify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withRetry } from '../utils/helpers';
import { createLogger } from '../utils/logger';
import useCompanies from './useCompanies';

// Create a logger for report operations
const logger = createLogger('useReports');

// Define types for reports
export interface ReportConfiguration {
  entity: string;
  dimensions?: string[];
  metrics?: {
    function: string;
    field: string;
  }[];
  time_dimension?: {
    field: string;
    granularity: 'day' | 'week' | 'month' | 'quarter' | 'year';
  };
  filters?: {
    field: string;
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'IN';
    value: string | string[] | number | boolean;
  }[];
  program_id?: string;
  company_id?: string;
  visualization?: {
    type: 'bar' | 'line' | 'pie' | 'table';
    options?: Record<string, any>;
  };
}

export interface CustomReport {
  report_id: string;
  name: string;
  description?: string;
  created_by_user_id: string;
  company_id: string;
  program_id?: string;
  configuration: ReportConfiguration;
  created_at: string;
  updated_at: string;
}

export interface ReportMetadata {
  entity: string;
  label: string;
  fields: {
    name: string;
    label: string;
    type: string;
    roles: ('dimension' | 'metric' | 'filter')[];
    enum_values?: string[];
  }[];
  aggregations: {
    name: string;
    label: string;
    function: string;
    field?: string;
  }[];
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

export function useReports() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { userCompany } = useCompanies();

  // Query for fetching all reports
  const reportsQuery = useQuery({
    queryKey: ['reports', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      logger.debug('Fetching reports for user:', user.id);
      const { data, error } = await withRetry(() => 
        supabase
          .from('custom_reports')
          .select('*')
          .order('name')
      , 'fetchReports');
        
      if (error) {
        logger.error('Error fetching reports:', error);
        throw error;
      }
      
      logger.debug(`Successfully fetched ${data?.length || 0} reports`);
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Query for fetching report metadata
  const reportMetadataQuery = useQuery({
    queryKey: ['reportMetadata'],
    queryFn: async () => {
      logger.debug('Fetching report metadata');
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('get_available_report_metadata')
      , 'getReportMetadata');
      
      if (error) {
        logger.error('Error fetching report metadata:', error);
        throw error;
      }
      
      logger.debug('Successfully fetched report metadata');
      return data as ReportMetadata[];
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - metadata doesn't change often
    retry: 2,
  });

  // Mutation for creating a new report
  const createReportMutation = useMutation({
    mutationFn: async (reportData: {
      name: string;
      description?: string;
      program_id?: string;
      configuration: ReportConfiguration;
    }) => {
      logger.debug('Creating new report:', reportData.name);
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('custom_reports')
          .insert({
            name: reportData.name,
            description: reportData.description,
            created_by_user_id: user!.id,
            company_id: user!.user_metadata?.company_id || '', // This assumes company_id is stored in user metadata
            program_id: reportData.program_id,
            configuration: reportData.configuration
          })
          .select()
          .single()
      , 'createReport');
      
      if (error) {
        logger.error('Error creating report:', error);
        throw error;
      }
      
      logger.debug('Report created successfully:', data.report_id);
      return data as CustomReport;
    },
    onSuccess: (data) => {
      // Invalidate and refetch reports query
      queryClient.invalidateQueries({queryKey: ['reports']});
      
      toast.success('Report created successfully');
    },
    onError: (error) => {
      logger.error('Error in createReportMutation:', error);
      toast.error(`Failed to create report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Mutation for updating an existing report
  const updateReportMutation = useMutation({
    mutationFn: async ({
      reportId,
      updates
    }: {
      reportId: string;
      updates: Partial<Omit<CustomReport, 'report_id' | 'created_by_user_id' | 'created_at' | 'updated_at'>>;
    }) => {
      logger.debug(`Updating report ${reportId}:`, updates);
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('custom_reports')
          .update(updates)
          .eq('report_id', reportId)
          .select()
          .single()
      , `updateReport(${reportId})`);
      
      if (error) {
        logger.error('Error updating report:', error);
        throw error;
      }
      
      logger.debug('Report updated successfully:', data.report_id);
      return data as CustomReport;
    },
    onSuccess: (data) => {
      // Update the cache for this report
      queryClient.setQueryData(['report', data.report_id], data);
      
      // Update the report in the reports list
      queryClient.setQueryData<CustomReport[]>(['reports', user?.id], (oldData) => {
        if (!oldData) return [data];
        return oldData.map(r => 
          r.report_id === data.report_id ? data : r
        );
      });
      
      toast.success('Report updated successfully');
    },
    onError: (error) => {
      logger.error('Error in updateReportMutation:', error);
      toast.error(`Failed to update report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Mutation for deleting a report
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      logger.debug(`Deleting report ${reportId}`);
      
      const { error } = await withRetry(() => 
        supabase
          .from('custom_reports')
          .delete()
          .eq('report_id', reportId)
      , `deleteReport(${reportId})`);
      
      if (error) {
        logger.error('Error deleting report:', error);
        throw error;
      }
      
      logger.debug('Report deleted successfully');
      return reportId;
    },
    onSuccess: (reportId) => {
      // Remove the report from the cache
      queryClient.removeQueries({queryKey: ['report', reportId]});
      
      // Remove the report from the reports list
      queryClient.setQueryData<CustomReport[]>(['reports', user?.id], (oldData) => {
        if (!oldData) return [];
        return oldData.filter(r => r.report_id !== reportId);
      });
      
      toast.success('Report deleted successfully');
    },
    onError: (error) => {
      logger.error('Error in deleteReportMutation:', error);
      toast.error(`Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Mutation for executing a report query
  const executeReportQueryMutation = useMutation({
    mutationFn: async ({
      configuration,
      limit = 1000,
      offset = 0
    }: {
      configuration: ReportConfiguration;
      limit?: number;
      offset?: number;
    }) => {
      logger.debug('Executing report query:', {
        entity: configuration.entity,
        dimensions: configuration.dimensions,
        metrics: configuration.metrics,
        limit,
        offset
      });

      // Validate company association
      if (!userCompany?.company_id) {
        throw new Error('You must be associated with a company to create reports');
      }
      
      const { data, error } = await withRetry(() => 
        supabase.rpc('execute_custom_report_query', {
          p_report_configuration: {
            ...configuration,
            company_id: userCompany.company_id // Add company_id to the configuration
          },
          p_limit: limit,
          p_offset: offset
        })
      , 'executeReportQuery');
      
      if (error) {
        logger.error('Error executing report query:', error);
        throw error;
      }
      
      logger.debug('Report query executed successfully:', {
        success: data.success,
        count: data.count,
        dataLength: data.data?.length
      });
      
      return data as ReportResult;
    },
    onError: (error) => {
      logger.error('Error in executeReportQueryMutation:', error);
      toast.error(`Failed to execute report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Function to fetch a single report by ID
  const fetchReport = useCallback(async (reportId: string): Promise<CustomReport | null> => {
    try {
      logger.debug(`Fetching report with ID: ${reportId}`);
      
      // Check cache first
      const cachedReport = queryClient.getQueryData<CustomReport>(['report', reportId]);
      if (cachedReport) {
        logger.debug('Using cached report data');
        return cachedReport;
      }
      
      const { data, error } = await withRetry(() => 
        supabase
          .from('custom_reports')
          .select('*')
          .eq('report_id', reportId)
          .single()
      , `fetchReport(${reportId})`);
        
      if (error) {
        logger.error('Error fetching report:', error);
        return null;
      }
      
      // Cache the result
      queryClient.setQueryData(['report', reportId], data);
      
      logger.debug('Successfully fetched report');
      return data as CustomReport;
    } catch (err) {
      logger.error('Error in fetchReport:', err);
      return null;
    }
  }, [queryClient]);

  // Wrapper functions to expose the functionality with simpler interfaces

  const createReport = async (
    name: string,
    configuration: ReportConfiguration,
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

  const updateReport = async (
    reportId: string,
    updates: {
      name?: string;
      description?: string;
      program_id?: string;
      configuration?: ReportConfiguration;
    }
  ): Promise<CustomReport | null> => {
    try {
      return await updateReportMutation.mutateAsync({ reportId, updates });
    } catch (error) {
      return null;
    }
  };

  const deleteReport = async (reportId: string): Promise<boolean> => {
    try {
      await deleteReportMutation.mutateAsync(reportId);
      return true;
    } catch (error) {
      return false;
    }
  };

  const executeReportQuery = async (
    configuration: ReportConfiguration,
    limit?: number,
    offset?: number
  ): Promise<ReportResult | null> => {
    try {
      return await executeReportQueryMutation.mutateAsync({ configuration, limit, offset });
    } catch (error) {
      return null;
    }
  };

  // Return all queries and mutations for use in components
  return {
    reports: reportsQuery.data || [],
    reportMetadata: reportMetadataQuery.data || [],
    isLoading: reportsQuery.isLoading || reportMetadataQuery.isLoading,
    isError: reportsQuery.isError || reportMetadataQuery.isError,
    error: reportsQuery.error || reportMetadataQuery.error,
    createReport,
    updateReport,
    deleteReport,
    fetchReport,
    executeReportQuery
  };
}

export default useReports;