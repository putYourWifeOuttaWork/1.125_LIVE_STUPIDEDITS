import { supabase } from '../lib/supabaseClient';

export interface ParsedAction {
  action_type: 'LOG_BATCH' | 'LOG_LOSS' | 'LOG_TREATMENT' | 'ACKNOWLEDGE_ALERT' | 'CREATE_ZONE' | 'QUERY';
  confidence: number;
  zone_name: string | null;
  zone_id?: string;
  zone_resolved?: boolean;
  data: Record<string, unknown>;
}

export interface ParseResult {
  actions: ParsedAction[];
}

export interface QueryResult {
  query_type: string;
  result: Record<string, unknown>;
  summary: string;
}

export interface VoiceContext {
  site_id?: string;
  device_id?: string;
  program_id?: string;
  page_context: string;
}

async function getAuthHeaders() {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function parseVoiceCommand(
  transcript: string,
  context: VoiceContext
): Promise<ParseResult> {
  const headers = await getAuthHeaders();
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-parse`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transcript, context }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Parse failed' }));
    throw new Error(err.error || 'Failed to parse voice command');
  }

  return res.json();
}

export async function executeVoiceQuery(
  queryType: string,
  parameters: Record<string, unknown>,
  context: VoiceContext
): Promise<QueryResult> {
  const headers = await getAuthHeaders();
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-query`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query_type: queryType, parameters, context }),
  });

  if (!res.ok) {
    throw new Error('Failed to execute voice query');
  }

  return res.json();
}

export async function executeAction(action: ParsedAction): Promise<{ record_id: string; table: string }> {
  switch (action.action_type) {
    case 'LOG_BATCH': {
      const { data, error } = await supabase
        .from('batches')
        .insert({
          company_id: (await supabase.rpc('get_active_company_id')).data,
          zone_id: action.zone_id || null,
          crop_name: action.data.crop_name as string || '',
          variety: action.data.variety as string || '',
          crop_type: action.data.crop_type as string || 'other',
          plant_count: action.data.plant_count as number || 0,
          planted_date: new Date().toISOString().split('T')[0],
          status: 'active',
          created_via: 'voice',
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return { record_id: data.id, table: 'batches' };
    }
    case 'LOG_LOSS': {
      const { data, error } = await supabase
        .from('loss_events')
        .insert({
          company_id: (await supabase.rpc('get_active_company_id')).data,
          zone_id: action.zone_id || null,
          event_date: new Date().toISOString().split('T')[0],
          loss_type: action.data.loss_type as string || 'other',
          severity: action.data.severity as string || 'moderate',
          description: action.data.description as string || '',
          estimated_units_lost: action.data.estimated_units_lost as number || 0,
          estimated_value_lost: action.data.estimated_value_lost as number || 0,
          created_via: 'voice',
          reported_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return { record_id: data.id, table: 'loss_events' };
    }
    case 'LOG_TREATMENT': {
      const { data, error } = await supabase
        .from('fungicide_applications')
        .insert({
          company_id: (await supabase.rpc('get_active_company_id')).data,
          zone_id: action.zone_id || null,
          product_name: action.data.product_name as string || '',
          method: action.data.method as string || '',
          applied_at: new Date().toISOString(),
          applied_by: (await supabase.auth.getUser()).data.user?.id,
          created_via: 'voice',
        })
        .select('id')
        .single();
      if (error) throw error;
      return { record_id: data.id, table: 'fungicide_applications' };
    }
    case 'CREATE_ZONE': {
      const { data, error } = await supabase
        .from('zones')
        .insert({
          company_id: (await supabase.rpc('get_active_company_id')).data,
          site_id: action.data.site_id as string,
          name: action.data.zone_name as string || 'New Zone',
          zone_type: action.data.zone_type as string || 'other',
          aliases: [((action.data.zone_name as string) || '').toLowerCase()],
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select('zone_id')
        .single();
      if (error) throw error;
      return { record_id: data.zone_id, table: 'zones' };
    }
    default:
      throw new Error(`Unsupported action type: ${action.action_type}`);
  }
}

export async function logVoiceCommand(params: {
  company_id: string;
  user_id: string;
  site_id?: string;
  page_context: string;
  raw_transcript: string;
  parsed_action: string;
  parsed_data: Record<string, unknown>;
  confidence_score: number;
  zone_resolved: boolean;
  zone_id?: string;
  confirmed: boolean;
  final_data?: Record<string, unknown>;
  result_record_id?: string;
  result_table?: string;
  transcription_ms?: number;
  parsing_ms?: number;
  total_ms?: number;
}): Promise<void> {
  await supabase.from('voice_logs').insert(params);
}
