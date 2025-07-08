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

export interface ReportMetadata {
  entities: Array<{
    id: string;
    name: string;
    fields: Array<{
      id: string;
      name: string;
      type: string;
      aggregatable?: boolean;
    }>;
    aggregations: Array<{
      id: string;
      name: string;
      function: string;
    }>;
  }>;
}

// Define report metadata based on database schema
export const reportMetadata: ReportMetadata = {
  entities: [
    {
      id: 'submissions',
      name: 'Submissions',
      fields: [
        { id: 'submission_id', name: 'Submission ID', type: 'uuid' },
        { id: 'site_id', name: 'Site ID', type: 'uuid' },
        { id: 'program_id', name: 'Program ID', type: 'uuid' },
        { id: 'temperature', name: 'Temperature', type: 'numeric', aggregatable: true },
        { id: 'humidity', name: 'Humidity', type: 'numeric', aggregatable: true },
        { id: 'indoor_temperature', name: 'Indoor Temperature', type: 'numeric', aggregatable: true },
        { id: 'indoor_humidity', name: 'Indoor Humidity', type: 'numeric', aggregatable: true },
        { id: 'airflow', name: 'Airflow', type: 'enum' },
        { id: 'odor_distance', name: 'Odor Distance', type: 'enum' },
        { id: 'weather', name: 'Weather', type: 'enum' },
        { id: 'created_at', name: 'Created At', type: 'timestamp' },
        { id: 'global_submission_id', name: 'Global Submission ID', type: 'bigint' }
      ],
      aggregations: [
        { id: 'count', name: 'Count', function: 'COUNT' },
        { id: 'avg_temperature', name: 'Average Temperature', function: 'AVG' },
        { id: 'max_temperature', name: 'Maximum Temperature', function: 'MAX' },
        { id: 'min_temperature', name: 'Minimum Temperature', function: 'MIN' },
        { id: 'avg_humidity', name: 'Average Humidity', function: 'AVG' }
      ]
    },
    {
      id: 'petri_observations',
      name: 'Petri Observations',
      fields: [
        { id: 'observation_id', name: 'Observation ID', type: 'uuid' },
        { id: 'submission_id', name: 'Submission ID', type: 'uuid' },
        { id: 'site_id', name: 'Site ID', type: 'uuid' },
        { id: 'petri_code', name: 'Petri Code', type: 'varchar' },
        { id: 'fungicide_used', name: 'Fungicide Used', type: 'enum' },
        { id: 'plant_type', name: 'Plant Type', type: 'enum' },
        { id: 'placement', name: 'Placement', type: 'enum' },
        { id: 'placement_dynamics', name: 'Placement Dynamics', type: 'enum' },
        { id: 'petri_growth_stage', name: 'Growth Stage', type: 'enum' },
        { id: 'growth_index', name: 'Growth Index', type: 'numeric', aggregatable: true },
        { id: 'growth_progression', name: 'Growth Progression', type: 'numeric', aggregatable: true },
        { id: 'growth_aggression', name: 'Growth Aggression', type: 'numeric', aggregatable: true },
        { id: 'growth_velocity', name: 'Growth Velocity', type: 'real', aggregatable: true },
        { id: 'outdoor_temperature', name: 'Outdoor Temperature', type: 'numeric', aggregatable: true },
        { id: 'outdoor_humidity', name: 'Outdoor Humidity', type: 'numeric', aggregatable: true },
        { id: 'created_at', name: 'Created At', type: 'timestamp' },
        { id: 'todays_day_of_phase', name: 'Day of Phase', type: 'numeric', aggregatable: true }
      ],
      aggregations: [
        { id: 'count', name: 'Count', function: 'COUNT' },
        { id: 'avg_growth_index', name: 'Average Growth Index', function: 'AVG' },
        { id: 'max_growth_index', name: 'Maximum Growth Index', function: 'MAX' },
        { id: 'min_growth_index', name: 'Minimum Growth Index', function: 'MIN' },
        { id: 'avg_growth_progression', name: 'Average Growth Progression', function: 'AVG' }
      ]
    },
    {
      id: 'gasifier_observations',
      name: 'Gasifier Observations',
      fields: [
        { id: 'observation_id', name: 'Observation ID', type: 'uuid' },
        { id: 'submission_id', name: 'Submission ID', type: 'uuid' },
        { id: 'site_id', name: 'Site ID', type: 'uuid' },
        { id: 'gasifier_code', name: 'Gasifier Code', type: 'text' },
        { id: 'chemical_type', name: 'Chemical Type', type: 'enum' },
        { id: 'measure', name: 'Measure', type: 'numeric', aggregatable: true },
        { id: 'placement_height', name: 'Placement Height', type: 'enum' },
        { id: 'directional_placement', name: 'Directional Placement', type: 'enum' },
        { id: 'placement_strategy', name: 'Placement Strategy', type: 'enum' },
        { id: 'linear_reading', name: 'Linear Reading', type: 'real', aggregatable: true },
        { id: 'linear_reduction_per_day', name: 'Linear Reduction Per Day', type: 'real', aggregatable: true },
        { id: 'flow_rate', name: 'Flow Rate', type: 'real', aggregatable: true },
        { id: 'outdoor_temperature', name: 'Outdoor Temperature', type: 'numeric', aggregatable: true },
        { id: 'outdoor_humidity', name: 'Outdoor Humidity', type: 'numeric', aggregatable: true },
        { id: 'created_at', name: 'Created At', type: 'timestamp' },
        { id: 'anomaly', name: 'Anomaly', type: 'boolean' }
      ],
      aggregations: [
        { id: 'count', name: 'Count', function: 'COUNT' },
        { id: 'avg_measure', name: 'Average Measure', function: 'AVG' },
        { id: 'max_measure', name: 'Maximum Measure', function: 'MAX' },
        { id: 'min_measure', name: 'Minimum Measure', function: 'MIN' },
        { id: 'avg_flow_rate', name: 'Average Flow Rate', function: 'AVG' }
      ]
    },
    {
      id: 'sites',
      name: 'Sites',
      fields: [
        { id: 'site_id', name: 'Site ID', type: 'uuid' },
        { id: 'program_id', name: 'Program ID', type: 'uuid' },
        { id: 'name', name: 'Site Name', type: 'varchar' },
        { id: 'type', name: 'Site Type', type: 'enum' },
        { id: 'total_petris', name: 'Total Petris', type: 'integer', aggregatable: true },
        { id: 'total_gasifiers', name: 'Total Gasifiers', type: 'integer', aggregatable: true },
        { id: 'square_footage', name: 'Square Footage', type: 'numeric', aggregatable: true },
        { id: 'cubic_footage', name: 'Cubic Footage', type: 'numeric', aggregatable: true },
        { id: 'primary_function', name: 'Primary Function', type: 'enum' },
        { id: 'construction_material', name: 'Construction Material', type: 'enum' },
        { id: 'ventilation_strategy', name: 'Ventilation Strategy', type: 'enum' },
        { id: 'microbial_risk_zone', name: 'Microbial Risk Zone', type: 'enum' },
        { id: 'created_at', name: 'Created At', type: 'timestamp' }
      ],
      aggregations: [
        { id: 'count', name: 'Count', function: 'COUNT' },
        { id: 'avg_square_footage', name: 'Average Square Footage', function: 'AVG' },
        { id: 'total_square_footage', name: 'Total Square Footage', function: 'SUM' },
        { id: 'avg_total_petris', name: 'Average Petris per Site', function: 'AVG' }
      ]
    },
    {
      id: 'pilot_programs',
      name: 'Pilot Programs',
      fields: [
        { id: 'program_id', name: 'Program ID', type: 'uuid' },
        { id: 'name', name: 'Program Name', type: 'varchar' },
        { id: 'status', name: 'Status', type: 'enum' },
        { id: 'start_date', name: 'Start Date', type: 'date' },
        { id: 'end_date', name: 'End Date', type: 'date' },
        { id: 'total_submissions', name: 'Total Submissions', type: 'integer', aggregatable: true },
        { id: 'total_sites', name: 'Total Sites', type: 'integer', aggregatable: true },
        { id: 'created_at', name: 'Created At', type: 'timestamp' }
      ],
      aggregations: [
        { id: 'count', name: 'Count', function: 'COUNT' },
        { id: 'avg_submissions', name: 'Average Submissions', function: 'AVG' },
        { id: 'total_submissions', name: 'Total Submissions', function: 'SUM' },
        { id: 'avg_sites', name: 'Average Sites', function: 'AVG' }
      ]
    }
  ]
};

const useReports = () => {
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Execute a report query
  const executeReportQuery = async (configuration: any): Promise<any[]> => {
    try {
      // For now, return a basic query based on entity type
      // In production, this would call a more sophisticated RPC function
      let query = supabase.from(configuration.entity);
      
      // Apply basic selections
      if (configuration.metrics && configuration.metrics.length > 0) {
        const selectFields = configuration.metrics.map((metric: any) => {
          if (metric.function === 'COUNT') {
            return `${metric.field}:count()`;
          }
          return metric.field;
        });
        query = query.select(selectFields.join(','));
      } else {
        query = query.select('*');
      }

      // Apply filters
      if (configuration.filters && configuration.filters.length > 0) {
        configuration.filters.forEach((filter: any) => {
          switch (filter.operator) {
            case 'eq':
              query = query.eq(filter.field, filter.value);
              break;
            case 'gt':
              query = query.gt(filter.field, filter.value);
              break;
            case 'lt':
              query = query.lt(filter.field, filter.value);
              break;
            case 'gte':
              query = query.gte(filter.field, filter.value);
              break;
            case 'lte':
              query = query.lte(filter.field, filter.value);
              break;
            case 'neq':
              query = query.neq(filter.field, filter.value);
              break;
            case 'in':
              query = query.in(filter.field, filter.value);
              break;
            case 'contains':
              query = query.ilike(filter.field, `%${filter.value}%`);
              break;
          }
        });
      }

      // Limit results for performance
      query = query.limit(1000);

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error executing report query:', error);
      toast.error('Failed to execute report query');
      return [];
    }
  };

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
  const createReport = async (name: string, config: any, description?: string): Promise<CustomReport | null> => {
    try {
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

      const reportData = {
        name,
        description,
        created_by_user_id: user.id,
        company_id: userData.company_id,
        configuration: config
      };

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
    reportMetadata,
    fetchReports,
    deleteReport,
    createReport,
    updateReport,
    executeReportQuery,
  };
};

export default useReports;