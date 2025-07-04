import { useState, useEffect, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { SubmissionSession } from '../types/session';
import sessionManager from '../lib/sessionManager';
import offlineStorage from '../utils/offlineStorage';
import { toast } from 'react-toastify';

interface UseOfflineSessionOptions {
  sessionId?: string;
  submissionId?: string;
  autoSync?: boolean;
  autoSaveInterval?: number;
}

export function useOfflineSession({
  sessionId,
  submissionId,
  autoSync = true,
  autoSaveInterval = 60000, // 1 minute
}: UseOfflineSessionOptions) {
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState<SubmissionSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // Load session data from server or local storage
  const loadSession = useCallback(async () => {
    if (!sessionId && !submissionId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try to get the session from the server if online
      if (isOnline) {
        // Try to get by session ID if available
        if (sessionId) {
          const sessionData = await sessionManager.getSessionById(sessionId);
          if (sessionData) {
            setSession(sessionData);
            // Store locally as well for offline access
            await offlineStorage.saveSession(sessionData);
            setLastSyncTime(new Date());
            return;
          }
        }
        
        // Try by submission ID if no session ID or session not found
        if (submissionId) {
          const { session } = await sessionManager.getSubmissionWithSession(submissionId);
          if (session) {
            setSession(session);
            // Store locally as well for offline access
            await offlineStorage.saveSession(session);
            setLastSyncTime(new Date());
            return;
          }
        }
      }
      
      // If offline or session not found online, try to get from local storage
      if (sessionId) {
        const localSession = await offlineStorage.getSession(sessionId);
        if (localSession) {
          setSession(localSession);
          return;
        }
      }
      
      // If we get here with a submissionId, try to find a local session with this submissionId
      if (submissionId) {
        const localSessions = await offlineStorage.getAllSessions();
        const matchingSession = localSessions.find(s => s.submission_id === submissionId);
        if (matchingSession) {
          setSession(matchingSession);
          return;
        }
      }
      
      // If we get here, no session was found
      setError('Session not found');
    } catch (err) {
      console.error('Error loading session:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, sessionId, submissionId]);
  
  // Save session data to local storage and server if online
  const saveSession = useCallback(async (sessionData: Partial<SubmissionSession>) => {
    if (!session) return false;
    
    try {
      // Update our local state first
      setSession(prevSession => {
        if (!prevSession) return null;
        return { ...prevSession, ...sessionData };
      });
      
      // Save to local storage
      const updatedSession = { ...session, ...sessionData };
      await offlineStorage.saveSession(updatedSession);
      
      // Try to sync with server if online
      if (isOnline) {
        // Update session activity on the server
        if (session.session_id) {
          await sessionManager.updateSessionActivity(session.session_id);
          setLastSyncTime(new Date());
        }
      }
      
      return true;
    } catch (err) {
      console.error('Error saving session:', err);
      return false;
    }
  }, [session, isOnline]);
  
  // Sync local session with server when coming back online
  useEffect(() => {
    if (isOnline && session && autoSync) {
      const syncSession = async () => {
        try {
          // Update session activity on the server
          if (session.session_id) {
            await sessionManager.updateSessionActivity(session.session_id);
            setLastSyncTime(new Date());
            toast.success('Session synced with server');
          }
        } catch (err) {
          console.error('Error syncing session:', err);
        }
      };
      
      syncSession();
    }
  }, [isOnline, session, autoSync]);
  
  // Auto-save at the specified interval
  useEffect(() => {
    if (!session || !autoSaveInterval) return;
    
    const interval = setInterval(() => {
      saveSession({}); // Save current session state
    }, autoSaveInterval);
    
    return () => clearInterval(interval);
  }, [session, autoSaveInterval, saveSession]);
  
  // Initial load
  useEffect(() => {
    loadSession();
  }, [loadSession]);
  
  return {
    session,
    setSession,
    isLoading,
    error,
    isOnline,
    lastSyncTime,
    loadSession,
    saveSession
  };
}

export default useOfflineSession;