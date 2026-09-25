"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase-browser";

// ============================================================
// SOKRAT — Auth Context
//
// Provides the current user (auth + profile) to any component.
// Usage: const { user, profile, loading, signOut } = useAuth();
// ============================================================

export type UserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: "DISPATCHER" | "DRIVER" | "INSPECTOR" | "PLANNER" | null;
  company_id: string | null;
  active: boolean;
};

type AuthContextValue = {
  user: { id: string; email: string | null } | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ------------------------------------------------------------
  // Load the profile for a given user id
  // ------------------------------------------------------------
  const loadProfile = async (userId: string, email: string | null) => {
    const { data, error } = await supabaseBrowser
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.warn("[auth] profile lookup failed:", error?.message);
      setProfile(null);
      return;
    }

    setProfile({
      id: data.id,
      email: data.email || email,
      name: data.name,
      phone: data.phone,
      role: data.role,
      company_id: data.company_id,
      active: data.active ?? true,
    });
  };

  // ------------------------------------------------------------
  // On mount: check current session and set up listener
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    // Initial session check
    supabaseBrowser.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;

      if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email ?? null,
        });
        await loadProfile(data.session.user.id, data.session.user.email ?? null);
      }
      setLoading(false);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[auth] state change:", event);

        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email ?? null,
          });
          await loadProfile(session.user.id, session.user.email ?? null);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------
  // Sign out
  // ------------------------------------------------------------
  const signOut = async () => {
    await supabaseBrowser.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  // ------------------------------------------------------------
  // Manual refresh (useful after profile updates)
  // ------------------------------------------------------------
  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id, user.email);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}