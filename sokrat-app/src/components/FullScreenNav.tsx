"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);

import {
  fetchRoute,
  simulateTraffic,
  computeETA,
  RouteResult,
  TrafficSegment,
} from "@/app/lib/routing";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  driverLat: number | null;
  driverLng: number | null;
  siteLat: number | null;
  siteLng: number | null;
  siteName: string;
  vehiclePlate?: string | null;
  manifestGroupId?: string | null;
  onDelayLogged?: (reason: string, minutes: number) => void;
};

// Force leaflet to re-bind icons after mount
let iconsReady = false;
let leafletLib: any = null;

const DELAY_REASONS = [
  "Traffic Congestion",
  "Route Diversion",
  "Weighbridge Inspection Delay",
  "Safety Stoppage",
];

export default function FullScreenNav({
  isOpen,
  onClose,
  driverLat,
  driverLng,
  siteLat,
  siteLng,
  siteName,
  vehiclePlate,
  manifestGroupId,
  onDelayLogged,
}: Props) {
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayBusy, setDelayBusy] = useState(false);
  const [L, setL] = useState<any>(null);
  const [icons, setIcons] = useState<{
    driverIcon: any;
    siteIcon: any;
  }>({ driverIcon: null, siteIcon: null });

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [traffic, setTraffic] = useState<TrafficSegment[]>([]);
  const [loading, setLoading] = useState(false);

  // Load leaflet only in the browser
  useEffect(() => {
    if (!isOpen) return;
    if (iconsReady) {
      setL(leafletLib);
      setIcons(rebuildIcons(leafletLib));
      return;
    }
    const leaflet = require("leaflet");
    leafletLib = leaflet;
    delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
    leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    });
    const built = rebuildIcons(leaflet);
    setL(leaflet);
    setIcons(built);
    iconsReady = true;
  }, [isOpen]);

  // Fetch the route
  useEffect(() => {
    if (!isOpen) return;
    if (driverLat == null || driverLng == null || siteLat == null || siteLng == null)
      return;
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
  }, [isOpen, driverLat, driverLng, siteLat, siteLng]);

  if (!isOpen) return null;

  const hasCoords =
    driverLat != null && driverLng != null && siteLat != null && siteLng != null;

  const eta = route ? computeETA(route, traffic) : null;
  const center: [number, number] = hasCoords
    ? [(driverLat! + siteLat!) / 2, (driverLng! + siteLng!) / 2]
    : [24.48, 54.43];

  const fullRoute: [number, number][] = [];
  if (hasCoords) fullRoute.push([driverLat!, driverLng!]);
  if (siteLat != null && siteLng != null) fullRoute.push([siteLat, siteLng]);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-[201]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚚</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Navigating to
            </div>
            <div className="text-sm font-bold text-slate-100">{siteName}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 px-3 py-1.5 rounded font-bold uppercase tracking-wider"
        >
          ✕ Close
        </button>
      </div>
            {/* Log Delay floating button + overlay — visible on top of the map */}
      {!delayOpen && (
        <button
          onClick={() => setDelayOpen(true)}
          className="absolute top-20 right-3 z-[500] bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black py-2 px-3 rounded-full shadow-2xl border-2 border-amber-300 flex items-center gap-1.5"
        >
          ⚠️ Log Delay
        </button>
      )}

      {delayOpen && (
        <div className="absolute inset-0 z-[600] bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-1">⚠️</div>
              <div className="text-sm font-black text-amber-400 uppercase tracking-widest">
                Log Delay
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Adds +15 min to transit time
              </div>
            </div>

            <div className="space-y-2">
              {DELAY_REASONS.map((reason) => (
                <button
                  key={reason}
                  disabled={delayBusy}
                  onClick={async () => {
                    setDelayBusy(true);
                    try {
                      const { supabase } = await import("@/app/lib/supabase");
                      const now = new Date().toISOString();

                      // Update all assets for this manifest:
                      // bump transit_delay_minutes and log to custody history
                      if (manifestGroupId) {
                        const { data: rows } = await supabase
                          .from("assets")
                          .select("asset_serial, transit_delay_minutes, custody_history")
                          .eq("manifest_group_id", manifestGroupId);

                        for (const row of rows || []) {
                          const priorMin = row.transit_delay_minutes || 0;
                          const priorLog = row.custody_history || [];
                          await supabase
                            .from("assets")
                            .update({
                              transit_delay_minutes: priorMin + 15,
                              delay_reason: reason,
                              custody_history: [
                                ...priorLog,
                                {
                                  timestamp: now,
                                  state: `TRANSIT_DELAY_(${reason
                                    .toUpperCase()
                                    .replace(/\s+/g, "_")})`,
                                  custody: "TRANSIT LOGISTICS (Driver)",
                                },
                              ],
                            })
                            .eq("asset_serial", row.asset_serial)
                            .eq("manifest_group_id", manifestGroupId);
                        }
                      }

                      onDelayLogged?.(reason, 15);
                      setDelayOpen(false);
                      setDelayBusy(false);
                    } catch (err) {
                      console.error("Failed to log delay:", err);
                      setDelayBusy(false);
                    }
                  }}
                  className="w-full text-left bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm font-bold py-3 px-4 rounded-lg border border-slate-700 transition"
                >
                  {reason}
                </button>
              ))}
            </div>

            <button
              onClick={() => setDelayOpen(false)}
              disabled={delayBusy}
              className="w-full text-xs text-slate-400 hover:text-slate-200 py-2 disabled:opacity-50"
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Map fills the rest */}
      <div className="relative flex-1">
        {!hasCoords ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-2">
            <div className="text-4xl">📍</div>
            <div className="text-sm text-amber-400 font-bold uppercase tracking-wider">
              Awaiting coordinates
            </div>
            <div className="text-[10px] text-slate-500">
              Site GPS not yet shared by inspector or RAMCO.
            </div>
          </div>
        ) : !L ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            Loading map…
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            dragging={true}
            zoomControl={true}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains={["a", "b", "c", "d"]}
            />

            {/* Route: colored traffic segments */}
            {route && route.coordinates.length > 1 && traffic.length > 0
              ? traffic.map((seg, i) => (
                  <Polyline
                    key={i}
                    positions={route.coordinates.slice(
                      seg.startIndex,
                      seg.endIndex + 1
                    )}
                    pathOptions={{
                      color: seg.color,
                      weight: 6,
                      opacity: 0.9,
                    }}
                  />
                ))
              : fullRoute.length > 1 && (
                  <Polyline
                    positions={fullRoute}
                    pathOptions={{ color: "#06b6d4", weight: 5, opacity: 0.9 }}
                  />
                )}

            {/* Driver */}
            {icons.driverIcon && (
              <Marker
                position={[driverLat!, driverLng!]}
                icon={icons.driverIcon}
              />
            )}

            {/* Site */}
            {icons.siteIcon && (
              <Marker position={[siteLat!, siteLng!]} icon={icons.siteIcon} />
            )}
          </MapContainer>
        )}

        {/* Floating ETA badge */}
        {eta && (
          <div className="absolute top-3 left-3 right-3 bg-slate-900/95 backdrop-blur border border-cyan-800/50 rounded-xl p-3 shadow-2xl z-[400]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                  ETA
                </div>
                <div className="text-2xl font-black text-cyan-300 leading-none">
                  {eta.etaMinutes}
                  <span className="text-sm font-bold text-cyan-500 ml-1">min</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                  Arrival
                </div>
                <div className="text-xl font-black text-slate-100 leading-none">
                  {eta.etaTimestamp.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                  Distance
                </div>
                <div className="text-sm font-bold text-slate-300">
                  {route ? (route.distanceMeters / 1000).toFixed(1) : "—"} km
                </div>
              </div>
            </div>
            {eta.addedMinutes > 0 && (
              <div className="mt-1 text-[10px] text-amber-400 font-mono">
                ⚠ Traffic adds +{eta.addedMinutes} min
              </div>
            )}
          </div>
        )}

        {/* Next-step bottom banner */}
        {route && route.steps.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-cyan-800/50 px-4 py-3 z-[400]">
            <div className="flex items-center gap-3">
              <span className="text-3xl text-cyan-300">
                {route.steps[0].maneuver === "arrive"
                  ? "🏁"
                  : route.steps[0].maneuver.includes("left")
                  ? "⬅️"
                  : route.steps[0].maneuver.includes("right")
                  ? "➡️"
                  : "⬆️"}
              </span>
              <div className="flex-1">
                <div className="text-sm text-slate-100 font-bold">
                  {route.steps[0].instruction}
                </div>
                {route.steps[0].distanceMeters > 0 && (
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    in {(route.steps[0].distanceMeters / 1000).toFixed(1)} km
                  </div>
                )}
              </div>
            </div>
            {vehiclePlate && (
              <div className="mt-1 text-[9px] text-slate-500 font-mono text-center">
                Vehicle {vehiclePlate} · Route via{" "}
                {route.source === "OSRM" ? "live roads" : "fallback"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Icon factory
// ------------------------------------------------------------
function rebuildIcons(leaflet: any) {
  const driverIcon = leaflet.divIcon({
    className: "custom-driver-marker",
    html: `<div style="background:#06b6d4;width:34px;height:34px;border-radius:50%;border:3px solid white;box-shadow:0 0 16px rgba(6,182,212,1);display:flex;align-items:center;justify-content:center;font-size:16px;">🚚</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
  const siteIcon = leaflet.divIcon({
    className: "custom-site-marker",
    html: `<div style="background:#ef4444;width:34px;height:34px;border-radius:50%;border:3px solid white;box-shadow:0 0 16px rgba(239,68,68,1);display:flex;align-items:center;justify-content:center;font-size:16px;">🏗️</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
  return { driverIcon, siteIcon };
}