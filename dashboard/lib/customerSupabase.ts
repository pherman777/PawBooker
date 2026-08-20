import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// A separate client instance from lib/supabase.ts (the groomer dashboard's),
// with its own storageKey - otherwise both clients default to the same
// `sb-<project-ref>-auth-token` localStorage key and GoTrue BroadcastChannel,
// and a customer signing in on /book would silently collide with an active
// groomer session in another tab of the same browser.
export const customerSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-customer-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
