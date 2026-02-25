import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Check, X, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabaseClient';

const ACTION_COLORS: Record<string, string> = {
  LOG_BATCH: 'bg-primary-100 text-primary-700',
  LOG_LOSS: 'bg-error-100 text-error-700',
  LOG_TREATMENT: 'bg-secondary-100 text-secondary-700',
  ACKNOWLEDGE_ALERT: 'bg-warning-100 text-warning-700',
  CREATE_ZONE: 'bg-accent-100 text-accent-700',
  QUERY: 'bg-gray-100 text-gray-600',
};

interface VoiceLog {
  id: string;
  raw_transcript: string;
  parsed_action: string;
  confidence_score: number | null;
  zone_resolved: boolean;
  confirmed: boolean;
  transcription_ms: number | null;
  parsing_ms: number | null;
  total_ms: number | null;
  created_at: string;
  page_context: string | null;
}

const VoiceActivityPage = () => {
  const navigate = useNavigate();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['voice-activity-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_logs')
        .select('id, raw_transcript, parsed_action, confidence_score, zone_resolved, confirmed, transcription_ms, parsing_ms, total_ms, created_at, page_context')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as VoiceLog[];
    },
    staleTime: 30 * 1000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/value')} className="p-1 hover:bg-gray-100 rounded">
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <Mic size={20} className="text-primary-600" />
          <h1 className="text-xl font-bold text-gray-900">Voice Activity</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="text-center py-16">
          <Mic size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No voice commands yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Use the mic button to start logging with your voice.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const actionColor = ACTION_COLORS[log.parsed_action] || ACTION_COLORS.QUERY;

            return (
              <div
                key={log.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 mb-1.5">
                      "{log.raw_transcript}"
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${actionColor}`}>
                        {log.parsed_action?.replace(/_/g, ' ') || 'Unknown'}
                      </span>
                      {log.confidence_score !== null && (
                        <span className="text-xs text-gray-400">
                          {Math.round(log.confidence_score * 100)}%
                        </span>
                      )}
                      {log.zone_resolved ? (
                        <span className="text-xs text-primary-600 flex items-center gap-0.5">
                          <Check size={10} /> Zone matched
                        </span>
                      ) : log.parsed_action !== 'QUERY' ? (
                        <span className="text-xs text-warning-600 flex items-center gap-0.5">
                          <X size={10} /> Zone unresolved
                        </span>
                      ) : null}
                      {log.confirmed ? (
                        <span className="text-xs text-primary-600 flex items-center gap-0.5">
                          <Check size={10} /> Confirmed
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Not confirmed</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </p>
                    {log.total_ms && (
                      <p className="text-xs text-gray-400 flex items-center gap-0.5 justify-end mt-0.5">
                        <Clock size={10} /> {(log.total_ms / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VoiceActivityPage;
