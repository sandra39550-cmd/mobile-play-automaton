import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { serverUrl } = await req.json()
    
    if (!serverUrl) {
      throw new Error('serverUrl is required')
    }

    console.log('📡 Updating ADB server URL to:', serverUrl)

    // First, mark all existing configs as inactive
    const { error: deactivateError } = await supabaseClient
      .from('adb_server_config')
      .update({ is_active: false })
      .eq('is_active', true)

    if (deactivateError) {
      console.error('Error deactivating old configs:', deactivateError)
      throw deactivateError
    }

    // Insert or update the new active URL
    const { data, error } = await supabaseClient
      .from('adb_server_config')
      .insert({
        server_url: serverUrl,
        is_active: true,
        last_updated: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating ADB server config:', error)
      throw error
    }

    console.log('✅ ADB server URL updated successfully:', data)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'ADB server URL updated successfully',
        config: data
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in update-adb-url function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 200, // Return 200 to avoid client errors
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})