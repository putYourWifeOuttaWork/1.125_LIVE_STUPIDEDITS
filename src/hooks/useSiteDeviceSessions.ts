import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { withRetry } from '../utils/helpers';

export interface DeviceWakePayload {
  payload_id: string;
  site_device_session_id: string;
  device_id: string;
  device_code?: string;
  device_name?: string;
  captured_at: string;
  wake_window_index: number;
  image_id?: string;
  image_url?: string;
  resent_received_at?: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  gas_resistance?: number;
  battery_voltage?: number;
  wifi_rssi?: number;
  telemetry_data?: any;
  payload_status: 'pending' | 'complete' | 'failed';
  overage_flag: boolean;
  created_at: string;
}

export interface SiteDeviceSession {
  session_id: string;
  company_id: string;
  program_id: string;
  program_name?: string;
  site_id: string;
  site_name?: string;
  session_date: string;
  session_start_time: string;
  session_end_time: string;
  expected_wake_count: number;
  completed_wake_count: number;
  failed_wake_count: number;
  extra_wake_count: number;
  status: 'pending' | 'in_progress' | 'locked';
  config_changed_flag: boolean;
  created_at: string;
  locked_at?: string;
  wake_payloads?: DeviceWakePayload[];
}

export function useSiteDeviceSessions(siteId?: string) {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['siteDeviceSessions', siteId],
    queryFn: async () => {
      if (!siteId) return [];

      console.log(`Fetching device sessions for site ${siteId}`);

      try {
        const { data, error } = await withRetry(() =>
          supabase
            .from('site_device_sessions')
            .select(`
              *,
              sites!inner (
                name
              ),
              pilot_programs!inner (
                name
              )
            `)
            .eq('site_id', siteId)
            .order('session_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(10)
        );

        if (error) {
          console.error('Error fetching device sessions:', error);
          throw error;
        }

        console.log(`Successfully fetched ${data?.length || 0} device sessions`);

        // For each session, calculate actual counts from device_wake_payloads
        const sessionsWithActualCounts = await Promise.all(
          (data || []).map(async (session: any) => {
            const { data: payloads } = await supabase
              .from('device_wake_payloads')
              .select('payload_status, overage_flag')
              .eq('site_device_session_id', session.session_id);

            const completed_wake_count = payloads?.filter(
              (p) => p.payload_status === 'complete' && !p.overage_flag
            ).length || 0;
            const failed_wake_count = payloads?.filter(
              (p) => p.payload_status === 'failed'
            ).length || 0;
            const extra_wake_count = payloads?.filter(
              (p) => p.overage_flag === true
            ).length || 0;

            return {
              ...session,
              site_name: session.sites?.name || 'Unknown Site',
              program_name: session.pilot_programs?.name || 'Unknown Program',
              completed_wake_count,
              failed_wake_count,
              extra_wake_count,
            };
          })
        );

        return sessionsWithActualCounts as SiteDeviceSession[];
      } catch (err) {
        console.error('Error in device sessions query:', err);
        throw err;
      }
    },
    enabled: !!siteId,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const fetchWakePayloads = async (sessionId: string): Promise<DeviceWakePayload[]> => {
    console.log(`Fetching wake payloads for session ${sessionId}`);

    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('device_wake_payloads')
          .select(`
            *,
            devices!inner (
              device_code,
              device_name
            ),
            device_images (
              image_url
            )
          `)
          .eq('site_device_session_id', sessionId)
          .order('wake_window_index', { ascending: true })
      );

      if (error) {
        console.error('Error fetching wake payloads:', error);
        throw error;
      }

      return (data || []).map((payload: any) => ({
        ...payload,
        device_code: payload.devices?.device_code,
        device_name: payload.devices?.device_name,
        image_url: payload.device_images?.image_url,
      })) as DeviceWakePayload[];
    } catch (err) {
      console.error('Error fetching wake payloads:', err);
      throw err;
    }
  };

  const refetchSessions = async () => {
    if (!siteId) return;
    console.log('Forcing device sessions refetch');
    await queryClient.invalidateQueries({ queryKey: ['siteDeviceSessions', siteId] });
    await queryClient.refetchQueries({ queryKey: ['siteDeviceSessions', siteId] });
  };

  return {
    sessions: sessionsQuery.data || [],
    isLoading: sessionsQuery.isLoading,
    error: sessionsQuery.error,
    refetchSessions,
    fetchWakePayloads,
  };
}
