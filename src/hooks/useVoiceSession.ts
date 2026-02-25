import { useState, useRef, useCallback } from 'react';
import { DeepgramClient } from '../services/deepgramClient';
import {
  parseVoiceCommand,
  executeVoiceQuery,
  executeAction,
  logVoiceCommand,
  ParsedAction,
  QueryResult,
} from '../services/voiceService';
import { useVoiceContext } from './useVoiceContext';
import { useAuthStore } from '../stores/authStore';
import { useCompanyFilterStore } from '../stores/companyFilterStore';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'confirming'
  | 'executing'
  | 'complete'
  | 'error';

export function useVoiceSession() {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [actions, setActions] = useState<ParsedAction[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const clientRef = useRef<DeepgramClient | null>(null);
  const finalsRef = useRef<string[]>([]);
  const startTimeRef = useRef<number>(0);
  const parseStartRef = useRef<number>(0);

  const voiceContext = useVoiceContext();
  const { user } = useAuthStore();
  const { selectedCompanyId } = useCompanyFilterStore();

  const startListening = useCallback(async () => {
    try {
      setState('listening');
      setTranscript('');
      setInterimText('');
      setActions([]);
      setQueryResult(null);
      setErrorMsg('');
      finalsRef.current = [];
      startTimeRef.current = Date.now();

      const client = new DeepgramClient(
        (text, isFinal) => {
          if (isFinal) {
            finalsRef.current.push(text);
            const combined = finalsRef.current.join(' ');
            setTranscript(combined);
            setInterimText('');
          } else {
            setInterimText(text);
          }
        },
        (error) => {
          setState('error');
          setErrorMsg(error);
        }
      );

      clientRef.current = client;
      await client.start();
      setAnalyserNode(client.getAnalyser());
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start');
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }
    setAnalyserNode(null);

    const finalTranscript = finalsRef.current.join(' ').trim();
    if (!finalTranscript) {
      setState('idle');
      return;
    }

    setTranscript(finalTranscript);
    setState('processing');
    parseStartRef.current = Date.now();

    try {
      const result = await parseVoiceCommand(finalTranscript, voiceContext);
      const parsedActions = result.actions || [];

      const queryActions = parsedActions.filter((a) => a.action_type === 'QUERY');
      const nonQueryActions = parsedActions.filter((a) => a.action_type !== 'QUERY');

      if (queryActions.length > 0) {
        const qa = queryActions[0];
        const qr = await executeVoiceQuery(
          qa.data.query_type as string,
          qa.data as Record<string, unknown>,
          voiceContext
        );
        setQueryResult(qr);

        if (nonQueryActions.length === 0) {
          setState('complete');
          setTimeout(() => {
            setState('idle');
            setQueryResult(null);
          }, 5000);
          return;
        }
      }

      if (nonQueryActions.length > 0) {
        setActions(nonQueryActions);
        setState('confirming');
      } else if (queryActions.length === 0) {
        setState('error');
        setErrorMsg('Could not understand the command. Please try again.');
      }
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process');
    }
  }, [voiceContext]);

  const confirmActions = useCallback(async () => {
    setState('executing');
    const transcriptionMs = parseStartRef.current - startTimeRef.current;
    const parsingMs = Date.now() - parseStartRef.current;

    try {
      for (const action of actions) {
        const { record_id, table } = await executeAction(action);

        if (user && selectedCompanyId) {
          await logVoiceCommand({
            company_id: selectedCompanyId,
            user_id: user.id,
            site_id: voiceContext.site_id,
            page_context: voiceContext.page_context,
            raw_transcript: transcript,
            parsed_action: action.action_type,
            parsed_data: action.data,
            confidence_score: action.confidence,
            zone_resolved: action.zone_resolved ?? false,
            zone_id: action.zone_id,
            confirmed: true,
            final_data: action.data,
            result_record_id: record_id,
            result_table: table,
            transcription_ms: transcriptionMs,
            parsing_ms: parsingMs,
            total_ms: Date.now() - startTimeRef.current,
          });
        }
      }

      setState('complete');
      setTimeout(() => setState('idle'), 3000);
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to execute');
    }
  }, [actions, transcript, user, selectedCompanyId, voiceContext]);

  const cancel = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }
    setAnalyserNode(null);
    setState('idle');
    setTranscript('');
    setInterimText('');
    setActions([]);
    setQueryResult(null);
    setErrorMsg('');
  }, []);

  const updateActionZone = useCallback(
    (index: number, zoneId: string) => {
      setActions((prev) =>
        prev.map((a, i) =>
          i === index ? { ...a, zone_id: zoneId, zone_resolved: true } : a
        )
      );
    },
    []
  );

  const dismissError = useCallback(() => {
    setState('idle');
    setErrorMsg('');
  }, []);

  return {
    state,
    transcript,
    interimText,
    actions,
    queryResult,
    errorMsg,
    analyserNode,
    startListening,
    stopListening,
    confirmActions,
    cancel,
    updateActionZone,
    dismissError,
  };
}
