"use client";
import React, { useEffect, useState, useRef } from "react";
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
const FitBounds = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      const { useMap } = m as any;
      return function FitBoundsInner({
        points,
      }: {
        points: [number, number][];
      }) {
        const map = useMap();
        useEffect(() => {
          if (!map || points.length < 2) return;
          const valid = points.filter(
            ([lat, lng]) =>
              typeof lat === "number" &&
              typeof lng === "number" &&
              !isNaN(lat) &&
              !isNaN(lng)
          );
          if (valid.length < 2) return;
          try {
            map.fitBounds(valid as any, {
              padding: [60, 60],
              maxZoom: 15,
            });
          } catch (e) {
            console.warn("[FullScreenNav] fitBounds failed", e);
          }
        }, [map, JSON.stringify(points)]);
        return null;
      };
    }),
  { ssr: false }
);
const FollowDriver = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      const { useMap } = m as any;
      return function FollowDriverInner({
        lat,
        lng,
      }: {
        lat: number;
        lng: number;
      }) {
        const map = useMap();
        useEffect(() => {
          if (!map || !lat || !lng) return;
          map.setView([lat, lng], 17, { animate: true });
        }, [map, lat, lng]);
        return null;
      };
    }),
  { ssr: false }
);
type Props = {
  isOpen: boolean;
  onClose: () => void;
  driverLat: number | null;
  driverLng: number | null;
  driverHeading?: number | null;
  driverLastUpdate?: string | null;
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
  driverHeading,
  driverLastUpdate,
  siteLat,
  siteLng,
  siteName,
  vehiclePlate,
  manifestGroupId,
  onDelayLogged,
}: Props) {
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayBusy, setDelayBusy] = useState(false);
    const [stepsOpen, setStepsOpen] = useState(false);
  const [L, setL] = useState<any>(null);
  const [icons, setIcons] = useState<{
    driverIcon: any;
    siteIcon: any;
  }>({ driverIcon: null, siteIcon: null });

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [traffic, setTraffic] = useState<TrafficSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const mapRef = useRef<any>(null); // <-- ADD THIS

  // Ticker to update "now" every 5 seconds for GPS staleness check
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);
  
  // If no GPS for over 30s, show warning. (Requires passing lastUpdate as a prop)
  // (Map rotation is handled by the CSS transform on the map container)

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

  // Fetch the route, but only recalculate if the driver moved > 50 meters
  const lastRouteCoords = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (driverLat == null || driverLng == null || siteLat == null || siteLng == null)
      return;

    // Check distance moved since last fetch
    let shouldFetch = false;
    if (!lastRouteCoords.current) {
      shouldFetch = true;
    } else {
      const dLat = driverLat - lastRouteCoords.current[0];
      const dLng = driverLng - lastRouteCoords.current[1];
      const distMeters = Math.sqrt((dLat * 111000) ** 2 + (dLng * 111000) ** 2);
      if (distMeters > 50) shouldFetch = true; // Recalculate every 50 meters
    }

    if (!shouldFetch) return;

    let cancelled = false;
    setLoading(true);
    lastRouteCoords.current = [driverLat, driverLng];

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
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col isolate">
          {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-[10000] relative">
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
      {/* GPS Signal Lost Warning */}
      {driverLastUpdate && (now - new Date(driverLastUpdate).getTime() > 30000) && (
        <div className="absolute top-36 left-6 right-6 z-[10000] bg-red-950/95 border-2 border-red-500 text-white font-bold text-center p-3 rounded-xl shadow-2xl animate-pulse">
          ⚠️ GPS SIGNAL LOST<br/>
          <span className="text-[10px] font-normal opacity-80">Please check your phone settings.</span>
        </div>
      )}
      {!delayOpen && (
      
         <button
          onClick={() => setDelayOpen(true)}
          className="absolute top-32 right-3 z-[10002] bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black py-2 px-3 rounded-full shadow-2xl border-2 border-amber-300 flex items-center gap-1.5"
        >
          ⚠️ Log Delay
        </button>
      )}
      {/* View All Steps floating button — top-left, opposite the Log Delay button */}
      {!delayOpen && !stepsOpen && (
        <button
          onClick={() => setStepsOpen(true)}
          className="absolute top-32 left-14 z-[10002] bg-slate-800/95 hover:bg-slate-700 text-cyan-300 text-xs font-black py-2 px-3 rounded-full shadow-2xl border border-cyan-700/60 flex items-center gap-1.5"
        >
          📋 View All Steps
        </button>
      )}
      {delayOpen && (
        <div className="absolute inset-0 z-[10002] bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center p-6">
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
const { supabaseBrowser: supabase } = await import("@/app/lib/supabase-browser");
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
      {/* All Steps bottom sheet */}
      {stepsOpen && (
        <div className="absolute inset-x-0 bottom-0 z-[10002] bg-slate-900/98 backdrop-blur border-t-2 border-cyan-800/60 rounded-t-2xl max-h-[60vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <span className="text-xs font-black tracking-widest text-cyan-300 uppercase">
                All Turn-by-Turn Steps
              </span>
              {route && (
                <span className="text-[9px] text-slate-500 font-mono ml-2">
                  {route.steps.length} step{route.steps.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <button
              onClick={() => setStepsOpen(false)}
              className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1 rounded font-bold uppercase tracking-wider transition"
            >
              ✕ Close
            </button>
          </div>

          {/* Steps list */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {!route ? (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                Route not yet computed.
              </div>
            ) : route.steps.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                No steps available.
              </div>
            ) : (
              <div className="space-y-1">
                {route.steps.map((step, i) => {
                  const isCurrent = i === 0; // first step is the "next" one
                  const distKm = step.distanceMeters > 0
                    ? (step.distanceMeters / 1000).toFixed(2)
                    : null;

                  const instructionLower = step.instruction.toLowerCase();
                  const icon =
                    step.maneuver === "arrive"
                      ? "🏁"
                      : instructionLower.includes("left")
                      ? "⬅️"
                      : instructionLower.includes("right")
                      ? "➡️"
                      : instructionLower.includes("roundabout")
                      ? "🔄"
                      : "⬆️";

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition ${
                        isCurrent
                          ? "bg-cyan-950/40 border border-cyan-800/60"
                          : "hover:bg-slate-800/50 border border-transparent"
                      }`}
                    >
                      <span className="text-xl mt-0.5 shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-base ${
                            isCurrent
                              ? "text-cyan-200 font-bold"
                              : "text-slate-200"
                          }`}
                        >
                          {(() => {
                            let txt = step.instruction;
                            if (/[\u0600-\u06FF]/.test(txt)) {
                              txt = txt.replace(/(?:onto|to|on|via)\s+.*/, "").trim();
                              if (!txt) txt = "Continue on route";
                            }
                            return txt;
                          })()}
                        </div>
                        {distKm && (
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {isCurrent ? "In " : ""}
                            {distKm} km
                          </div>
                        )}
                      </div>
                      {isCurrent && (
                        <span className="text-[8px] bg-cyan-500 text-slate-950 font-black px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                          Next
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      {/* Recenter Button — bottom right of map */}
      {hasCoords && (
        <button
          onClick={() => {
            if (driverLat && driverLng && mapRef.current) {
              mapRef.current.setView([driverLat, driverLng], 16, { animate: true });
            }
          }}
          className="absolute bottom-32 right-3 z-[10002] bg-slate-800 hover:bg-slate-700 text-cyan-400 p-3 rounded-full shadow-2xl border border-slate-700 active:scale-95 transition-transform"
          title="Recenter Map"
        >
          🎯
        </button>
      )}
          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-800 text-[9px] text-slate-500 text-center font-mono">
            {route ? (
              <>
                Total: {route.steps.length} step{route.steps.length === 1 ? "" : "s"} ·{" "}
                {(route.distanceMeters / 1000).toFixed(1)} km ·{" "}
                {Math.round(route.durationSeconds / 60)} min
              </>
            ) : (
              "Waiting for route data"
            )}
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
            zoom={16}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            dragging={true}
            zoomControl={false}
                        ref={mapRef} // <-- ADD THIS
          >
            {driverLat != null && driverLng != null && (
              <FollowDriver lat={driverLat} lng={driverLng} />
            )}
            <TileLayer
              attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
              url={`https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${process.env.NEXT_PUBLIC_STADIA_API_KEY || ""}`}
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
          <div className="absolute top-3 left-14 right-14 bg-slate-900/95 backdrop-blur border border-cyan-800/50 rounded-xl p-3 shadow-2xl z-[10001]">
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

        {/* Next-step bottom banner — Tap to expand */}
        {route && route.steps.length > 0 && (() => {
          // For the pilot, we show the first step in the list.
          // (A true dynamic step index requires deeper OSRM geometry parsing).
          const activeStep = route.steps[0];
          
          const instructionLower = activeStep.instruction.toLowerCase();
          const icon = 
            activeStep.maneuver === "arrive" ? "🏁" :
            instructionLower.includes("left") ? "⬅️" :
            instructionLower.includes("right") ? "➡️" :
            instructionLower.includes("roundabout") ? "🔄" :
            "⬆️";

          let instruction = activeStep.instruction;
          if (/[\u0600-\u06FF]/.test(instruction)) {
            instruction = instruction.replace(/(?:onto|to|on|via)\s+.*/, "").trim();
            if (!instruction) instruction = "Continue on route";
          }

          return (
            <div 
              className="absolute bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t-2 border-cyan-500/50 px-6 py-6 z-[10001] rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.8)] cursor-pointer active:scale-95 transition-transform"
              onClick={() => setStepsOpen(true)}
            >
              <div className="flex items-center gap-6">
                <span className="text-6xl text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                  {icon}
                </span>
                <div className="flex-1">
                  <div className="text-2xl text-slate-100 font-bold leading-tight">
                    {instruction}
                  </div>
                  {activeStep.distanceMeters > 0 && (
                    <div className="text-sm text-cyan-500 font-mono mt-1 font-bold">
                      in {(activeStep.distanceMeters / 1000).toFixed(1)} km
                    </div>
                  )}
                </div>
              </div>
              {vehiclePlate && (
                <div className="mt-1 text-[9px] text-slate-500 font-mono text-center">
                  Vehicle {vehiclePlate} · Tap for all steps
                </div>
              )}
            </div>
          );
        })()}
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
    html: `<div id="sokrat-driver-arrow" style="background:#06b6d4;width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 0 16px rgba(6,182,212,1);display:flex;align-items:center;justify-content:center;font-size:20px;">⬆️</div>`,    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
  const siteIcon = leaflet.divIcon({
    className: "custom-site-marker",
    html: `<div style="background:#ef4444;width:34px;height:34px;border-radius:50%;border:3px solid white;box-shadow:0 0 16px rgba(239,68,68,1);display:flex;align-items:center;justify-content:center;font-size:16px;">🏗️</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
  return { driverIcon, siteIcon };
}