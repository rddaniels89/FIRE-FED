import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create Supabase client with error handling
let supabase = null
let isSupabaseAvailable = false

try {
  if (supabaseUrl && supabaseAnonKey && 
      supabaseUrl !== 'your_supabase_project_url' && 
      supabaseAnonKey !== 'your_supabase_anon_key') {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    isSupabaseAvailable = true
  } else {
    console.warn('Supabase configuration not found or incomplete. Using localStorage fallback.')
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error)
  isSupabaseAvailable = false
}

export { supabase, isSupabaseAvailable }