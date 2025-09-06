import { Submission, Site, PilotProgram, UserRole } from '../lib/types';

// Session status enum matching the database enum
export type SessionStatus = 'Opened' | 'Working' | 'Completed' | 'Cancelled' | 
                           'Expired' | 'Escalated' | 'Shared' | 
                           'Expired-Complete' | 'Expired-Incomplete';

// Session data structure
export interface SubmissionSession {
  session_id: string;
  submission_id: string;
  site_id: string;
  program_id: string;
  opened_by_user_id: string | null; // Can be null for unclaimed sessions
  session_start_time: string;
  last_activity_time: string;
  session_status: SessionStatus;
  completion_time?: string;
  completed_by_user_id?: string;
  percentage_complete: number;
  valid_petris_logged: number;
  valid_gasifiers_logged: number;
  escalated_to_user_ids?: string[];
}

// Active session with related data
export interface ActiveSession {
  session_id: string;
  submission_id: string;
  site_id: string;
  site_name: string;
  program_id: string;
  program_name: string;
  opened_by_user_id: string | null; // Can be null for unclaimed sessions
  opened_by_user_email: string | null; // Can be null for unclaimed sessions
  opened_by_user_name?: string | null; // Can be null for unclaimed sessions
  session_start_time: string;
  last_activity_time: string;
  session_status: string;
  percentage_complete: number;
  global_submission_id?: number;
  escalated_to_user_ids?: string[];
  is_unclaimed?: boolean; // Flag to indicate if this is an unclaimed session
}

// Initial submission data for creating a new session
export interface InitialSubmissionData {
  temperature: number;
  humidity: number;
  airflow: 'Open' | 'Closed';
  odor_distance: '5-10ft' | '10-25ft' | '25-50ft' | '50-100ft' | '>100ft';
  weather: 'Clear' | 'Cloudy' | 'Rain';
  notes?: string;
  indoor_temperature?: number;
  indoor_humidity_new?: number;
  timezone?: string;
}

// Response from creating a new session
export interface CreateSessionResponse {
  success: boolean;
  submission_id?: string;
  session_id?: string;
  session?: SubmissionSession;
  message?: string;
}

// Session progress information
export interface SessionProgress {
  percentage: number;
  validPetris: number;
  validGasifiers: number;
  totalPetris: number;
  totalGasifiers: number;
}

// Session user information
export interface SessionUser {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole | 'Owner' | 'Collaborator';
}

// Session with full context data
export interface SessionWithContext {
  session: SubmissionSession;
  submission: Submission;
  site: Site;
  program: PilotProgram;
  users: SessionUser[];
  progress: SessionProgress;
}

// Response from claiming a session
export interface ClaimSessionResponse {
  success: boolean;
  message?: string;
  session?: SubmissionSession;
}