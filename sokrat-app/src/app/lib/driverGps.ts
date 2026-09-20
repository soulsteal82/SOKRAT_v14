// ============================================================
// SOKRAT — Driver live GPS broadcasting
//
// When enabled, uses the browser's geolocation watchPosition API
// to stream the driver's position to Supabase every ~12 seconds.
//
// Only used by the Driver node while a dispatched trip is open.
// ============================================================

import { supabase } from "./supabase";

export type DriverGpsHandle = {
  stop: () => void;
};

export function startDriverGpsBroadcast(
  manifestGroupId: string,
  onUpdate?: (lat: number, lng: number, accuracy: number) => void
): DriverGpsHandle {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    console.warn("[driverGps] geolocation unavailable");
    return { stop: () => {} };
  }

  let lastPush = 0;
  const MIN_INTERVAL_MS = 12_000;

  const watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;

      // Throttle: at most one push every 12s
      const now = Date.now();
      if (now - lastPush < MIN_INTERVAL_MS) return;
      lastPush = now;

      const { error } = await supabase
        .from("manifests")
        .update({
          driver_current_lat: latitude,
          driver_current_lng: longitude,
          driver_last_update: new Date().toISOString(),
          driver_status: "IN_TRANSIT",
        })
        .eq("manifest_group_id", manifestGroupId);

      if (error) {
        console.warn("[driverGps] push failed:", error.message);
      } else {
        onUpdate?.(latitude, longitude, accuracy);
      }
    },
    (err) => {
      console.warn("[driverGps] watch error:", err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    }
  );

  return {
    stop: () => navigator.geolocation.clearWatch(watchId),
  };
}