import { supabase } from '../lib/supabaseClient';
import offlineStorage from './offlineStorage';
import { toast } from 'react-toastify';
import { retry } from './helpers';

// Check if we're online
const isOnline = () => navigator.onLine;

// Track if a toast notification for syncing is already showing
let syncingToastShown = false;

// Sync all pending submissions
export const syncPendingSubmissions = async (onProgress?: (current: number, total: number, failed?: number) => void) => {
  if (!isOnline()) {
    return {
      success: false,
      message: 'Cannot sync while offline',
      pendingCount: 0
    };
  }
  
  const pendingSubmissions = await offlineStorage.getPendingSubmissions();
  
  if (pendingSubmissions.length === 0) {
    return {
      success: true,
      message: 'No pending submissions to sync',
      pendingCount: 0
    };
  }
  
  let successCount = 0;
  let errorCount = 0;
  const total = pendingSubmissions.length;
  
  // Show a single toast notification when syncing starts
  if (!syncingToastShown && total > 0) {
    toast.info(`Syncing ${total} submission${total > 1 ? 's' : ''}...`);
    syncingToastShown = true;
  }
  
  for (const [index, pendingItem] of pendingSubmissions.entries()) {
    try {
      // Update progress
      if (onProgress) {
        onProgress(index + 1, total, errorCount);
      }
      
      const { submission, petriObservations, gasifierObservations } = pendingItem;
      const tempSubmissionId = submission.submission_id; // Store the temporary ID
      
      // Insert submission with retry logic
      const { data: submissionData, error: submissionError } = await retry(() => 
        supabase
          .from('submissions')
          .insert(submission)
          .select()
          .single()
      );
        
      if (submissionError) throw submissionError;
      
      const newSubmissionId = submissionData.submission_id;
      
      // Arrays to track ID mappings for observations
      const petriObservationMap: { oldId: string; newId: string }[] = [];
      const gasifierObservationMap: { oldId: string; newId: string }[] = [];
      
      // Insert petri observations with retry logic
      for (const observation of petriObservations) {
        const oldObservationId = observation.observation_id; // Store the temporary ID
        
        const { data: obsData, error: observationError } = await retry(() => 
          supabase
            .from('petri_observations')
            .insert({
              ...observation,
              submission_id: submissionData.submission_id
            })
            .select('observation_id')
            .single()
        );
          
        if (observationError) throw observationError;
        
        // Store the mapping between temporary and permanent IDs
        petriObservationMap.push({
          oldId: oldObservationId,
          newId: obsData.observation_id
        });
      }

      // Insert gasifier observations with retry logic
      for (const observation of gasifierObservations) {
        const oldObservationId = observation.observation_id; // Store the temporary ID
        
        const { data: obsData, error: observationError } = await retry(() => 
          supabase
            .from('gasifier_observations')
            .insert({
              ...observation,
              submission_id: submissionData.submission_id
            })
            .select('observation_id')
            .single()
        );
          
        if (observationError) throw observationError;
        
        // Store the mapping between temporary and permanent IDs
        gasifierObservationMap.push({
          oldId: oldObservationId,
          newId: obsData.observation_id
        });
      }
      
      // Update the offline record with the permanent IDs
      await offlineStorage.updateOfflineSubmission(
        tempSubmissionId,
        newSubmissionId,
        petriObservationMap,
        gasifierObservationMap
      );
      
      // Mark as synced
      await offlineStorage.markSubmissionSynced(submission.submission_id);
      successCount++;
    } catch (error) {
      console.error('Error syncing submission:', error);
      errorCount++;
      
      // Update progress with failure count
      if (onProgress) {
        onProgress(index + 1, total, errorCount);
      }
    }
  }
  
  // Reset the toast flag to allow future sync notifications
  syncingToastShown = false;
  
  if (successCount > 0) {
    toast.success(`Synced ${successCount} submission${successCount > 1 ? 's' : ''}`);
  }
  
  if (errorCount > 0) {
    toast.error(`Failed to sync ${errorCount} submission${errorCount > 1 ? 's' : ''}`);
  }
  
  // Get remaining pending submissions count after sync
  const remainingSubmissions = await offlineStorage.getPendingSubmissions();
  
  return {
    success: errorCount === 0,
    message: `Synced ${successCount} submissions, ${errorCount} failed`,
    pendingCount: remainingSubmissions.length
  };
};

// Get pending submissions count
export const getPendingSubmissionsCount = async () => {
  const pendingSubmissions = await offlineStorage.getPendingSubmissions();
  return pendingSubmissions.length;
};

// Track if we have an active sync interval
let syncIntervalId: number | undefined;

// Set up auto-sync when online
export const setupAutoSync = (onProgress?: (current: number, total: number, failed?: number) => void) => {
  // Only set up auto-sync once
  if (syncIntervalId) {
    console.log('Auto-sync already initialized, skipping duplicate setup');
    return () => {
      window.removeEventListener('online', syncIfOnline);
      clearInterval(syncIntervalId);
      syncIntervalId = undefined;
    };
  }

  const syncIfOnline = async () => {
    if (isOnline()) {
      await syncPendingSubmissions(onProgress);
    }
  };
  
  // Sync when coming online
  window.addEventListener('online', syncIfOnline);
  
  // Also try to sync periodically (every 5 minutes)
  syncIntervalId = window.setInterval(syncIfOnline, 5 * 60 * 1000);
  
  // Clean up function
  return () => {
    window.removeEventListener('online', syncIfOnline);
    clearInterval(syncIntervalId);
    syncIntervalId = undefined;
  };
};

export default {
  syncPendingSubmissions,
  getPendingSubmissionsCount,
  setupAutoSync
};