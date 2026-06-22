/**
 * @file supabase.ts
 * @description Initializes the Supabase client for the admin panel.
 * Uses browser-side createClient for client components.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const fieldtallyUrl = process.env.NEXT_PUBLIC_FIELDTALLY_SUPABASE_URL || '';
const fieldtallyAnonKey = process.env.NEXT_PUBLIC_FIELDTALLY_SUPABASE_ANON_KEY || '';

export const fieldtallySupabase = fieldtallyUrl && fieldtallyAnonKey
  ? createClient(fieldtallyUrl, fieldtallyAnonKey)
  : null;

