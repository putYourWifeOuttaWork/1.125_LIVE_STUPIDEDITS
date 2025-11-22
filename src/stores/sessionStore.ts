import { create } from 'zustand';
import { 
  SubmissionSession, 
  SessionStatus, 
  InitialSubmissionData,
  CreateSessionResponse,
  ActiveSession
} from '../types/session';

interface SessionState {
  // Active sessions that the user has access to
  activeSessions: ActiveSession[];
  // Loading state for sessions
  isLoading: boolean;
  // Error message if any
  error: string | null;
  
  // Current session ID that's being worked on
  currentSessionId: string | null;
  
  // Actions
  setActiveSessions: (sessions: ActiveSession[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  
  // Add a new session to the list (e.g., after creating one)
  addSession: (session: ActiveSession) => void;
  
  // Update a session in the list (e.g., after activity)
  updateSession: (sessionId: string, updates: Partial<ActiveSession>) => void;
  
  // Remove a session from the list (e.g., after completion or cancellation)
  removeSession: (sessionId: string) => void;
  
  // Clear all sessions (e.g., on logout)
  clearSessions: () => void;
  
  // Flag to track if there are unclaimed sessions
  hasUnclaimedSessions: boolean;
  setHasUnclaimedSessions: (value: boolean) => void;
  
  // Controls visibility of the sessions drawer
  isSessionsDrawerOpen: boolean;
  setIsSessionsDrawerOpen: (isOpen: boolean) => void;
  
  // Claim a session
  claimSession: (sessionId: string) => Promise<boolean>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSessions: [],
  isLoading: false,
  error: null,
  currentSessionId: null,
  hasUnclaimedSessions: false,
  isSessionsDrawerOpen: false,
  
  setActiveSessions: (sessions) => set({
    // Device sessions only - no filtering needed (they're already 'in_progress')
    // Device sessions don't have 'Cancelled' or 'Expired' statuses
    activeSessions: sessions,
    // Device sessions are never unclaimed
    hasUnclaimedSessions: false
  }),
  
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  setHasUnclaimedSessions: (value) => set({ hasUnclaimedSessions: value }),
  setIsSessionsDrawerOpen: (isOpen) => set({ isSessionsDrawerOpen: isOpen }),
  
  addSession: (session) => set((state) => ({
    // Only add if not cancelled or expired
    activeSessions: session.session_status !== 'Cancelled' && 
                   !session.session_status.startsWith('Expired')
      ? [session, ...state.activeSessions]
      : state.activeSessions,
    // Update unclaimed sessions flag if needed
    hasUnclaimedSessions: session.is_unclaimed ? true : state.hasUnclaimedSessions
  })),
  
  updateSession: (sessionId, updates) => set((state) => {
    // Get the updated session
    const updatedSession = {
      ...state.activeSessions.find(s => s.session_id === sessionId),
      ...updates
    } as ActiveSession;
    
    // If session is now cancelled or expired, remove it from active sessions
    if (updatedSession.session_status === 'Cancelled' || 
        updatedSession.session_status.startsWith('Expired')) {
      return {
        activeSessions: state.activeSessions.filter(s => s.session_id !== sessionId),
        // Recalculate if there are any unclaimed sessions
        hasUnclaimedSessions: state.activeSessions
          .filter(s => s.session_id !== sessionId)
          .some(s => s.is_unclaimed === true)
      };
    }
    
    // Otherwise update it
    const updatedSessions = state.activeSessions.map((session) => 
      session.session_id === sessionId
        ? updatedSession
        : session
    );
    
    return {
      activeSessions: updatedSessions,
      // Recalculate if there are any unclaimed sessions
      hasUnclaimedSessions: updatedSessions.some(s => s.is_unclaimed === true)
    };
  }),
  
  removeSession: (sessionId) => set((state) => ({
    activeSessions: state.activeSessions.filter(
      (session) => session.session_id !== sessionId
    ),
    // If the current session is removed, clear currentSessionId
    currentSessionId: state.currentSessionId === sessionId
      ? null
      : state.currentSessionId,
    // Recalculate if there are any unclaimed sessions
    hasUnclaimedSessions: state.activeSessions
      .filter(s => s.session_id !== sessionId)
      .some(s => s.is_unclaimed === true)
  })),
  
  clearSessions: () => set({
    activeSessions: [],
    currentSessionId: null,
    error: null,
    hasUnclaimedSessions: false
  }),
  
  claimSession: async (sessionId) => {
    try {
      const { data, error } = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/claim_submission_session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ p_session_id: sessionId })
        }
      ).then(res => res.json());
      
      if (error) {
        console.error('Error claiming session:', error);
        return false;
      }
      
      if (!data.success) {
        console.error('Failed to claim session:', data.message);
        return false;
      }
      
      // Update the session in the store
      const { session } = data;
      const currentSessions = get().activeSessions;
      const sessionIndex = currentSessions.findIndex(s => s.session_id === sessionId);
      
      if (sessionIndex >= 0) {
        const updatedSessions = [...currentSessions];
        updatedSessions[sessionIndex] = {
          ...updatedSessions[sessionIndex],
          opened_by_user_id: session.opened_by_user_id,
          session_status: session.session_status,
          is_unclaimed: false
        };
        
        set({ 
          activeSessions: updatedSessions,
          currentSessionId: sessionId,
          hasUnclaimedSessions: updatedSessions.some(s => s.is_unclaimed === true)
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error in claimSession:', error);
      return false;
    }
  }
}));