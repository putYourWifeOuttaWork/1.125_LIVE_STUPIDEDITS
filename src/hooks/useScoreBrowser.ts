import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export interface ScoredImage {
  image_id: string;
  device_id: string;
  image_url: string | null;
  mgi_score: number;
  mgi_velocity: number | null;
  mgi_original_score: number | null;
  mgi_qa_status: string | null;
  mgi_qa_method: string | null;
  captured_at: string;
  temperature: number | null;
  humidity: number | null;
  company_id: string | null;
  site_id: string | null;
  program_id: string | null;
  device_code: string;
  site_name: string | null;
  program_name: string | null;
}

export interface ScoreBrowserFilters {
  dateFrom: string;
  dateTo: string;
  companyId?: string;
  programId?: string;
  siteId?: string;
  deviceId?: string;
  sortBy: 'score_desc' | 'score_asc' | 'newest' | 'oldest' | 'velocity_desc';
  minScore?: number;
  maxScore?: number;
  qaStatus?: string;
  page: number;
  pageSize: number;
}

export interface ScoreDistribution {
  total: number;
  healthy: number;
  warning: number;
  concerning: number;
  critical: number;
  avgScore: number;
  pendingReview: number;
  overridden: number;
}

export function useScoredImages(filters: ScoreBrowserFilters) {
  return useQuery({
    queryKey: ['scoredImages', filters],
    queryFn: async () => {
      let query = supabase
        .from('device_images')
        .select(
          'image_id, device_id, image_url, mgi_score, mgi_velocity, mgi_original_score, mgi_qa_status, mgi_qa_method, captured_at, temperature, humidity, company_id, site_id, program_id',
          { count: 'exact' }
        )
        .not('mgi_score', 'is', null)
        .gte('captured_at', filters.dateFrom + 'T00:00:00')
        .lte('captured_at', filters.dateTo + 'T23:59:59');

      if (filters.companyId) {
        query = query.eq('company_id', filters.companyId);
      }
      if (filters.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters.siteId) {
        query = query.eq('site_id', filters.siteId);
      }
      if (filters.deviceId) {
        query = query.eq('device_id', filters.deviceId);
      }
      if (filters.minScore !== undefined) {
        query = query.gte('mgi_score', filters.minScore);
      }
      if (filters.maxScore !== undefined) {
        query = query.lte('mgi_score', filters.maxScore);
      }
      if (filters.qaStatus && filters.qaStatus !== 'all') {
        query = query.eq('mgi_qa_status', filters.qaStatus);
      }

      switch (filters.sortBy) {
        case 'score_desc':
          query = query.order('mgi_score', { ascending: false });
          break;
        case 'score_asc':
          query = query.order('mgi_score', { ascending: true });
          break;
        case 'newest':
          query = query.order('captured_at', { ascending: false });
          break;
        case 'oldest':
          query = query.order('captured_at', { ascending: true });
          break;
        case 'velocity_desc':
          query = query.order('mgi_velocity', { ascending: false, nullsFirst: false });
          break;
      }

      const from = filters.page * filters.pageSize;
      const to = from + filters.pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      const images = data || [];
      const deviceIds = [...new Set(images.map(i => i.device_id))];
      const siteIds = [...new Set(images.filter(i => i.site_id).map(i => i.site_id!))];
      const programIds = [...new Set(images.filter(i => i.program_id).map(i => i.program_id!))];

      const [deviceRes, siteRes, programRes] = await Promise.all([
        deviceIds.length > 0
          ? supabase.from('devices').select('id, device_code').in('id', deviceIds)
          : { data: [] },
        siteIds.length > 0
          ? supabase.from('sites').select('id, name').in('id', siteIds)
          : { data: [] },
        programIds.length > 0
          ? supabase.from('pilot_programs').select('program_id, name').in('program_id', programIds)
          : { data: [] },
      ]);

      const deviceMap = new Map((deviceRes.data || []).map(d => [d.id, d.device_code]));
      const siteMap = new Map((siteRes.data || []).map(s => [s.id, s.name]));
      const programMap = new Map((programRes.data || []).map(p => [p.program_id, p.name]));

      const enriched: ScoredImage[] = images.map(img => ({
        ...img,
        device_code: deviceMap.get(img.device_id) || img.device_id.slice(0, 8),
        site_name: img.site_id ? siteMap.get(img.site_id) || null : null,
        program_name: img.program_id ? programMap.get(img.program_id) || null : null,
      }));

      return { images: enriched, totalCount: count || 0 };
    },
    staleTime: 30_000,
  });
}

export function useScoreDistribution(filters: Pick<ScoreBrowserFilters, 'dateFrom' | 'dateTo' | 'companyId' | 'programId' | 'siteId' | 'deviceId'>) {
  return useQuery({
    queryKey: ['scoreDistribution', filters],
    queryFn: async () => {
      let query = supabase
        .from('device_images')
        .select('mgi_score, mgi_qa_status')
        .not('mgi_score', 'is', null)
        .gte('captured_at', filters.dateFrom + 'T00:00:00')
        .lte('captured_at', filters.dateTo + 'T23:59:59');

      if (filters.companyId) query = query.eq('company_id', filters.companyId);
      if (filters.programId) query = query.eq('program_id', filters.programId);
      if (filters.siteId) query = query.eq('site_id', filters.siteId);
      if (filters.deviceId) query = query.eq('device_id', filters.deviceId);

      const { data, error } = await query.limit(5000);
      if (error) throw error;

      const rows = data || [];
      let healthy = 0, warning = 0, concerning = 0, critical = 0;
      let pendingReview = 0, overridden = 0;
      let scoreSum = 0;

      for (const row of rows) {
        const s = Number(row.mgi_score);
        scoreSum += s;
        if (s <= 0.10) healthy++;
        else if (s <= 0.25) warning++;
        else if (s <= 0.40) concerning++;
        else critical++;

        if (row.mgi_qa_status === 'pending_review') pendingReview++;
        if (row.mgi_qa_status === 'admin_overridden') overridden++;
      }

      return {
        total: rows.length,
        healthy,
        warning,
        concerning,
        critical,
        avgScore: rows.length > 0 ? scoreSum / rows.length : 0,
        pendingReview,
        overridden,
      } as ScoreDistribution;
    },
    staleTime: 60_000,
  });
}

export function useContextImages(deviceId: string | undefined, capturedAt: string | undefined, excludeImageId?: string) {
  return useQuery({
    queryKey: ['scoreBrowserContext', deviceId, capturedAt],
    queryFn: async () => {
      if (!deviceId || !capturedAt) return [];

      const { data, error } = await supabase
        .from('device_images')
        .select('image_id, image_url, mgi_score, mgi_qa_status, captured_at')
        .eq('device_id', deviceId)
        .not('mgi_score', 'is', null)
        .order('captured_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      return (data || []).filter(img => img.image_id !== excludeImageId);
    },
    enabled: !!deviceId && !!capturedAt,
  });
}

export function useProgramsForBrowser(companyId?: string) {
  return useQuery({
    queryKey: ['programsForBrowser', companyId],
    queryFn: async () => {
      let query = supabase
        .from('pilot_programs')
        .select('program_id, name, company_id')
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as { program_id: string; name: string; company_id: string }[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useDevicesForBrowser(siteId?: string) {
  return useQuery({
    queryKey: ['devicesForBrowser', siteId],
    queryFn: async () => {
      if (!siteId) {
        const { data, error } = await supabase
          .from('devices')
          .select('device_id, device_code')
          .order('device_code');
        if (error) throw error;
        return (data || []) as { device_id: string; device_code: string }[];
      }

      const { data: sdData, error: sdError } = await supabase
        .from('device_site_assignments')
        .select('device_id')
        .eq('site_id', siteId)
        .eq('is_active', true);
      if (sdError) throw sdError;

      const deviceIds = (sdData || []).map(sd => sd.device_id);
      if (deviceIds.length === 0) return [];

      const { data, error } = await supabase
        .from('devices')
        .select('device_id, device_code')
        .in('device_id', deviceIds)
        .order('device_code');
      if (error) throw error;
      return (data || []) as { device_id: string; device_code: string }[];
    },
    staleTime: 5 * 60_000,
  });
}

export type BulkScoreAction = 'set_qa_status' | 'override_score';

export interface BulkScoreActionResult {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  errors: { image_id: string; error: string }[];
  error?: string;
}

export function useBulkScoreBrowserAction() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      imageIds: string[];
      action: BulkScoreAction;
      newQaStatus?: string;
      newScore?: number;
      notes?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('fn_bulk_score_browser_action', {
        p_image_ids: params.imageIds,
        p_action: params.action,
        p_new_qa_status: params.newQaStatus ?? null,
        p_new_score: params.newScore ?? null,
        p_admin_user_id: user.id,
        p_notes: params.notes ?? null,
      });

      if (error) throw error;
      const result = data as BulkScoreActionResult;
      if (!result.success && result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoredImages'] });
      queryClient.invalidateQueries({ queryKey: ['scoreDistribution'] });
      queryClient.invalidateQueries({ queryKey: ['mgiReviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['mgiReviewPendingCount'] });
      queryClient.invalidateQueries({ queryKey: ['deviceScoreTimeline'] });
    },
  });
}

export function useBulkExportLog() {
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (params: { imageIds: string[]; exportFormat?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('fn_log_bulk_export', {
        p_image_ids: params.imageIds,
        p_admin_user_id: user.id,
        p_export_format: params.exportFormat ?? 'csv',
      });

      if (error) throw error;
      return data as { success: boolean; images_logged: number };
    },
  });
}

export function useQuickFlag() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { imageId: string; notes?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('fn_quick_flag_for_review', {
        p_image_id: params.imageId,
        p_admin_user_id: user.id,
        p_notes: params.notes ?? null,
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string; review_id?: string };
      if (!result.success) throw new Error(result.error || 'Flag failed');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoredImages'] });
      queryClient.invalidateQueries({ queryKey: ['scoreDistribution'] });
      queryClient.invalidateQueries({ queryKey: ['mgiReviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['mgiReviewPendingCount'] });
    },
  });
}

export function useDirectOverride() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { imageId: string; newScore: number; notes?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('fn_direct_score_override', {
        p_image_id: params.imageId,
        p_admin_user_id: user.id,
        p_new_score: params.newScore,
        p_notes: params.notes ?? null,
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || 'Override failed');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoredImages'] });
      queryClient.invalidateQueries({ queryKey: ['scoreDistribution'] });
      queryClient.invalidateQueries({ queryKey: ['mgiReviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['deviceScoreTimeline'] });
    },
  });
}
