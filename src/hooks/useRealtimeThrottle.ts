import { useEffect, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Subscribe to multiple tables and debounce refetch calls
 */
export function useMultiTableRealtime(
  supabase: SupabaseClient,
  tables: string[],
  onUpdate: () => void,
  throttleMs: number = 250
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (!tables || tables.length === 0) return;

    const handleChange = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onUpdate();
      }, throttleMs);
    };

    // Create a single channel for all tables
    const channel = supabase.channel('multi-table-changes');

    // Subscribe to each table
    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        handleChange
      );
    });

    // Subscribe and store reference
    subscriptionRef.current = channel.subscribe();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [supabase, tables.join(','), onUpdate, throttleMs]);
}
