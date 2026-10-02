"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { supabaseBrowser as supabase } from "@/app/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { fetchRoute, RouteResult } from "@/app/lib/routing";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

// FitBounds helper (same pattern as MiniMap)
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
        const hasFittedRef = require("react").useRef(false);

        useEffect(() => {
          if (!map || points.length === 0) return;
          // Only fit the bounds ONCE — the first time vehicles are loaded.
          // Subsequent updates should not move the user's view.
          if (hasFittedRef.current) return;
          hasFittedRef.current = true;

          try {
            if (points.length === 1) {
              map.setView(points[0], 12);
            } else {
              map.fitBounds(points as any, { padding: [60, 60], maxZoom: 12 });
            }
          } catch (e) {
            console.warn("[FleetRadar] fitBounds failed", e);
          }
        }, [map, points]);
        return null;
      };
    }),
  { ssr: false }
);

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

// ---- Vehicle row from manifests ----
type Vehicle = {
  manifest_group_id: string;
  driver_name: string | null;
  priority: string;
  driver_lat: number;
  driver_lng: number;
  driver_status: string | null;
  driver_last_update: string | null;
  current_state: string | null;
  // enriched fields for the popup:
  vehicle_plate: string | null;
  vehicle_trailer_type: string | null;
  vehicle_ownership: string | null;
  selected_scope: string | null;
  site_name: string | null;
  site_lat: number | null;
  site_lng: number | null;
  panels_count: number;
};

// ---- Status → color mapping ----
function getStatusColor(state: string | null | undefined, fallback: string | null) {
  const s = state || "";
  if (s.includes("REJECTED")) return "#ef4444";         // red
  if (s === "INSTALLATION_COMPLETED") return "#22c55e"; // green
  if (s.startsWith("INSTALLATION")) return "#a855f7";   // purple
  if (s.startsWith("RECEIVED_ON_SITE")) return "#22d3ee"; // cyan
  if (s === "GATE_IN_OFFLOADING" || s === "OFFLOADING_COMPLETED") return "#22d3ee";
  if (s === "ARRIVED_AT_GATE") return "#22d3ee";
  if (s.startsWith("DISPATCHED")) return "#3b82f6";     // blue (in transit)
  if (s === "LOADING_COMPLETED") return "#f59e0b";      // amber
  if (s === "LOADING_INITIATED") return "#f97316";      // orange
  if (s === "INITIALIZED") return "#f97316";            // orange
  // Fallback to driver_status
  if (fallback === "IN_TRANSIT") return "#3b82f6";
  if (fallback === "AT_FACTORY") return "#f97316";
  if (fallback === "ARRIVED") return "#22d3ee";
  if (fallback === "DELAYED") return "#ef4444";
  return "#64748b"; // slate
}
// ---- Haversine distance in metres ----
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

// ---- Very rough ETA estimate (assumes ~50 km/h avg) ----
function estimateEtaMinutes(
  lat: number,
  lng: number,
  siteLat: number | null,
  siteLng: number | null
): number | null {
  if (siteLat == null || siteLng == null) return null;
  const meters = haversineMeters([lat, lng], [siteLat, siteLng]);
  const minutes = (meters / 1000 / 50) * 60;
  return Math.max(1, Math.round(minutes));
}

function scopeLabel(scope: string | null | undefined): string {
  if (scope === "FULL") return "🔵 Full Service";
  if (scope === "FACTORY_ONLY") return "🏭 Factory Only";
  if (scope === "DELIVERY_ONLY") return "🚚 Delivery Only";
  return scope || "—";
}
function getStatusLabel(state: string | null | undefined, fallback: string | null) {
  const s = state || "";
  if (s.includes("REJECTED")) return "Rejected";
  if (s === "INSTALLATION_COMPLETED") return "Completed";
  if (s.startsWith("INSTALLATION")) return "Installing";
  if (s.startsWith("RECEIVED_ON_SITE")) return "On Site";
  if (s === "GATE_IN_OFFLOADING") return "Offloading";
  if (s === "OFFLOADING_COMPLETED") return "Offloaded";
  if (s === "ARRIVED_AT_GATE") return "At Gate";
  if (s.startsWith("DISPATCHED")) return "In Transit";
  if (s === "LOADING_COMPLETED") return "Loaded";
  if (s === "LOADING_INITIATED") return "Loading";
  if (s === "INITIALIZED") return "At Factory";
  if (fallback) return fallback;
  return "Unknown";
}

// ---- Icon factory ----
let iconsReady = false;
let leafletLib: any = null;

export default function FleetRadar({ isOpen, onClose }: Props) {
  const [L, setL] = useState<any>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route cache — keyed by manifest ID. Stores the last OSRM route
  // and the driver position it was computed from, so we don't refetch
  // on every tiny GPS jitter.
  const routesCacheRef = useRef<
    Record<
      string,
      {
        route: RouteResult;
        originLat: number;
        originLng: number;
        siteLat: number;
        siteLng: number;
      }
    >
  >({});
  const [routesVersion, setRoutesVersion] = useState(0);
  // Load leaflet once
  useEffect(() => {
    if (!isOpen) return;
    if (iconsReady) {
      setL(leafletLib);
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
    setL(leaflet);
    iconsReady = true;
  }, [isOpen]);

  // Load vehicles
  const loadVehicles = async () => {
    const { data: manifests } = await supabase
      .from("manifests")
      .select(
        "manifest_group_id, driver_name, priority, driver_current_lat, driver_current_lng, driver_status, driver_last_update, vehicle_plate, vehicle_trailer_type, vehicle_ownership, selected_scope, site_name, site_latitude, site_longitude, factories"
      );

    if (!manifests) return;

    const manifestIds = manifests.map((m) => m.manifest_group_id);

    // Get current state per manifest from assets
    const { data: assets } = await supabase
      .from("assets")
      .select("manifest_group_id, state")
      .in("manifest_group_id", manifestIds);

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

    const currentStateByManifest: Record<string, string> = {};
    const panelCountByManifest: Record<string, number> = {};

    (assets || []).forEach((row: any) => {
      const id = row.manifest_group_id;
      panelCountByManifest[id] = (panelCountByManifest[id] || 0) + 1;
      const prev = currentStateByManifest[id];
      if (prev === undefined || stateRank(row.state) < stateRank(prev)) {
        currentStateByManifest[id] = row.state;
      }
    });

    // Include ALL manifests. If the driver's GPS is missing, use the
    // first factory's coordinates so parked trucks still appear on the map.
    const vlist: Vehicle[] = manifests
      .map((m) => {
        // Parse factories JSON for fallback position
        let fallbackLat: number | null = null;
        let fallbackLng: number | null = null;
        try {
          const factories = typeof m.factories === "string"
            ? JSON.parse(m.factories)
            : m.factories;
          if (Array.isArray(factories) && factories.length > 0) {
            fallbackLat = factories[0]?.lat ?? null;
            fallbackLng = factories[0]?.lng ?? null;
          }
        } catch {}

        const hasLiveGps =
          m.driver_current_lat != null &&
          m.driver_current_lng != null &&
          !isNaN(m.driver_current_lat) &&
          !isNaN(m.driver_current_lng);

        const lat = hasLiveGps ? m.driver_current_lat : fallbackLat;
        const lng = hasLiveGps ? m.driver_current_lng : fallbackLng;

        if (lat == null || lng == null) {
          console.warn("[FleetRadar] dropping manifest", m.manifest_group_id, "— lat:", lat, "lng:", lng, "driverGPS:", hasLiveGps, "factory:", fallbackLat, fallbackLng);
          return null;
        }
        return {
          manifest_group_id: m.manifest_group_id,
          driver_name: m.driver_name,
          priority: m.priority,
          driver_lat: lat,
          driver_lng: lng,
          driver_status: m.driver_status,
          driver_last_update: m.driver_last_update,
          current_state: currentStateByManifest[m.manifest_group_id] || "INITIALIZED",
          vehicle_plate: m.vehicle_plate,
          vehicle_trailer_type: m.vehicle_trailer_type,
          vehicle_ownership: m.vehicle_ownership,
          selected_scope: m.selected_scope,
          site_name: m.site_name,
          site_lat: m.site_latitude,
          site_lng: m.site_longitude,
          panels_count: panelCountByManifest[m.manifest_group_id] || 0,
        } as Vehicle;
      })
      .filter((v): v is Vehicle => v !== null);

    setVehicles(vlist);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch OSRM routes for vehicles whenever the vehicle list changes.
  // Cache per manifest; only refetch if the driver moved >500m or the
  // destination changed.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const MIN_REFETCH_M = 500;

    const fetchAllRoutes = async () => {
      let cacheChanged = false;

      for (const v of vehicles) {
        if (cancelled) return;
        if (v.site_lat == null || v.site_lng == null) continue;

        const cached = routesCacheRef.current[v.manifest_group_id];
        const siteChanged =
          !cached ||
          Math.abs(cached.siteLat - v.site_lat) > 0.0001 ||
          Math.abs(cached.siteLng - v.site_lng) > 0.0001;

        let shouldFetch = siteChanged;
        if (!shouldFetch && cached) {
          const dLat = Math.abs(v.driver_lat - cached.originLat);
          const dLng = Math.abs(v.driver_lng - cached.originLng);
          const cosLat = Math.cos((v.driver_lat * Math.PI) / 180);
          const meters = Math.sqrt(
            (dLat * 111_000) ** 2 + (dLng * 111_000 * cosLat) ** 2
          );
          if (meters > MIN_REFETCH_M) shouldFetch = true;
        }

        if (!shouldFetch) continue;

        try {
          const route = await fetchRoute(
            [v.driver_lat, v.driver_lng],
            [v.site_lat, v.site_lng]
          );
          if (cancelled) return;
          routesCacheRef.current[v.manifest_group_id] = {
            route,
            originLat: v.driver_lat,
            originLng: v.driver_lng,
            siteLat: v.site_lat,
            siteLng: v.site_lng,
          };
          cacheChanged = true;
        } catch (err) {
          console.warn(
            "[FleetRadar] route fetch failed for",
            v.manifest_group_id,
            err
          );
        }
      }

      if (cacheChanged && !cancelled) {
        setRoutesVersion((x) => x + 1);
      }
    };

    // Small delay so we don't fire N calls immediately on mount
    const t = setTimeout(fetchAllRoutes, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isOpen, vehicles]);

  // Realtime — reload whenever manifests change
  useEffect(() => {
    if (!isOpen) return;

    const scheduleReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadVehicles();
      }, 400);
    };

    const channel = supabase
      .channel("fleet-radar-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manifests" },
        scheduleReload
      )
      .subscribe((status) => {
        console.log("[FleetRadar] Realtime:", status);
      });

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  // ---- Build marker icons per vehicle ----
  const buildVehicleIcon = (color: string) =>
    L?.divIcon({
      className: "fleet-radar-marker",
      html: `<div style="background:${color};width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 0 14px ${color}, 0 0 4px rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;font-size:14px;">🚚</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

  // ---- Build site (destination) icon ----
  const buildSiteIcon = () =>
    L?.divIcon({
      className: "fleet-radar-site-marker",
      html: `<div style="background:#ef4444;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 0 12px rgba(239,68,68,0.95), 0 0 4px rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:12px;">🏗️</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

  const allPoints: [number, number][] = [
    ...vehicles.map((v) => [v.driver_lat, v.driver_lng] as [number, number]),
    ...vehicles
      .filter((v) => v.site_lat != null && v.site_lng != null)
      .map((v) => [v.site_lat!, v.site_lng!] as [number, number]),
  ];
    // Spread stacked markers so each is individually tappable.
  // Same-position trucks get a small deterministic offset in a circle.
  const stackCounts: Record<string, number> = {};
  const positionsWithOffset: Record<string, [number, number]> = {};

  vehicles.forEach((v) => {
    const key = `${v.driver_lat.toFixed(5)}|${v.driver_lng.toFixed(5)}`;
    const idx = stackCounts[key] || 0;
    stackCounts[key] = idx + 1;

    // Small circular offset — 40m radius, evenly spaced
    const offsetDeg = 0.00035; // ~40m at UAE latitudes
    const angle = (idx * 2 * Math.PI) / 4; // up to 4 slots
    const offsetLat = Math.cos(angle) * offsetDeg;
    const offsetLng = Math.sin(angle) * offsetDeg;

    positionsWithOffset[v.manifest_group_id] = [
      v.driver_lat + offsetLat,
      v.driver_lng + offsetLng,
    ];
  });

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
          <span className="text-[9px] text-slate-500 font-mono ml-2">
            {vehicles.length} active vehicle{vehicles.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 px-3 py-1.5 rounded font-bold uppercase tracking-wider touch-manipulation"
        >
          ✕ Close
        </button>
      </div>

      {/* Map area */}
      <div className="relative flex-1">
        {!L ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            Loading map…
          </div>
        ) : vehicles.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-2">
            <div className="text-4xl">🛰️</div>
            <div className="text-xs text-amber-400 font-bold uppercase tracking-widest">
              No active vehicles
            </div>
            <div className="text-[10px] text-slate-500 italic">
              Waiting for the first driver GPS ping.
            </div>
          </div>
        ) : (
          <MapContainer
            center={allPoints[0]}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            dragging={true}
            zoomControl={true}
          >
            <FitBounds points={allPoints} />

            <TileLayer
              attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
              url={`https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${process.env.NEXT_PUBLIC_STADIA_API_KEY || ""}`}
            />

            {/* Site markers — one red pin per trip's destination */}
            {vehicles.map((v) => {
              if (v.site_lat == null || v.site_lng == null) return null;
              const siteIcon = buildSiteIcon();
              return (
                <Marker
                  key={`site-${v.manifest_group_id}`}
                  position={[v.site_lat, v.site_lng]}
                  icon={siteIcon}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[200px]">
                      <div className="font-black text-sm text-slate-900 border-b border-slate-300 pb-1 mb-1">
                        🏗️ Destination
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Trip:</span>
                        <span className="font-mono font-bold text-slate-900 text-[10px]">
                          {v.manifest_group_id}
                        </span>
                      </div>
                      {v.site_name && (
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">Site:</span>
                          <span className="font-bold text-slate-900 text-right max-w-[140px]">
                            {v.site_name}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Coordinates:</span>
                        <span className="font-mono text-[10px] text-slate-700">
                          {v.site_lat.toFixed(4)}, {v.site_lng.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Real OSRM routes from each truck to its destination */}
            {vehicles.map((v) => {
              if (v.site_lat == null || v.site_lng == null) return null;
              const cached = routesCacheRef.current[v.manifest_group_id];

              // If we have a real route, render it with a white outline
              // (same visual style as the worker mini-maps).
              if (cached && cached.route.coordinates.length > 1) {
                return (
                  <React.Fragment key={`route-${v.manifest_group_id}`}>
                    <Polyline
                      positions={cached.route.coordinates}
                      pathOptions={{
                        color: "#ffffff",
                        weight: 7,
                        opacity: 0.28,
                      }}
                    />
                    <Polyline
                      positions={cached.route.coordinates}
                      pathOptions={{
                        color: "#06b6d4",
                        weight: 4,
                        opacity: 0.9,
                      }}
                    />
                  </React.Fragment>
                );
              }

              // Fallback — dashed straight line while the route is loading
              return (
                <Polyline
                  key={`route-${v.manifest_group_id}`}
                  positions={[
                    [v.driver_lat, v.driver_lng],
                    [v.site_lat, v.site_lng],
                  ]}
                  pathOptions={{
                    color: "#06b6d4",
                    weight: 2,
                    opacity: 0.4,
                    dashArray: "6 8",
                  }}
                />
              );
            })}

            {vehicles.map((v) => {
              const color = getStatusColor(v.current_state, v.driver_status);
              const statusLabel = getStatusLabel(v.current_state, v.driver_status);
              const icon = buildVehicleIcon(color);
              const etaMinutes = estimateEtaMinutes(
                v.driver_lat,
                v.driver_lng,
                v.site_lat,
                v.site_lng
              );

              const lastUpdated = v.driver_last_update
                ? new Date(v.driver_last_update).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";

              return (
                <Marker
                  key={v.manifest_group_id}
                  position={
                    positionsWithOffset[v.manifest_group_id] || [
                      v.driver_lat,
                      v.driver_lng,
                    ]
                  }
                  icon={icon}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[200px]">
                      <div className="font-black text-sm text-slate-900 border-b border-slate-300 pb-1 mb-1">
                        🚚 {v.manifest_group_id}
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Plate:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {v.vehicle_plate || "—"}
                          {v.vehicle_trailer_type
                            ? ` · ${v.vehicle_trailer_type}`
                            : ""}
                        </span>
                      </div>

                      {v.vehicle_ownership && (
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">Ownership:</span>
                          <span
                            className={`font-bold ${
                              v.vehicle_ownership === "OWNED"
                                ? "text-green-700"
                                : "text-amber-700"
                            }`}
                          >
                            {v.vehicle_ownership}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Driver:</span>
                        <span className="font-bold text-slate-900">
                          {v.driver_name || "—"}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Panels:</span>
                        <span className="font-bold text-cyan-700">
                          {v.panels_count}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Scope:</span>
                        <span className="font-bold text-slate-900 text-[10px]">
                          {scopeLabel(v.selected_scope)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Status:</span>
                        <span
                          className="font-bold text-[10px] px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: color }}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3 border-t border-slate-200 pt-1 mt-1">
                        <span className="text-slate-500">ETA:</span>
                        <span className="font-bold text-slate-900">
                          {etaMinutes != null ? `${etaMinutes} min` : "—"}
                        </span>
                      </div>

                      {v.site_name && (
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">To:</span>
                          <span className="font-medium text-slate-700 text-[10px] text-right max-w-[120px] truncate">
                            {v.site_name}
                          </span>
                        </div>
                      )}

                      <div className="text-[9px] text-slate-400 text-center pt-1 border-t border-slate-200">
                        Updated {lastUpdated}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}
      </div>

      {/* Status color legend */}
      <div className="bg-slate-900/95 border-t border-slate-800 px-4 py-2 flex flex-wrap items-center gap-3 text-[9px] text-slate-400 font-mono justify-center">
        <LegendDot color="#f97316" label="At Factory" />
        <LegendDot color="#f59e0b" label="Loaded" />
        <LegendDot color="#3b82f6" label="In Transit" />
        <LegendDot color="#22d3ee" label="On Site" />
        <LegendDot color="#a855f7" label="Installing" />
        <LegendDot color="#22c55e" label="Completed" />
        <LegendDot color="#ef4444" label="Rejected" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}