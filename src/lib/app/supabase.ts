"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// These two values are public by design (every visitor's browser sees them).
// Row-level security in the database keeps each provider's data private.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isConfigured() {
  return Boolean(url && anonKey);
}

/** Which setting is missing, in plain words, for the sign-in screen. */
export function missingSettings(): string[] {
  const out: string[] = [];
  if (!url) out.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) out.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return out;
}

export function supabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase is not configured yet.");
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
  }
  return client;
}
