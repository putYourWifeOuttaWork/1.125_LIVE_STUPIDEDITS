import { createClient } from '@supabase/supabase-js';
import { Database } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('Supabase');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

log.debug('Initializing client');

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('pilot_programs').select('*', { count: 'exact' }).limit(1);
    if (error) throw error;
    log.debug('Connection successful');
    return { success: true, count: data };
  } catch (error) {
    log.error('Connection failed:', error);
    return { success: false, error };
  }
};