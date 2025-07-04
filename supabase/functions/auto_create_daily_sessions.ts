// This is a Supabase Edge Function that will be scheduled to run daily
// It will create unclaimed sessions for all active sites

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'

// Create a Supabase client with the service role key
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

Deno.serve(async (req) => {
  try {
    // Call the auto_create_daily_sessions RPC function
    const { data, error } = await supabase.rpc('auto_create_daily_sessions')
    
    if (error) {
      console.error('Error creating daily sessions:', error)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log('Daily sessions created successfully:', data)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data 
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    console.error('Unexpected error in auto_create_daily_sessions:', err)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message || 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})