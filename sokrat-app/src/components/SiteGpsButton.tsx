"use client";

import React, { useState } from "react";
import { supabase } from "@/app/lib/supabase";

// ============================================================
// Site GPS Panel
// Two-way entry:
//   - Inspector clicks "Share Current Site GPS" → uses phone GPS
//   - Or types coordinates manually
//   - Planner / RAMCO can also write to the same columns externally
// Last writer wins.
// ============================================================

type Props = {
  manifestGroupId: string;
  siteName?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  currentSource?: string | null;
  currentUpdatedAt?: string | null;
  onSaved?: (lat: number, lng: number, source: string) => void;
};

export default function SiteGpsButton({
  manifestGroupId,
  siteName,
  currentLat,
  currentLng,
  currentSource,
  currentUpdatedAt,
  onSaved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState<string>(currentLat?.toString() ?? "");
  const [lng, setLng] = useState<string>(currentLng?.toString() ?? "");

  const hasGps = currentLat != null && currentLng != null;

  const timeAgo = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.round(diff / 60)}h ago`;
  };

  const saveSiteGps = async (la: number, ln: number) => {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("manifests")
      .update({
        site_latitude: la,
        site_longitude: ln,
        site_gps_source: "INSPECTOR",
        site_gps_updated_at: now,
      })
      .eq("manifest_group_id", manifestGroupId);

    if (error) {
      alert("Failed to save site GPS: " + error.message);
      return;
    }

    // 🔄 MOCK → RAMCO: in production, notify planning team here.
    console.log("[RAMCO stub] would notify planning of site GPS:", {
      manifestGroupId,
      lat: la,
      lng: ln,
    });

    if (onSaved) onSaved(la, ln, "INSPECTOR");
    alert(
      `✅ Site GPS shared with planning team.\n\n` +
        `${siteName || manifestGroupId}\n` +
        `${la.toFixed(5)}, ${ln.toFixed(5)}`
    );
  };

  const handleShareCurrent = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not available in this browser.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await saveSiteGps(pos.coords.latitude, pos.coords.longitude);
        setBusy(false);
      },
      (err) => {
        alert("Could not get location: " + err.message);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveManual = async () => {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) {
      alert("Invalid coordinates. Please enter numbers only.");
      return;
    }
    setBusy(true);
    await saveSiteGps(la, ln);
    setBusy(false);
  };

  return (
    <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-slate-400 uppercase font-bold">
          📍 Site GPS Coordinates
        </span>
        {hasGps ? (
          <span className="text-[8px] px-2 py-0.5 rounded font-bold bg-green-950/50 text-green-400">
            ✅ SET · {currentSource || "UNKNOWN"}
          </span>
        ) : (
          <span className="text-[8px] px-2 py-0.5 rounded font-bold bg-amber-950/50 text-amber-400">
            ⏳ NOT SET
          </span>
        )}
      </div>

      {hasGps && (
        <div className="text-[9px] text-slate-400 font-mono bg-slate-900/60 px-2 py-1 rounded">
          {currentLat?.toFixed(5)}, {currentLng?.toFixed(5)}
          <div className="text-[8px] text-slate-500 mt-0.5">
            Source: {currentSource || "—"} · Updated {timeAgo(currentUpdatedAt)}
          </div>
        </div>
      )}

      <button
        onClick={handleShareCurrent}
        disabled={busy}
        className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2 rounded text-xs uppercase transition disabled:opacity-50"
      >
        {busy ? "⏳ Sending..." : "📍 Share Current Site GPS to Planning"}
      </button>

      <button
        onClick={() => setManual((v) => !v)}
        className="w-full text-[8px] text-slate-400 hover:text-cyan-400 underline"
      >
        {manual ? "▲ hide manual entry" : "▼ or enter coordinates manually"}
      </button>

      {manual && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Lat (e.g. 24.4991)"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-slate-200 font-mono"
          />
          <input
            type="text"
            placeholder="Lng (e.g. 54.4070)"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-slate-200 font-mono"
          />
          <button
            onClick={handleSaveManual}
            disabled={busy}
            className="col-span-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold p-1.5 rounded text-xs uppercase transition"
          >
            💾 Save Manual Coordinates
          </button>
        </div>
      )}

      <p className="text-[7px] text-slate-600 italic text-center">
        Two-way sync · can also be written by RAMCO planner
      </p>
    </div>
  );
}