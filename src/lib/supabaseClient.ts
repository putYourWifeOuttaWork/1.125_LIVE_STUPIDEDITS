import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

console.log('Connecting to Supabase:', supabaseUrl);

// Create the Supabase client
export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

// Add a simple health check function to test connectivity
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('pilot_programs').select('*', { count: 'exact' }).limit(1);
    if (error) throw error;
    console.log('Supabase connection successful');
    return { success: true, count: data };
  } catch (error) {
    console.error('Supabase connection failed:', error);
    return { success: false, error };
  }
};