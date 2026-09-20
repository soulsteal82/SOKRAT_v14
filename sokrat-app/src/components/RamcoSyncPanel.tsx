"use client";

import React from "react";

// ============================================================
// RAMCO Sync Panel
// Read-only display of certificates auto-fed by RAMCO.
// Replaces the old dispatcher manual upload UI.
//
// If RAMCO hasn't pushed anything yet, nothing blocks.
// The app keeps working — the panel just shows "awaiting".
// ============================================================

type Props = {
  epd1_url?: string | null;
  epd1_file_name?: string | null;
  mix1_url?: string | null;
  mix1_file_name?: string | null;
  epd2_url?: string | null;
  epd2_file_name?: string | null;
  mix2_url?: string | null;
  mix2_file_name?: string | null;
  ramco_synced_at?: string | null;
  isDemoMode?: boolean;
    delivery_note_url?: string | null;
  delivery_note_file_name?: string | null;
};

export default function RamcoSyncPanel({
  epd1_url,
  epd1_file_name,
  mix1_url,
  mix1_file_name,
  epd2_url,
  epd2_file_name,
  mix2_url,
  mix2_file_name,
  ramco_synced_at,
  isDemoMode = false,
  delivery_note_url,
  delivery_note_file_name,
}: Props) {
  const certs = [
    { label: "EPD 1", url: epd1_url, fileName: epd1_file_name },
    { label: "Mix Design 1", url: mix1_url, fileName: mix1_file_name },
    { label: "EPD 2", url: epd2_url, fileName: epd2_file_name },
    { label: "Mix Design 2", url: mix2_url, fileName: mix2_file_name },
    { label: "📋 Delivery Note", url: delivery_note_url, fileName: delivery_note_file_name },
  ];

  const syncedCount = certs.filter((c) => c.url).length;
  const allSynced = syncedCount === certs.length;

  const timeAgo = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.round(diff / 60)}h ago`;
  };

  return (
    <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[8px] text-slate-400 uppercase font-bold">
          🔗 Document Source: RAMCO
        </span>
        <span
          className={`text-[8px] px-2 py-0.5 rounded font-bold ${
            allSynced
              ? "bg-green-950/50 text-green-400"
              : syncedCount > 0
              ? "bg-amber-950/50 text-amber-400"
              : "bg-slate-800 text-slate-400"
          }`}
        >
          {allSynced
            ? "✅ FULLY SYNCED"
            : syncedCount > 0
            ? `⏳ ${syncedCount}/4 SYNCED`
            : "⏳ AWAITING RAMCO"}
        </span>
      </div>

      <div className="space-y-1">
        {certs.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between text-[9px] bg-slate-900/60 px-2 py-1 rounded border border-slate-800"
          >
            <span className="text-slate-400">{c.label}:</span>
            {c.url ? (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 underline font-bold truncate max-w-[140px]"
                title={c.fileName || c.url}
              >
                📄 {c.fileName || "Document"} ↗
              </a>
            ) : (
              <span className="text-amber-500 italic">
                awaiting RAMCO
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-[8px]">
        <span className="text-slate-500">
          Last sync: {timeAgo(ramco_synced_at)}
        </span>
        <span className="text-slate-600 italic">
          Auto-fed · no manual upload
        </span>
      </div>

      {isDemoMode && (
        <div className="mt-1 text-[7px] text-amber-500/70 italic text-center">
          [DEMO DATA] — will be live from RAMCO
        </div>
      )}
    </div>
  );
}