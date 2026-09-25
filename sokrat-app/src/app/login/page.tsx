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

  // If the user is already logged in, redirect to home
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });
  }, [router]);

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

    // Success → send to home
    router.replace("/");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
        {/* Logo + title */}
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

        {/* Form */}
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
        {/* Forgot password */}
        <div className="mt-3 text-center">
          <button
            onClick={async () => {
              const email = prompt("Enter your email for the reset link:");
              if (!email) return;
              const { error: resetErr } =
                await supabaseBrowser.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
              if (resetErr) {
                alert("Failed: " + resetErr.message);
              } else {
                alert("Reset email sent. Check your inbox.");
              }
            }}
            className="text-[10px] text-slate-400 hover:text-cyan-400 underline"
          >
            Forgot password?
          </button>
        </div>
        {/* Footer */}
        <p className="text-[9px] text-slate-500 text-center mt-4 leading-relaxed">
          Access is by invitation only.
          <br />
          Contact your Gulf Precast administrator for access.
        </p>
      </div>
    </div>
  );
}