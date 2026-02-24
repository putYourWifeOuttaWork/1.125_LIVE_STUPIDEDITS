import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import type { VTTRiskState, SiteRiskSummary, VTTRiskLevel } from '../utils/vttModel';

export function useDeviceRisk(deviceId: string | undefined) {
  const {
    data: riskState,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['device-vtt-risk', deviceId],
    queryFn: async (): Promise<VTTRiskState | null> => {
      if (!deviceId) return null;

      const { data, error } = await supabase
        .from('device_vtt_risk_state')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;
      return data as VTTRiskState | null;
    },
    enabled: !!deviceId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const recalculate = async () => {
    if (!deviceId) return null;
    const { data, error } = await supabase.rpc('fn_calculate_device_vtt_risk', {
      p_device_id: deviceId,
    });
    if (error) throw error;
    refetch();
    return data;
  };

  return {
    riskState,
    isLoading,
    error,
    refetch,
    recalculate,
  };
}

export function useSiteRisk(siteId: string | undefined) {
  const {
    data: siteSummary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['site-vtt-risk', siteId],
    queryFn: async (): Promise<SiteRiskSummary | null> => {
      if (!siteId) return null;

      const { data, error } = await supabase.rpc('fn_get_site_vtt_risk_summary', {
        p_site_id: siteId,
      });

      if (error) throw error;
      return data as SiteRiskSummary | null;
    },
    enabled: !!siteId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  return {
    siteSummary,
    isLoading,
    error,
    refetch,
  };
}

export function useSiteDevicesRisk(siteId: string | undefined) {
  const {
    data: devicesRisk,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['site-devices-vtt-risk', siteId],
    queryFn: async (): Promise<VTTRiskState[]> => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from('device_vtt_risk_state')
        .select('*')
        .eq('site_id', siteId);

      if (error) throw error;
      return (data || []) as VTTRiskState[];
    },
    enabled: !!siteId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const riskByDeviceId = (devicesRisk || []).reduce<Record<string, VTTRiskState>>(
    (acc, risk) => {
      acc[risk.device_id] = risk;
      return acc;
    },
    {}
  );

  const worstRiskLevel: VTTRiskLevel = (devicesRisk || []).reduce<VTTRiskLevel>(
    (worst, risk) => {
      const order: VTTRiskLevel[] = ['low', 'moderate', 'elevated', 'high', 'critical'];
      const currentIdx = order.indexOf(risk.vtt_risk_level);
      const worstIdx = order.indexOf(worst);
      return currentIdx > worstIdx ? risk.vtt_risk_level : worst;
    },
    'low'
  );

  return {
    devicesRisk: devicesRisk || [],
    riskByDeviceId,
    worstRiskLevel,
    isLoading,
    error,
  };
}
