import { useLocation, useParams } from 'react-router-dom';
import { usePilotProgramStore } from '../stores/pilotProgramStore';
import type { VoiceContext } from '../services/voiceService';

export function useVoiceContext(): VoiceContext {
  const location = useLocation();
  const params = useParams();
  const { selectedSite } = usePilotProgramStore();

  return {
    site_id: params.siteId || selectedSite?.site_id,
    device_id: params.deviceId,
    program_id: params.programId,
    page_context: location.pathname,
  };
}
