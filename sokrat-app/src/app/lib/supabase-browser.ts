// ============================================================
// SOKRAT — Supabase browser client
//
// This client is used in the browser (React components).
// It manages the auth session and persists it across refreshes.
// ============================================================

"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey);