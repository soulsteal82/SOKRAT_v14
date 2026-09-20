"use client";

import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { classifyDelay } from "@/app/lib/delay";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================
// Planner God-View — live table of all active trips.
//
// Columns:
//   Trip Ref   |   Status   |   Delay Class
// ============================================================

type PlannerRow = {
  manifest_group_id: string;
  status_label: string;
  status_color: string;
  delay_label: string;
  delay_color: string;
  total_delay_minutes: number;
};

// Human-readable label + color for each asset state
function getStatusMeta(state: string | undefined) {
  const s = state || "";
  if (s.includes("REJECTED"))
    return { label: "⛔ REJECTED", color: "bg-red-950/60 text-red-400 border-red-900" };
  if (s === "INITIALIZED")
    return { label: "🏭 AT FACTORY", color: "bg-orange-950/60 text-orange-400 border-orange-900" };
  if (s === "LOADING_INITIATED")
    return { label: "📦 LOADING", color: "bg-orange-950/60 text-orange-400 border-orange-900" };
  if (s === "LOADING_COMPLETED")
    return { label: "✅ LOADED", color: "bg-amber-950/60 text-amber-400 border-amber-900" };
  if (s.startsWith("DISPATCHED"))
    return { label: "🚚 IN TRANSIT", color: "bg-blue-950/60 text-blue-300 border-blue-900" };
  if (s === "ARRIVED_AT_GATE")
    return { label: "📍 AT GATE", color: "bg-cyan-950/60 text-cyan-300 border-cyan-900" };
  if (s.startsWith("RECEIVED_ON_SITE"))
    return { label: "🏗️ ON SITE", color: "bg-cyan-950/60 text-cyan-300 border-cyan-900" };
  if (s === "GATE_IN_OFFLOADING")
    return { label: "🔄 OFFLOADING", color: "bg-cyan-950/60 text-cyan-300 border-cyan-900" };
  if (s === "OFFLOADING_COMPLETED")
    return { label: "📥 OFFLOADED", color: "bg-teal-950/60 text-teal-300 border-teal-900" };
  if (s === "INSTALLATION_INITIATED")
    return { label: "🔧 INSTALLING", color: "bg-purple-950/60 text-purple-300 border-purple-900" };
  if (s === "INSTALLATION_COMPLETED")
    return { label: "✅ COMPLETED", color: "bg-green-950/60 text-green-400 border-green-900" };
  return { label: s || "—", color: "bg-slate-800 text-slate-400 border-slate-700" };
}

// Rank order for "least advanced state" — used to pick a manifest's
// representative state (same rule as TaskDashboard).
const stateRank = (s: string): number => {
  if (!s) return 0;
  if (s.startsWith("REJECTED")) return -1;
  if (s === "INITIALIZED") return 0;
  if (s === "LOADING_INITIATED") return 1;
  if (s === "LOADING_COMPLETED") return 2;
  if (s.startsWith("DISPATCHED")) return 3;
  if (s === "ARRIVED_AT_GATE") return 4;
  if (s.startsWith("RECEIVED_ON_SITE")) return 5;
  if (s === "GATE_IN_OFFLOADING") return 6;
  if (s === "OFFLOADING_COMPLETED") return 7;
  if (s === "INSTALLATION_INITIATED") return 8;
  if (s === "INSTALLATION_COMPLETED") return 9;
  return 0;
};

export default function PlannerDashboard() {
  const [rows, setRows] = useState<PlannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadRows = async () => {
    // 1. Fetch every manifest
    const { data: manifests, error } = await supabase
      .from("manifests")
      .select("manifest_group_id, driver_name, inspector_name")
      .order("manifest_group_id", { ascending: true });

    if (error || !manifests) {
      setLoading(false);
      return;
    }

    const manifestIds = manifests.map((m) => m.manifest_group_id);

    // 2. Fetch all assets for those manifests
    const { data: assets } = await supabase
      .from("assets")
      .select(
        "manifest_group_id, state, factory_delay_minutes, transit_delay_minutes, site_delay_minutes"
      )
      .in("manifest_group_id", manifestIds);

    // 3. Group by manifest and compute representative state + delay sum
    const stateByManifest: Record<string, string> = {};
    const delayByManifest: Record<string, { f: number; t: number; s: number }> = {};

    (assets || []).forEach((a: any) => {
      const id = a.manifest_group_id;

      // Representative state = least advanced (matches what TaskDashboard shows)
      const prev = stateByManifest[id];
      if (prev === undefined || stateRank(a.state) < stateRank(prev)) {
        stateByManifest[id] = a.state;
      }

      // Delay totals — take the MAX per phase across panels, not the sum,
      // because a delay on one panel usually reflects the trip
      if (!delayByManifest[id]) delayByManifest[id] = { f: 0, t: 0, s: 0 };
      delayByManifest[id].f = Math.max(delayByManifest[id].f, a.factory_delay_minutes || 0);
      delayByManifest[id].t = Math.max(delayByManifest[id].t, a.transit_delay_minutes || 0);
      delayByManifest[id].s = Math.max(delayByManifest[id].s, a.site_delay_minutes || 0);
    });

    // 4. Build display rows
    const built: PlannerRow[] = manifests.map((m) => {
      const state = stateByManifest[m.manifest_group_id] || "INITIALIZED";
      const d = delayByManifest[m.manifest_group_id] || { f: 0, t: 0, s: 0 };
      const total = d.f + d.t + d.s;
      const delayInfo = classifyDelay(d.f, d.t, d.s);
      const statusMeta = getStatusMeta(state);

      return {
        manifest_group_id: m.manifest_group_id,
        status_label: statusMeta.label,
        status_color: statusMeta.color,
        delay_label: delayInfo.label,
        delay_color: `${delayInfo.bg} ${delayInfo.color}`,
        total_delay_minutes: total,
      };
    });

    setRows(built);
    setLastRefresh(new Date());
    setLoading(false);
  };

  // Initial load
  useEffect(() => {
    loadRows();
  }, []);

  // Realtime subscription — re-fetch on any change to manifests or assets
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce rapid-fire events (multi-row updates fire one event per row)
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        console.log("[Planner] Realtime change detected → refreshing table");
        loadRows();
      }, 400);
    };

    const channel = supabase
      .channel("planner-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manifests" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assets" },
        scheduleRefresh
      )
      .subscribe((status) => {
        console.log("[Planner] Realtime subscription status:", status);
      });

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-950 border border-purple-900/40 rounded-xl p-6 text-center">
        <div className="text-2xl animate-pulse mb-2">📊</div>
        <div className="text-xs text-purple-300 font-bold uppercase tracking-widest">
          Loading God-View…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-purple-900/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-900/40 bg-purple-950/30">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <span className="text-xs font-black tracking-widest text-purple-300 uppercase">
            All Active Trips
          </span>
          <span className="text-[9px] text-purple-400/60 font-mono">
            ({rows.length})
          </span>
          <span className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-green-950/40 border border-green-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[8px] text-green-300 font-bold uppercase tracking-wider">
              Live
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[9px] text-slate-500 font-mono">
              Updated {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            onClick={loadRows}
            className="text-[9px] bg-purple-900/40 hover:bg-purple-900/70 border border-purple-800/60 text-purple-300 px-2 py-1 rounded font-bold uppercase tracking-wider transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="text-left px-4 py-2">Trip Ref</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Delay Class</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.manifest_group_id}
                className="border-b border-slate-900 hover:bg-slate-900/40 transition"
              >
                <td className="px-4 py-2.5 font-mono text-slate-200 text-[10px]">
                  {r.manifest_group_id}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block text-[9px] px-2 py-1 rounded font-bold border ${r.status_color}`}
                  >
                    {r.status_label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block text-[9px] px-2 py-1 rounded font-bold border border-slate-800 ${r.delay_color}`}
                  >
                    {r.delay_label}
                  </span>
                  {r.total_delay_minutes > 0 && (
                    <span className="text-[8px] text-slate-500 font-mono ml-2">
                      ({r.total_delay_minutes}m)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-500 italic">
            No trips found in the database.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-purple-950/20 border-t border-purple-900/40 text-[9px] text-slate-500 text-center font-mono">
        Live updates via Supabase Realtime · Powered by SOKRAT
              </div>
    </div>
  );
}