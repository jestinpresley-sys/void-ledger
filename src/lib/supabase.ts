import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// The publishable key (sb_publishable_…). VITE_SUPABASE_ANON_KEY is still read for older setups.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** null when the app runs without accounts (no Supabase keys in .env). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
