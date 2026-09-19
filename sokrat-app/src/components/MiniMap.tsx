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
  driverStatus?: string | null;
  siteLat: number;
  siteLng: number;
  siteName: string;
  height?: string;
  showTraffic?: boolean;
};

export default function MiniMap({
  driverLat,
  driverLng,
  driverStatus,
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

  const center: [number, number] =
    driverLat && driverLng
      ? [(driverLat + siteLat) / 2, (driverLng + siteLng) / 2]
      : [siteLat, siteLng];

  // Route with simulated traffic segments
  const fullRoute: [number, number][] = [];
  if (driverLat && driverLng) {
    fullRoute.push([driverLat, driverLng]);
  }
  fullRoute.push([siteLat, siteLng]);

  const getStatusLabel = () => {
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

          {driverLat && driverLng && icons.driverIcon && (
            <Marker position={[driverLat, driverLng]} icon={icons.driverIcon}>
              <Popup>
                <div className="text-xs">
                  <strong>🚚 Driver</strong>
                  <br />
                  {driverLat.toFixed(4)}, {driverLng.toFixed(4)}
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