"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New password state (for recovery flow)
  const [isRecovery, setIsRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // ------------------------------------------------------------
  // Detect recovery mode + handle existing session
  // ------------------------------------------------------------
  useEffect(() => {
    // Check if there's already a session (user is logged in)
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });

    // Watch for auth state changes
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange(
      (event, session) => {
        console.log("[login] auth event:", event);
        if (event === "PASSWORD_RECOVERY") {
          setIsRecovery(true);
        } else if (session) {
          router.replace("/");
        }
      }
    );

    // Also check: if the URL contains a token + type=recovery, treat as recovery
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const search = window.location.search;
      if (hash.includes("type=recovery") || search.includes("type=recovery")) {
        setIsRecovery(true);
      }
    }

    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, [router]);

  // ------------------------------------------------------------
  // Normal login
  // ------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace("/");
  };

  // ------------------------------------------------------------
  // Forgot password
  // ------------------------------------------------------------
  const handleForgotPassword = async () => {
    const emailInput = window.prompt("Enter your email address:");
    if (!emailInput) return;

    const { error: resetErr } = await supabaseBrowser.auth.resetPasswordForEmail(
      emailInput,
      {
        redirectTo: `${window.location.origin}/login?type=recovery`,
      }
    );

    if (resetErr) {
      alert("Failed: " + resetErr.message);
    } else {
      alert("If that email is registered, a reset link has been sent.");
    }
  };

  // ------------------------------------------------------------
  // Set new password (recovery mode)
  // ------------------------------------------------------------
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);

    if (newPassword.length < 8) {
      setRecoveryError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== newPassword2) {
      setRecoveryError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabaseBrowser.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateError) {
      setRecoveryError(updateError.message);
      return;
    }

    setRecoverySuccess(true);
    setTimeout(() => router.replace("/"), 1500);
  };

  // ------------------------------------------------------------
  // RENDER — recovery mode
  // ------------------------------------------------------------
  if (isRecovery) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <img
              src="/Images/Logo.jpg"
              alt="SOKRAT"
              className="h-12 w-auto mb-3 object-contain"
            />
            <h1 className="text-lg font-black tracking-[0.25em] text-slate-100">
              S.O.K.R.A.T.
            </h1>
            <p className="text-[9px] text-cyan-500 tracking-widest font-mono mt-0.5 uppercase">
              Set a new password
            </p>
          </div>

          {recoverySuccess ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">✅</div>
              <div className="text-sm text-green-400 font-bold">
                Password updated
              </div>
              <p className="text-[10px] text-slate-400">
                Taking you into the app…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  New password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
                  placeholder="Repeat password"
                />
              </div>

              {recoveryError && (
                <div className="bg-red-950/30 border border-red-800 text-red-400 p-2 rounded text-xs font-mono">
                  ⚠️ {recoveryError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2.5 rounded text-xs uppercase tracking-wider transition disabled:opacity-50"
              >
                {loading ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // RENDER — normal login
  // ------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <img
            src="/Images/Logo.jpg"
            alt="S.O.K.R.A.T. Logo"
            className="h-14 w-auto mb-3 object-contain"
          />
          <h1 className="text-lg font-black tracking-[0.25em] text-slate-100">
            S.O.K.R.A.T.
          </h1>
          <p className="text-[9px] text-cyan-500 tracking-widest font-mono mt-0.5 uppercase">
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
              placeholder="you@company.ae"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-950/30 border border-red-800 text-red-400 p-2 rounded text-xs font-mono">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2.5 rounded text-sm uppercase tracking-wider transition disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-[10px] text-slate-400 hover:text-cyan-400 underline"
          >
            Forgot password?
          </button>
        </div>

        <p className="text-[9px] text-slate-500 text-center mt-4 leading-relaxed">
          Access is by invitation only.
          <br />
          Contact your Gulf Precast administrator for access.
        </p>
      </div>
    </div>
  );
}