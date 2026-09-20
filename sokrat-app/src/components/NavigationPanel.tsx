"use client";

import React, { useEffect, useState } from "react";
import {
  fetchRoute,
  simulateTraffic,
  computeETA,
  RouteResult,
  TrafficSegment,
} from "@/app/lib/routing";

// ---- Haversine (metres) ----
function haversineMeters(
  a: [number, number],
  b: [number, number]
): number {
  const R = 6371000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ============================================================
// NavigationPanel — Talabat-style driver card.
// Shows: ETA, live traffic per segment, turn-by-turn, destination.
// Powered by OSRM via lib/routing.ts.
// ============================================================

type Props = {
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  siteLat: number | null | undefined;
  siteLng: number | null | undefined;
  siteName: string;
  isActive: boolean;
  onOpenFullScreen?: () => void;
  compact?: boolean;
    hideLauncher?: boolean;
};

export default function NavigationPanel({
  driverLat,
  driverLng,
  siteLat,
  siteLng,
  siteName,
  isActive,
  onOpenFullScreen,
  compact = false,
    hideLauncher = false,
}: Props) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [traffic, setTraffic] = useState<TrafficSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);
    // ---- Nearby detection (≤ 200 m from destination) ----
  const NEARBY_THRESHOLD_M = 200;
  const distanceToSiteM =
    driverLat != null && driverLng != null && siteLat != null && siteLng != null
      ? haversineMeters([driverLat, driverLng], [siteLat, siteLng])
      : Infinity;
  const driverIsNearby = distanceToSiteM <= NEARBY_THRESHOLD_M;

  useEffect(() => {
    if (!isActive || !driverLat || !driverLng || !siteLat || !siteLng) {
      setRoute(null);
      setTraffic([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    fetchRoute([driverLat, driverLng], [siteLat, siteLng])
      .then((r) => {
        if (cancelled) return;
        setRoute(r);
        setTraffic(simulateTraffic(r));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, driverLat, driverLng, siteLat, siteLng]);

  if (!isActive) return null;

  const hasCoords =
    driverLat != null && driverLng != null && siteLat != null && siteLng != null;

  if (!hasCoords) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center space-y-1">
        <div className="text-2xl">🚚</div>
        <div className="text-sm text-amber-400 font-bold uppercase tracking-wider">
          Awaiting Navigation Data
        </div>
        <div className="text-[10px] text-slate-500">
          Site GPS not yet shared by inspector or RAMCO.
        </div>
      </div>
    );
  }

  if (loading || !route) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center space-y-2">
        <div className="text-3xl animate-pulse">🚚</div>
        <div className="text-xs text-cyan-400 font-bold uppercase tracking-widest">
          Computing Route…
        </div>
      </div>
    );
  }

  const { etaMinutes, etaTimestamp, addedMinutes } = computeETA(route, traffic);
  const distanceKm = (route.distanceMeters / 1000).toFixed(1);

  // Pick next 3 steps from the full list
  const visibleSteps = showAllSteps ? route.steps : route.steps.slice(0, 3);

  return (
    <div className="bg-gradient-to-b from-cyan-950/30 to-slate-950 border border-cyan-800/40 rounded-xl overflow-hidden">
      {/* Header — dynamic: "On The Way" or "Driver Is Nearby" */}
      <div
        className={`px-4 py-2 flex items-center justify-between border-b transition-colors ${
          driverIsNearby
            ? "bg-green-950/70 border-green-800/60"
            : "bg-cyan-950/60 border-cyan-800/40"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">{driverIsNearby ? "📍" : "🚚"}</span>
          <span
            className={`text-xs font-black tracking-widest uppercase ${
              driverIsNearby ? "text-green-300" : "text-cyan-300"
            }`}
          >
            {driverIsNearby ? "Driver Is Nearby" : "On The Way"}
          </span>
        </div>
        <span className="text-[9px] text-slate-400 font-mono">
          {driverIsNearby
            ? `${Math.round(distanceToSiteM)} m away`
            : route.source === "OSRM"
            ? "Live route"
            : "Fallback route"}
        </span>
      </div>

      {/* Big stats */}
      <div className="grid grid-cols-2 gap-3 p-4 border-b border-slate-800">
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
            ETA
          </div>
          <div className="text-3xl font-black text-cyan-300 leading-none mt-1">
            {etaMinutes}
            <span className="text-base font-bold text-cyan-500 ml-1">min</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
            Arrival
          </div>
          <div className="text-2xl font-black text-slate-200 leading-none mt-1">
            {etaTimestamp.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
            Distance
          </div>
          <div className="text-lg font-bold text-slate-200 mt-1">
            {distanceKm} km
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
            Traffic delay
          </div>
          <div
            className={`text-lg font-bold mt-1 ${
              addedMinutes === 0
                ? "text-green-400"
                : addedMinutes < 15
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {addedMinutes === 0 ? "None" : `+${addedMinutes} min`}
          </div>
        </div>
      </div>

      {/* Traffic segments — hidden in compact mode */}
      {!compact && (
        <div className="p-3 space-y-1.5 border-b border-slate-800">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">
            Traffic ahead
          </div>
          {traffic.map((seg, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-slate-900/60 rounded px-2 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-slate-300 font-medium">
                  Segment {i + 1} · {seg.label}
                </span>
              </div>
              <span
                className={`font-mono font-bold ${
                  seg.addedMinutes === 0
                    ? "text-green-400"
                    : seg.addedMinutes < 10
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {seg.addedMinutes === 0 ? "—" : `+${seg.addedMinutes}m`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Turn-by-turn — hidden in compact mode */}
      {!compact && (
        <div className="p-3 space-y-2 border-b border-slate-800">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">
            Turn-by-turn
          </div>
          {visibleSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-cyan-400 text-sm mt-0.5">
                {step.maneuver === "arrive"
                  ? "🏁"
                  : step.maneuver.includes("left")
                  ? "⬅️"
                  : step.maneuver.includes("right")
                  ? "➡️"
                  : "⬆️"}
              </span>
              <div className="flex-1">
                <div className="text-slate-200">{step.instruction}</div>
                {step.distanceMeters > 0 && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    {(step.distanceMeters / 1000).toFixed(1)} km
                  </div>
                )}
              </div>
            </div>
          ))}
          {route.steps.length > 3 && (
            <button
              onClick={() => setShowAllSteps((v) => !v)}
              className="w-full text-[10px] text-cyan-400 hover:text-cyan-300 underline font-bold uppercase tracking-wider pt-1"
            >
              {showAllSteps
                ? "▲ Show fewer"
                : `▼ Show all ${route.steps.length} steps`}
            </button>
          )}
        </div>
      )}

      {/* Destination */}
      <div className="p-3 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏗️</span>
          <div className="flex-1">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
              Destination
            </div>
            <div className="text-sm text-slate-200 font-bold leading-tight">
              {siteName}
            </div>
            <div className="text-[9px] text-slate-500 font-mono mt-0.5">
              {siteLat!.toFixed(4)}, {siteLng!.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Full-screen navigation launcher — hidden in compact mode or when
            the parent renders its own launcher */}
        {!compact && !hideLauncher && onOpenFullScreen && (
          <button
            onClick={() => onOpenFullScreen()}
            className="mt-3 w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-3 rounded-lg uppercase tracking-widest text-sm transition flex items-center justify-center gap-2"
          >
            🗺️ OPEN NAVIGATION
          </button>
        )}
      </div>
    </div>
  );
}