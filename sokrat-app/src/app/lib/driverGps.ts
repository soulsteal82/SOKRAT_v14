// ============================================================
// SOKRAT — Driver GPS broadcast (v2)
//
// Two modes, both write to Supabase:
//   1. Real mode   — uses navigator.geolocation.watchPosition
//   2. Demo mode   — if GPS denied/unavailable, generates a synthetic
//                    position moving from factory to site over 3 minutes
//
// This keeps the whole pipeline alive in demos where the browser
// blocks the geolocation prompt.
// ============================================================

import { supabase } from "./supabase";

export type DriverGpsHandle = {
  stop: () => void;
};

type Options = {
  manifestGroupId: string;
  factoryLat?: number | null;
  factoryLng?: number | null;
  siteLat?: number | null;
  siteLng?: number | null;
  onUpdate?: (lat: number, lng: number, source: "REAL" | "DEMO") => void;
};

const REAL_PUSH_INTERVAL_MS = 12_000;   // real GPS: push every 12s
const DEMO_PUSH_INTERVAL_MS = 4_000;    // demo heartbeat: push every 4s
const DEMO_TOTAL_DURATION_MS = 180_000; // 3-minute synthetic sweep

export function startDriverGpsBroadcast(
  manifestGroupIdOrOptions: string | Options,
  onUpdateLegacy?: (lat: number, lng: number, accuracy: number) => void
): DriverGpsHandle {
  // ---- Backwards-compat: allow the old (manifestGroupId, cb) signature ----
  const opts: Options =
    typeof manifestGroupIdOrOptions === "string"
      ? { manifestGroupId: manifestGroupIdOrOptions }
      : manifestGroupIdOrOptions;

  const manifestGroupId = opts.manifestGroupId;

  let stopped = false;
  let watchId: number | null = null;
  let realLastPush = 0;
  let demoStart = Date.now();

  // -----------------------------------------------------------
  // Helper: write coordinates to Supabase
  // -----------------------------------------------------------
  const push = async (lat: number, lng: number) => {
    if (stopped) return;
    const { error } = await supabase
      .from("manifests")
      .update({
        driver_current_lat: lat,
        driver_current_lng: lng,
        driver_last_update: new Date().toISOString(),
        driver_status: "IN_TRANSIT",
      })
      .eq("manifest_group_id", manifestGroupId);

    if (error) {
      console.warn("[driverGps] push failed:", error.message);
    } else {
      console.log(
        `[driverGps] pushed ${lat.toFixed(4)}, ${lng.toFixed(4)} for ${manifestGroupId}`
      );
      opts.onUpdate?.(lat, lng, "REAL");
      onUpdateLegacy?.(lat, lng, 0);
    }
  };

  // -----------------------------------------------------------
  // Demo fallback — synthetic position between factory and site
  // -----------------------------------------------------------
  const startDemoLoop = () => {
    console.log("[driverGps] starting DEMO synthetic sweep");
    const fromLat = opts.factoryLat ?? 24.4539;
    const fromLng = opts.factoryLng ?? 54.3773;
    const toLat = opts.siteLat ?? 24.5387;
    const toLng = opts.siteLng ?? 54.5678;

    demoStart = Date.now();

    const timer = setInterval(() => {
      if (stopped) {
        clearInterval(timer);
        return;
      }
      const t = Math.min(1, (Date.now() - demoStart) / DEMO_TOTAL_DURATION_MS);
      const lat = fromLat + (toLat - fromLat) * t;
      const lng = fromLng + (toLng - fromLng) * t;
      push(lat, lng);
      if (t >= 1) {
        console.log("[driverGps] demo sweep complete");
        clearInterval(timer);
      }
    }, DEMO_PUSH_INTERVAL_MS);

    // Return a stopper
    return () => clearInterval(timer);
  };

  let demoStop: (() => void) | null = null;

  // -----------------------------------------------------------
  // Try real GPS first
  // -----------------------------------------------------------
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (stopped) return;
        const now = Date.now();
        if (now - realLastPush < REAL_PUSH_INTERVAL_MS) return;
        realLastPush = now;
        await push(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.warn("[driverGps] real GPS error:", err.message);
        console.warn("[driverGps] falling back to DEMO synthetic sweep");
        if (!demoStop) demoStop = startDemoLoop();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    // If we haven't received a real GPS update within 5 seconds,
    // fall back to demo mode (covers permission-denied, timeouts, etc.)
    const fallbackTimer = setTimeout(() => {
      if (!stopped && realLastPush === 0 && !demoStop) {
        console.log("[driverGps] no real GPS received in 5s — starting demo fallback");
        demoStop = startDemoLoop();
      }
    }, 5000);

    return {
      stop: () => {
        stopped = true;
        clearTimeout(fallbackTimer);
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (demoStop) demoStop();
      },
    };
  }

  // No geolocation API at all → go straight to demo
  demoStop = startDemoLoop();
  return {
    stop: () => {
      stopped = true;
      if (demoStop) demoStop();
    },
  };
}