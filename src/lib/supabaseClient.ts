import { createClient } from '@supabase/supabase-js';
import { Database } from './types';

// Get environment variables - using explicit values as fallback if env vars are missing
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vxxsqkbkkkksmhnihlkd.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4eHNxa2Jra2trc21obmlobGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2NDYxMjgsImV4cCI6MjA2NDIyMjEyOH0.oGekj3JGCVloz9NVeYdKITRt-k-bWDG2zfxG75oRboQ';

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