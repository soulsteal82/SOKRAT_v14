"use client";

import React, { useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

// ============================================================
// InviteUserForm
// Sends an invitation via the /api/admin/invite server route.
// ============================================================

type Props = {
  onInvited?: (email: string, role: string) => void;
};

const ROLES = ["DISPATCHER", "DRIVER", "INSPECTOR", "PLANNER"];

export default function InviteUserForm({ onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("DISPATCHER");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Get the current session's access token
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Not authenticated. Please sign in again.");
      }

      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, name, phone, role }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Invite failed");
      }

      setSuccess(
        `✅ Invitation sent to ${email} as ${role}. They'll receive an email with a link to set their password.`
      );
      setEmail("");
      setName("");
      setPhone("");
      setRole("DISPATCHER");
      onInvited?.(email, role);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">✉️</span>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            Invite a user
          </div>
          <div className="text-xs text-slate-400">
            They'll receive an email with a link to set their password.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
              placeholder="user@company.ae"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
              placeholder="Ahmed Al Maktoum"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
              placeholder="+971 50 123 4567"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Role *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 transition"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-800 text-red-400 p-2 rounded text-xs font-mono">
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="bg-green-950/30 border border-green-800 text-green-400 p-2 rounded text-xs font-mono">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2.5 rounded text-xs uppercase tracking-wider transition disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? "Sending invitation…" : "Send Invitation"}
        </button>
      </form>
    </div>
  );
}