"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);

const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);

const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);

type Props = {
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  originLat?: number | null | undefined;
  originLng?: number | null | undefined;
  originLabel?: string;
  driverStatus?: string | null;
  currentState?: string | null;
  siteLat: number;
  siteLng: number;
  siteName: string;
  height?: string;
  showTraffic?: boolean;
};

export default function MiniMap({
  driverLat,
  driverLng,
  originLat,
  originLng,
  originLabel = "Origin",
  driverStatus,
  currentState,
  siteLat,
  siteLng,
  siteName,
  height = "180px",
  showTraffic = true,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [L, setL] = useState<any>(null);
  const [icons, setIcons] = useState<{
    driverIcon: any;
    siteIcon: any;
  }>({ driverIcon: null, siteIcon: null });

  useEffect(() => {
    // Load Leaflet only in the browser
    const leaflet = require("leaflet");
    setL(leaflet);

    // Fix Leaflet default marker icons
    delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
    leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    });

    // Create custom icons
    const driverIcon = leaflet.divIcon({
      className: "custom-driver-marker",
      html: `<div style="background: #06b6d4; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(6, 182, 212, 0.9); display: flex; align-items: center; justify-content: center; font-size: 12px;">🚚</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const siteIcon = leaflet.divIcon({
      className: "custom-site-marker",
      html: `<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px rgba(239, 68, 68, 0.9); display: flex; align-items: center; justify-content: center; font-size: 12px;">🏗️</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    setIcons({ driverIcon, siteIcon });
    setMounted(true);
  }, []);

  if (!mounted || !L) {
    return (
      <div
        className="bg-slate-900 border border-slate-700 rounded flex items-center justify-center"
        style={{ height }}
      >
        <span className="text-[8px] text-slate-500">Loading map...</span>
      </div>
    );
  }

  // Which origin do we use?
  //   1. Driver's live GPS if available
  //   2. Fallback origin (typically the factory) if provided
  //   3. Site (no line drawn)
  const useDriver = driverLat != null && driverLng != null;
  const useFallback = !useDriver && originLat != null && originLng != null;

  const originPoint: [number, number] | null = useDriver
    ? [driverLat!, driverLng!]
    : useFallback
    ? [originLat!, originLng!]
    : null;

  const center: [number, number] = originPoint
    ? [(originPoint[0] + siteLat) / 2, (originPoint[1] + siteLng) / 2]
    : [siteLat, siteLng];

  // Build the polyline
  const fullRoute: [number, number][] = [];
  if (originPoint) fullRoute.push(originPoint);
  fullRoute.push([siteLat, siteLng]);

  const getStatusLabel = () => {
    // Derive from the actual custody state (source of truth).
    // Fall back to driver_status only if no state was passed.
    const s = currentState || "";

    if (s.includes("REJECTED"))
      return { text: "⛔ Rejected", color: "bg-red-950/60 text-red-400" };
    if (s === "INITIALIZED" || s.startsWith("LOADING"))
      return { text: "🏭 At Factory", color: "bg-orange-950/50 text-orange-400" };
    if (s.startsWith("DISPATCHED"))
      return { text: "🚚 In Transit", color: "bg-amber-950/50 text-amber-400" };
    if (s === "ARRIVED_AT_GATE")
      return { text: "📍 At Gate", color: "bg-blue-950/50 text-blue-400" };
    if (s.startsWith("RECEIVED_ON_SITE") || s.includes("OFFLOADING"))
      return { text: "🏗️ On Site", color: "bg-cyan-950/50 text-cyan-400" };
    if (s.startsWith("INSTALLATION"))
      return { text: "🔧 Installing", color: "bg-purple-950/50 text-purple-400" };
    if (s === "INSTALLATION_COMPLETED")
      return { text: "✅ Complete", color: "bg-green-950/50 text-green-400" };

    // Fallback to driver_status
    if (driverStatus === "AT_FACTORY")
      return { text: "🏭 At Factory", color: "bg-blue-950/50 text-blue-400" };
    if (driverStatus === "IN_TRANSIT")
      return { text: "🚚 In Transit", color: "bg-amber-950/50 text-amber-400" };
    if (driverStatus === "ARRIVED")
      return { text: "📍 Arrived", color: "bg-green-950/50 text-green-400" };
    if (driverStatus === "DELAYED")
      return { text: "⚠️ Delayed", color: "bg-red-950/50 text-red-400" };
    return { text: "❓ Unknown", color: "bg-slate-800 text-slate-400" };
  };

  const status = getStatusLabel();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[8px]">
        <span className={`px-1.5 py-0.5 rounded font-bold ${status.color}`}>
          {status.text}
        </span>
        {driverLat && driverLng ? (
          <span className="text-slate-500 font-mono">
            {driverLat.toFixed(3)}, {driverLng.toFixed(3)}
          </span>
        ) : (
          <span className="text-slate-500 italic">GPS pending</span>
        )}
      </div>

      <div
        className="w-full rounded overflow-hidden border border-slate-700 relative"
        style={{ height }}
      >
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
            url="https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
            subdomains={["a", "b", "c"]}
          />

          {showTraffic && fullRoute.length > 1 && (
            <>
              <Polyline
                positions={fullRoute}
                pathOptions={{ color: "#ef4444", weight: 6, opacity: 0.7 }}
              />
              <Polyline
                positions={fullRoute}
                pathOptions={{ color: "#f97316", weight: 4, opacity: 0.5 }}
              />
              <Polyline
                positions={fullRoute}
                pathOptions={{ color: "#22c55e", weight: 2, opacity: 0.9 }}
              />
            </>
          )}

          {!showTraffic && fullRoute.length > 1 && (
            <Polyline
              positions={fullRoute}
              pathOptions={{ color: "#06b6d4", weight: 4, opacity: 0.9 }}
            />
          )}

          {/* Live driver marker */}
          {useDriver && icons.driverIcon && (
            <Marker position={[driverLat!, driverLng!]} icon={icons.driverIcon}>
              <Popup>
                <div className="text-xs">
                  <strong>🚚 Driver (live)</strong>
                  <br />
                  {driverLat!.toFixed(4)}, {driverLng!.toFixed(4)}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Fallback origin marker (factory) — shown when driver GPS not yet available */}
          {useFallback && icons.driverIcon && (
            <Marker position={[originLat!, originLng!]} icon={icons.driverIcon}>
              <Popup>
                <div className="text-xs">
                  <strong>🏭 {originLabel}</strong>
                  <br />
                  {originLat!.toFixed(4)}, {originLng!.toFixed(4)}
                </div>
              </Popup>
            </Marker>
          )}

          {icons.siteIcon && (
            <Marker position={[siteLat, siteLng]} icon={icons.siteIcon}>
              <Popup>
                <div className="text-xs">
                  <strong>🏗️ {siteName}</strong>
                  <br />
                  {siteLat.toFixed(4)}, {siteLng.toFixed(4)}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {showTraffic && (
          <div className="absolute bottom-1 left-1 bg-slate-900/90 border border-slate-700 rounded px-1.5 py-0.5 text-[7px] text-slate-300 z-[400]">
            <span className="inline-block w-2 h-0.5 bg-red-500 align-middle mr-1"></span>Heavy
            <span className="inline-block w-2 h-0.5 bg-orange-500 align-middle ml-2 mr-1"></span>Med
            <span className="inline-block w-2 h-0.5 bg-green-500 align-middle ml-2 mr-1"></span>Clear
          </div>
        )}
      </div>
    </div>
  );
}