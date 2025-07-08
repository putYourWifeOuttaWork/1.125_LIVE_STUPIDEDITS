import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-toastify';

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

const useReports = () => {
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch reports
  const fetchReports = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('custom_reports')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast.error('Failed to fetch reports');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete report
  const deleteReport = async (reportId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('custom_reports')
        .delete()
        .eq('report_id', reportId);

      if (error) throw error;

      // Remove from local state
      setReports(prev => prev.filter(report => report.report_id !== reportId));
      return true;
    } catch (error) {
      console.error('Error deleting report:', error);
      return false;
    }
  };

  // Create report
  const createReport = async (reportData: Omit<CustomReport, 'report_id' | 'created_at' | 'updated_at'>): Promise<CustomReport | null> => {
    try {
      const { data, error } = await supabase
        .from('custom_reports')
        .insert([reportData])
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      setReports(prev => [data, ...prev]);
      return data;
    } catch (error) {
      console.error('Error creating report:', error);
      toast.error('Failed to create report');
      return null;
    }
  };

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
      setReports(prev => prev.map(report => 
        report.report_id === reportId ? { ...report, ...data } : report
      ));
      return true;
    } catch (error) {
      console.error('Error updating report:', error);
      toast.error('Failed to update report');
      return false;
    }
  };

  // Load reports on mount
  useEffect(() => {
    fetchReports();
  }, []);

  return {
    reports,
    isLoading,
    fetchReports,
    deleteReport,
    createReport,
    updateReport,
  };
};

export default useReports;