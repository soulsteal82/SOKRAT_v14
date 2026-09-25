"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // On mount: detect the recovery session created by the reset link.
  useEffect(() => {
    const handle = async () => {
      // Case A — Supabase has already parsed the URL and set a session
      const { data } = await supabaseBrowser.auth.getSession();
      if (data.session) {
        setReady(true);
        setChecking(false);
        return;
      }

      // Case B — Supabase fires PASSWORD_RECOVERY when the URL contains a token
      const { data: sub } = supabaseBrowser.auth.onAuthStateChange(
        (event, session) => {
          if (event === "PASSWORD_RECOVERY" || session) {
            setReady(true);
            setChecking(false);
          }
        }
      );

      // Give it 2 seconds; then decide
      setTimeout(() => {
        setChecking(false);
        sub?.subscription?.unsubscribe();
      }, 2000);
    };
    handle();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabaseBrowser.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    // Small delay so the user sees the message, then send them into the app
    setTimeout(() => router.replace("/"), 1200);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-lg font-black tracking-[0.25em] text-slate-100">
            S.O.K.R.A.T.
          </h1>
          <p className="text-[9px] text-cyan-500 tracking-widest font-mono mt-0.5 uppercase">
            Set a new password
          </p>
        </div>

        {checking && (
          <div className="text-center text-xs text-slate-400 font-mono py-6">
            Verifying reset link…
          </div>
        )}

        {!checking && !ready && (
          <div className="space-y-4">
            <div className="bg-amber-950/30 border border-amber-800 text-amber-400 p-3 rounded text-xs">
              ⚠️ This reset link is invalid or has expired.
              <br />
              Request a new one from the login page.
            </div>
            <button
              onClick={() => router.replace("/login")}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2.5 rounded text-xs uppercase tracking-wider transition"
            >
              Back to login
            </button>
          </div>
        )}

        {!checking && ready && !success && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={8}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
                placeholder="Repeat password"
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
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2.5 rounded text-xs uppercase tracking-wider transition disabled:opacity-50"
            >
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        {success && (
          <div className="text-center space-y-3">
            <div className="text-3xl">✅</div>
            <div className="text-sm text-green-400 font-bold">
              Password updated
            </div>
            <p className="text-[10px] text-slate-400">
              Taking you into the app…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}