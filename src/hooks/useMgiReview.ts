import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export interface MgiReviewItem {
  review_id: string;
  image_id: string;
  device_id: string;
  company_id: string | null;
  program_id: string | null;
  site_id: string | null;
  session_id: string | null;
  original_score: number;
  adjusted_score: number | null;
  qa_method: string;
  qa_details: Record<string, unknown> | null;
  neighbor_image_ids: string[] | null;
  thresholds_used: Record<string, unknown> | null;
  status: 'pending' | 'confirmed' | 'overridden' | 'dismissed' | 'auto_resolved';
  priority: 'normal' | 'high' | 'critical';
  admin_score: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  alerts_released: boolean;
  notifications_sent_to: Record<string, unknown>[] | null;
  created_at: string;
  device_code?: string;
  site_name?: string;
  company_name?: string;
  image_url?: string;
  captured_at?: string;
}

export interface MgiQaThreshold {
  threshold_config_id: string;
  company_id: string;
  site_id: string | null;
  is_active: boolean;
  level1_score_floor: number;
  level1_row_delta_min: number;
  level1_absolute_shift: number;
  level2_context_window: number;
  level2_median_offset: number;
  level2_modified_z_threshold: number;
  level2_max_growth_rate_per_hour: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewerAssignment {
  assignment_id: string;
  company_id: string;
  site_id: string | null;
  user_id: string;
  is_active: boolean;
  channels: { email?: boolean; sms?: boolean; in_app?: boolean; webhook?: boolean };
  notification_email: string | null;
  notification_phone: string | null;
  webhook_url: string | null;
  webhook_headers: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
}

export interface ReviewFilters {
  status: string;
  companyId?: string;
  siteId?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useMgiReviewQueue(filters: ReviewFilters) {
  return useQuery({
    queryKey: ['mgiReviewQueue', filters],
    queryFn: async () => {
      let query = supabase
        .from('mgi_review_queue')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.companyId) {
        query = query.eq('company_id', filters.companyId);
      }
      if (filters.siteId) {
        query = query.eq('site_id', filters.siteId);
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      const reviews = data || [];
      const deviceIds = [...new Set(reviews.map(r => r.device_id))];
      const siteIds = [...new Set(reviews.filter(r => r.site_id).map(r => r.site_id!))];
      const companyIds = [...new Set(reviews.filter(r => r.company_id).map(r => r.company_id!))];
      const imageIds = reviews.map(r => r.image_id);

      const [deviceRes, siteRes, companyRes, imageRes] = await Promise.all([
        deviceIds.length > 0
          ? supabase.from('devices').select('id, device_code').in('id', deviceIds)
          : { data: [] },
        siteIds.length > 0
          ? supabase.from('sites').select('id, name').in('id', siteIds)
          : { data: [] },
        companyIds.length > 0
          ? supabase.from('companies').select('company_id, name').in('company_id', companyIds)
          : { data: [] },
        imageIds.length > 0
          ? supabase.from('device_images').select('image_id, image_url, captured_at').in('image_id', imageIds)
          : { data: [] },
      ]);

      const deviceMap = new Map((deviceRes.data || []).map(d => [d.id, d.device_code]));
      const siteMap = new Map((siteRes.data || []).map(s => [s.id, s.name]));
      const companyMap = new Map((companyRes.data || []).map(c => [c.company_id, c.name]));
      const imageMap = new Map((imageRes.data || []).map(i => [i.image_id, { url: i.image_url, captured_at: i.captured_at }]));

      return reviews.map(r => ({
        ...r,
        device_code: deviceMap.get(r.device_id) || r.device_id.slice(0, 8),
        site_name: r.site_id ? siteMap.get(r.site_id) || null : null,
        company_name: r.company_id ? companyMap.get(r.company_id) || null : null,
        image_url: imageMap.get(r.image_id)?.url || null,
        captured_at: imageMap.get(r.image_id)?.captured_at || null,
      })) as MgiReviewItem[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMgiReviewPendingCount() {
  return useQuery({
    queryKey: ['mgiReviewPendingCount'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('mgi_review_queue')
        .select('review_id', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useNeighborImages(imageIds: string[] | null) {
  return useQuery({
    queryKey: ['neighborImages', imageIds],
    queryFn: async () => {
      if (!imageIds || imageIds.length === 0) return [];
      const { data, error } = await supabase
        .from('device_images')
        .select('image_id, image_url, mgi_score, captured_at, mgi_qa_status')
        .in('image_id', imageIds)
        .order('captured_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!imageIds && imageIds.length > 0,
  });
}

export function useDeviceScoreTimeline(deviceId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['deviceScoreTimeline', deviceId, limit],
    queryFn: async () => {
      if (!deviceId) return [];
      const { data, error } = await supabase
        .from('device_images')
        .select('image_id, mgi_score, mgi_original_score, mgi_qa_status, captured_at')
        .eq('device_id', deviceId)
        .not('mgi_score', 'is', null)
        .order('captured_at', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    enabled: !!deviceId,
  });
}

export function useSubmitReview() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      reviewId: string;
      decision: 'confirm_adjusted' | 'override_with_value' | 'confirm_original' | 'dismiss';
      adminScore?: number;
      notes?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('fn_complete_mgi_review', {
        p_review_id: params.reviewId,
        p_admin_user_id: user.id,
        p_decision: params.decision,
        p_admin_score: params.adminScore ?? null,
        p_notes: params.notes ?? null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgiReviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['mgiReviewPendingCount'] });
    },
  });
}

export function useMgiQaThresholds(companyId: string | undefined) {
  return useQuery({
    queryKey: ['mgiQaThresholds', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mgi_qa_thresholds')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('site_id', { ascending: true, nullsFirst: true });

      if (error) throw error;
      return (data || []) as MgiQaThreshold[];
    },
    enabled: !!companyId,
  });
}

export function useSaveThreshold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threshold: Partial<MgiQaThreshold> & { company_id: string }) => {
      if (threshold.threshold_config_id) {
        const { error } = await supabase
          .from('mgi_qa_thresholds')
          .update({
            level1_score_floor: threshold.level1_score_floor,
            level1_row_delta_min: threshold.level1_row_delta_min,
            level1_absolute_shift: threshold.level1_absolute_shift,
            level2_context_window: threshold.level2_context_window,
            level2_median_offset: threshold.level2_median_offset,
            level2_modified_z_threshold: threshold.level2_modified_z_threshold,
            level2_max_growth_rate_per_hour: threshold.level2_max_growth_rate_per_hour,
            updated_at: new Date().toISOString(),
          })
          .eq('threshold_config_id', threshold.threshold_config_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('mgi_qa_thresholds')
          .insert({
            company_id: threshold.company_id,
            site_id: threshold.site_id ?? null,
            is_active: true,
            level1_score_floor: threshold.level1_score_floor ?? 0.25,
            level1_row_delta_min: threshold.level1_row_delta_min ?? 0.15,
            level1_absolute_shift: threshold.level1_absolute_shift ?? 0.25,
            level2_context_window: threshold.level2_context_window ?? 5,
            level2_median_offset: threshold.level2_median_offset ?? 0.25,
            level2_modified_z_threshold: threshold.level2_modified_z_threshold ?? 3.5,
            level2_max_growth_rate_per_hour: threshold.level2_max_growth_rate_per_hour ?? 0.01,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mgiQaThresholds', variables.company_id] });
    },
  });
}

export function useReviewerAssignments(companyId: string | undefined) {
  return useQuery({
    queryKey: ['reviewerAssignments', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('mgi_qa_reviewer_assignments')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (error) throw error;

      const userIds = [...new Set((data || []).map(a => a.user_id))];
      let userMap = new Map<string, { email: string; name: string }>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);
        userMap = new Map((users || []).map(u => [u.id, { email: u.email, name: u.full_name ?? '' }]));
      }

      return (data || []).map(a => ({
        ...a,
        user_email: userMap.get(a.user_id)?.email || '',
        user_name: userMap.get(a.user_id)?.name || '',
      })) as ReviewerAssignment[];
    },
    enabled: !!companyId,
  });
}

export function useSaveReviewerAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignment: Partial<ReviewerAssignment> & { company_id: string; user_id: string }) => {
      if (assignment.assignment_id) {
        const { error } = await supabase
          .from('mgi_qa_reviewer_assignments')
          .update({
            channels: assignment.channels,
            notification_email: assignment.notification_email,
            notification_phone: assignment.notification_phone,
            webhook_url: assignment.webhook_url,
            webhook_headers: assignment.webhook_headers,
            updated_at: new Date().toISOString(),
          })
          .eq('assignment_id', assignment.assignment_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('mgi_qa_reviewer_assignments')
          .insert({
            company_id: assignment.company_id,
            site_id: assignment.site_id ?? null,
            user_id: assignment.user_id,
            is_active: true,
            channels: assignment.channels ?? { email: true, in_app: true, sms: false, webhook: false },
            notification_email: assignment.notification_email ?? null,
            notification_phone: assignment.notification_phone ?? null,
            webhook_url: assignment.webhook_url ?? null,
            webhook_headers: assignment.webhook_headers ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reviewerAssignments', variables.company_id] });
    },
  });
}

export function useRemoveReviewerAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { assignmentId: string; companyId: string }) => {
      const { error } = await supabase
        .from('mgi_qa_reviewer_assignments')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('assignment_id', params.assignmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reviewerAssignments', variables.companyId] });
    },
  });
}

export function useAllSitesForReview() {
  return useQuery({
    queryKey: ['allSitesForReview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id:site_id, name, company_id')
        .order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; company_id: string }[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSuperAdminUsers() {
  return useQuery({
    queryKey: ['superAdminUsers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('is_super_admin', true)
        .eq('is_active', true);

      if (error) throw error;
      return (data || []).map(u => ({ id: u.id, email: u.email, name: u.full_name }));
    },
  });
}

export interface ScanFlaggedItem {
  image_id: string;
  device_id: string;
  device_code: string;
  score: number;
  captured_at: string;
  median: number | null;
  modified_z_score: number;
  growth_rate_per_hour: number;
  flag_reasons: string[];
  priority: 'normal' | 'high' | 'critical';
  method: string;
}

export interface RetrospectiveScanResult {
  total_scanned: number;
  total_flagged: number;
  skipped_already_reviewed: number;
  flagged_items: ScanFlaggedItem[];
  dry_run: boolean;
  ran_at: string;
}

export interface RetrospectiveScanParams {
  companyId?: string;
  siteId?: string;
  deviceId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  dryRun: boolean;
}

export function useRetrospectiveScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RetrospectiveScanParams) => {
      const { data, error } = await supabase.rpc('fn_retrospective_mgi_scan', {
        p_company_id: params.companyId || null,
        p_site_id: params.siteId || null,
        p_device_id: params.deviceId || null,
        p_date_from: params.dateFrom || null,
        p_date_to: params.dateTo || null,
        p_limit: params.limit ?? 500,
        p_dry_run: params.dryRun,
      });

      if (error) throw error;
      return data as RetrospectiveScanResult;
    },
    onSuccess: (_data, variables) => {
      if (!variables.dryRun) {
        queryClient.invalidateQueries({ queryKey: ['mgiReviewQueue'] });
        queryClient.invalidateQueries({ queryKey: ['mgiReviewPendingCount'] });
      }
    },
  });
}
