"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/lib/auth-context";
import InviteUserForm from "./InviteUserForm";

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  const [authChecked, setAuthChecked] = useState(false);

  // Guard: must be logged in
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else {
        setAuthChecked(true);
      }
    }
  }, [loading, user, router]);

  // Guard: must be PLANNER
  useEffect(() => {
    if (authChecked && profile && profile.role !== "PLANNER") {
      router.replace("/");
    }
  }, [authChecked, profile, router]);

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-mono">
        Checking access…
      </div>
    );
  }

  if (!profile || profile.role !== "PLANNER") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-mono">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 text-slate-100 font-sans">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                Admin Console
              </div>
              <div className="text-sm font-bold text-slate-100">
                User Management
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500 font-mono">
              {profile.name || profile.email} · PLANNER
            </span>
            <button
              onClick={() => router.replace("/")}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 px-2.5 py-1 rounded font-bold uppercase tracking-wider transition"
            >
              ← Back to App
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
              className="text-[10px] bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 px-2.5 py-1 rounded font-bold uppercase tracking-wider transition"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Invite form */}
        <InviteUserForm
          onInvited={(email, role) => {
            console.log("[admin] invited:", email, "as", role);
          }}
        />

        {/* User list — coming in 5c */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">👥</div>
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-1">
            All Users
          </div>
          <p className="text-[10px] text-slate-500 italic">
            User list with role change and deactivate — coming in Session 5c.
          </p>
        </div>
      </div>
    </div>
  );
}