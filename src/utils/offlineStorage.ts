import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Submission, PetriObservation, GasifierObservation } from '../lib/types';
import { SubmissionSession } from '../types/session';
import { createLogger } from './logger';

// Create a logger for offlineStorage
const logger = createLogger('OfflineStorage');

interface GRMTekDB extends DBSchema {
  submissions: {
    key: string;
    value: {
      submission: Submission;
      petriObservations: PetriObservation[];
      gasifierObservations: GasifierObservation[];
      status: 'pending' | 'synced';
    };
    indexes: { 'by-site': string; 'by-status': string };
  };
  temp_images: {
    key: string;
    value: Blob;
  };
  submission_sessions: {
    key: string;
    value: SubmissionSession;
  };
}

let dbPromise: Promise<IDBPDatabase<GRMTekDB>>;

const initDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<GRMTekDB>('grmtek-offline-storage', 4, {
      upgrade(db, oldVersion, newVersion) {
        // Create submissions store if it doesn't exist
        if (oldVersion < 1) {
          const submissionsStore = db.createObjectStore('submissions', {
            keyPath: 'submission.submission_id'
          });
          submissionsStore.createIndex('by-site', 'submission.site_id');
          submissionsStore.createIndex('by-status', 'status');
        }
        
        // Create temp_images store if version upgrade to 2
        if (oldVersion < 2) {
          db.createObjectStore('temp_images');
        }

        // Create submission_sessions store if version upgrade to 3
        if (oldVersion < 3) {
          db.createObjectStore('submission_sessions', {
            keyPath: 'session_id'
          });
        }
      }
    });
  }
  return dbPromise;
};

// Save submission for offline use
export const saveSubmissionOffline = async (
  submission: Submission,
  petriObservations: PetriObservation[] = [],
  gasifierObservations: GasifierObservation[] = []
) => {
  const db = await initDB();
  await db.put('submissions', {
    submission,
    petriObservations,
    gasifierObservations,
    status: 'pending'
  });
};

// Get all pending submissions
export const getPendingSubmissions = async () => {
  const db = await initDB();
  return db.getAllFromIndex('submissions', 'by-status', 'pending');
};

// Mark submission as synced
export const markSubmissionSynced = async (submissionId: string) => {
  const db = await initDB();
  const record = await db.get('submissions', submissionId);
  if (record) {
    record.status = 'synced';
    await db.put('submissions', record);
  }
};

// Update offline submission with permanent IDs
export const updateOfflineSubmission = async (
  oldSubmissionId: string, 
  newSubmissionId: string,
  petriObservationMap: { oldId: string; newId: string }[],
  gasifierObservationMap: { oldId: string; newId: string }[]
) => {
  const db = await initDB();
  const record = await db.get('submissions', oldSubmissionId);

  if (!record) {
    logger.error(`Submission with ID ${oldSubmissionId} not found`);
    return false;
  }
  
  // Create a copy of the record
  const updatedRecord = { ...record };
  
  // Update the submission ID
  updatedRecord.submission = { 
    ...updatedRecord.submission, 
    submission_id: newSubmissionId 
  };
  
  // Update petri observation IDs
  if (petriObservationMap.length > 0) {
    updatedRecord.petriObservations = updatedRecord.petriObservations.map(obs => {
      const mapping = petriObservationMap.find(map => map.oldId === obs.observation_id);
      if (mapping) {
        return { 
          ...obs, 
          observation_id: mapping.newId,
          submission_id: newSubmissionId // Also update the submission_id reference
        };
      }
      return obs;
    });
  }
  
  // Update gasifier observation IDs
  if (gasifierObservationMap.length > 0) {
    updatedRecord.gasifierObservations = updatedRecord.gasifierObservations.map(obs => {
      const mapping = gasifierObservationMap.find(map => map.oldId === obs.observation_id);
      if (mapping) {
        return { 
          ...obs, 
          observation_id: mapping.newId,
          submission_id: newSubmissionId // Also update the submission_id reference
        };
      }
      return obs;
    });
  }
  
  // Delete the old record
  await db.delete('submissions', oldSubmissionId);
  
  // Add the updated record with the new ID
  await db.put('submissions', {
    ...updatedRecord,
    status: 'synced' // Mark as synced
  });
  
  return true;
};

// Get submissions for a site
export const getSubmissionsForSite = async (siteId: string) => {
  const db = await initDB();
  return db.getAllFromIndex('submissions', 'by-site', siteId);
};

// Clear all synced submissions
export const clearSyncedSubmissions = async () => {
  const db = await initDB();
  const tx = db.transaction('submissions', 'readwrite');
  const store = tx.objectStore('submissions');
  const syncedRecords = await store.index('by-status').getAll('synced');
  
  for (const record of syncedRecords) {
    await store.delete(record.submission.submission_id);
  }
  
  await tx.done;
};

// Save a session to IndexedDB
export const saveSession = async (session: SubmissionSession): Promise<void> => {
  const db = await initDB();
  await db.put('submission_sessions', session);
};

// Get a session by ID
export const getSession = async (sessionId: string): Promise<SubmissionSession | undefined> => {
  const db = await initDB();
  return db.get('submission_sessions', sessionId);
};

// Get all sessions
export const getAllSessions = async (): Promise<SubmissionSession[]> => {
  const db = await initDB();
  return db.getAll('submission_sessions');
};

// Functions for temporary image storage

// Save a temporary image with a key
export const saveTempImage = async (key: string, blob: Blob): Promise<string> => {
  const db = await initDB();
  logger.debug(`Saving image with key: ${key}`, {
    blobSize: blob.size, 
    blobType: blob.type
  });
  await db.put('temp_images', blob, key);
  return key;
};

// Get a temporary image by key
export const getTempImage = async (key: string): Promise<Blob | undefined> => {
  const db = await initDB();
  logger.debug(`Fetching image with key: ${key}`);
  const blob = await db.get('temp_images', key);
  if (blob) {
    logger.debug(`Successfully retrieved temp image for key: ${key}`, {
      blobSize: blob.size,
      blobType: blob.type
    });
  } else {
    logger.debug(`No temp image found for key: ${key}`);
  }
  return blob;
};

// Delete a specific temporary image by key
export const deleteTempImage = async (key: string): Promise<void> => {
  const db = await initDB();
  logger.debug(`Deleting image with key: ${key}`);
  await db.delete('temp_images', key);
};

// Clear all temporary images for a specific submission
export const clearTempImagesForSubmission = async (submissionTempId: string): Promise<void> => {
  const db = await initDB();
  logger.debug(`Clearing temp images for submission: ${submissionTempId}`);
  
  const tx = db.transaction('temp_images', 'readwrite');
  const store = tx.objectStore('temp_images');
  
  const allKeys = await store.getAllKeys();
  let deletedCount = 0;
  
  for (const key of allKeys) {
    if (typeof key === 'string' && key.includes(submissionTempId)) {
      await store.delete(key);
      deletedCount++;
    }
  }
  
  logger.debug(`Deleted ${deletedCount} temp images for submission: ${submissionTempId}`);
  
  await tx.done;
};

// List all temp image keys for debugging
export const listTempImageKeys = async (): Promise<string[]> => {
  try {
    const db = await initDB();
    const tx = db.transaction('temp_images', 'readonly');
    const store = tx.objectStore('temp_images');
    
    const allKeys = await store.getAllKeys();
    const stringKeys = allKeys.map(key => key.toString());
    
    logger.debug(`Found ${stringKeys.length} temp image keys`);
    if (stringKeys.length > 0) {
      logger.debugData('Temp image keys', stringKeys);
    }
    
    return stringKeys;
  } catch (error) {
    logger.error('Error listing temp image keys:', error);
    return [];
  }
};

// Get all temporary images (useful for debugging)
export const getAllTempImages = async (): Promise<{ key: string; blob: Blob }[]> => {
  const db = await initDB();
  logger.debug(`Retrieving all temp images`);
  
  const tx = db.transaction('temp_images', 'readonly');
  const store = tx.objectStore('temp_images');
  
  const allKeys = await store.getAllKeys();
  const result = [];
  
  for (const key of allKeys) {
    const blob = await store.get(key);
    result.push({ key: key as string, blob });
  }
  
  logger.debug(`Found ${result.length} temp images`);
  
  return result;
};

export default {
  initDB,
  saveSubmissionOffline,
  getPendingSubmissions,
  markSubmissionSynced,
  updateOfflineSubmission,
  getSubmissionsForSite,
  clearSyncedSubmissions,
  saveTempImage,
  getTempImage,
  deleteTempImage,
  clearTempImagesForSubmission,
  getAllTempImages,
  listTempImageKeys,
  saveSession,
  getSession,
  getAllSessions
};