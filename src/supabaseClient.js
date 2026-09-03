import { createClient } from '@supabase/supabase-js'
import { createBoundedNavigatorLock } from './lib/auth/boundedLock'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create Supabase client with error handling
let supabase = null
let isSupabaseAvailable = false

try {
  if (supabaseUrl && supabaseAnonKey && 
      supabaseUrl !== 'your_supabase_project_url' && 
      supabaseAnonKey !== 'your_supabase_anon_key') {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Without a deadline on this lock, a stuck tab silently freezes every
        // authenticated request in every other tab. See lib/auth/boundedLock.
        lock: createBoundedNavigatorLock({
          onTimeout: (name) =>
            console.warn(
              `Auth lock "${name}" could not be acquired in time; proceeding without it. ` +
                'This usually means another tab is holding it.'
            ),
        }),
      },
    })
    isSupabaseAvailable = true
  } else {
    console.warn('Supabase configuration not found or incomplete. Using localStorage fallback.')
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error)
  isSupabaseAvailable = false
}

export { supabase, isSupabaseAvailable }