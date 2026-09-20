"use client";

import React from "react";

// ============================================================
// Fleet Radar — full-screen FlightRadar24-style map.
//
// Task 10a: shell only (header + close + empty map area).
// Task 10b: plot vehicles.
// Task 10c: click popups + filters.
// ============================================================

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function FleetRadar({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col isolate">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-[10000] relative">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛰️</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Fleet Radar
            </div>
            <div className="text-sm font-bold text-slate-100">
              Live Fleet Overview
            </div>
          </div>
          <span className="flex items-center gap-1 ml-3 px-2 py-0.5 rounded-full bg-green-950/40 border border-green-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[8px] text-green-300 font-bold uppercase tracking-wider">
              Live
            </span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 px-3 py-1.5 rounded font-bold uppercase tracking-wider touch-manipulation"
        >
          ✕ Close
        </button>
      </div>

      {/* Map area — placeholder until 10b */}
      <div className="relative flex-1">
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-3">
          <div className="text-5xl">🛰️</div>
          <div className="text-xs text-slate-400 font-mono">
            Fleet Radar shell mounted.
          </div>
          <div className="text-[10px] text-slate-500 italic">
            Vehicles arrive in Task 10b.
          </div>
        </div>
      </div>

      {/* Bottom banner */}
      <div className="bg-slate-900/95 border-t border-slate-800 px-4 py-2 text-[9px] text-slate-500 font-mono text-center">
        Task 10a · shell ready · Powered by SOKRAT
      </div>
    </div>
  );
}