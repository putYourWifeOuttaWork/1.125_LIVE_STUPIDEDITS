import { useEffect, useCallback } from 'react';
import { Mic, MicOff, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import { useZones } from '../../hooks/useZones';
import { useVoiceContext } from '../../hooks/useVoiceContext';
import { VoiceWaveform } from './VoiceWaveform';
import { VoiceActionCard } from './VoiceActionCard';
import { VoiceQueryResult } from './VoiceQueryResult';

export function VoiceInputFAB() {
  const {
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
  } = useVoiceSession();

  const voiceContext = useVoiceContext();
  const { zones } = useZones(voiceContext.site_id);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'idle') {
        cancel();
      }
    },
    [state, cancel]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const hasUnresolvedZones = actions.some(
    (a) => a.zone_name && !a.zone_resolved
  );

  const showPanel = state !== 'idle';

  return (
    <div className="fixed bottom-4 left-4 z-[60]">
      {showPanel && (
        <div className="absolute bottom-16 left-0 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up">
          {state === 'listening' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Listening...</span>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-error-500 rounded-full animate-pulse" />
                  <span className="text-xs text-error-600 font-medium">Recording</span>
                </div>
              </div>

              <VoiceWaveform analyser={analyserNode} isActive={true} />

              <div className="min-h-[40px] bg-gray-50 rounded-lg p-2">
                <p className="text-sm text-gray-800">
                  {transcript}
                  {interimText && (
                    <span className="text-gray-400"> {interimText}</span>
                  )}
                  {!transcript && !interimText && (
                    <span className="text-gray-400">Start speaking...</span>
                  )}
                </p>
              </div>

              <button
                onClick={stopListening}
                className="w-full py-2 px-4 bg-error-500 text-white rounded-lg hover:bg-error-600 transition-colors text-sm font-medium"
              >
                Stop Recording
              </button>
            </div>
          )}

          {state === 'processing' && (
            <div className="p-6 flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-primary-500" />
              <p className="text-sm text-gray-600">Understanding your command...</p>
            </div>
          )}

          {state === 'confirming' && (
            <div className="p-4 space-y-3">
              <div className="text-sm font-medium text-gray-700">Confirm Actions</div>

              <div className="bg-gray-50 rounded-lg p-2 mb-2">
                <p className="text-xs text-gray-500 italic">"{transcript}"</p>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {actions.map((action, i) => (
                  <VoiceActionCard
                    key={i}
                    action={action}
                    index={i}
                    zones={zones}
                    onUpdateZone={updateActionZone}
                  />
                ))}
              </div>

              {queryResult && <VoiceQueryResult result={queryResult} />}

              <div className="flex gap-2">
                <button
                  onClick={confirmActions}
                  disabled={hasUnresolvedZones}
                  className="flex-1 py-2 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
                <button
                  onClick={cancel}
                  className="py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>

              {hasUnresolvedZones && (
                <p className="text-xs text-warning-600">
                  Please resolve all zone references before confirming.
                </p>
              )}
            </div>
          )}

          {state === 'executing' && (
            <div className="p-6 flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-primary-500" />
              <p className="text-sm text-gray-600">Saving...</p>
            </div>
          )}

          {state === 'complete' && (
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                <Check size={24} className="text-primary-600" />
              </div>
              <p className="text-sm font-medium text-primary-700">Done!</p>
              {queryResult && <VoiceQueryResult result={queryResult} />}
            </div>
          )}

          {state === 'error' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-error-600">
                <AlertCircle size={18} />
                <span className="text-sm font-medium">Error</span>
              </div>
              <p className="text-sm text-gray-600">{errorMsg}</p>
              <button
                onClick={dismissError}
                className="w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => {
          if (state === 'idle') startListening();
          else if (state === 'listening') stopListening();
          else if (state === 'complete' || state === 'error') cancel();
        }}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${
          state === 'listening'
            ? 'bg-error-500 hover:bg-error-600'
            : state === 'idle'
              ? 'bg-primary-500 hover:bg-primary-600'
              : 'bg-gray-400'
        }`}
        title={state === 'idle' ? 'Voice command' : state === 'listening' ? 'Stop recording' : ''}
      >
        {state === 'idle' && <Mic size={24} className="text-white" />}
        {state === 'listening' && <MicOff size={24} className="text-white" />}
        {(state === 'processing' || state === 'executing') && (
          <Loader2 size={24} className="text-white animate-spin" />
        )}
        {state === 'confirming' && <Mic size={24} className="text-white" />}
        {state === 'complete' && <Check size={24} className="text-white" />}
        {state === 'error' && <X size={24} className="text-white" />}
      </button>
    </div>
  );
}
