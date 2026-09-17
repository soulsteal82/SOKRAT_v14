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

import L from "leaflet";

if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
}

const driverIcon = typeof window !== "undefined"
  ? L.divIcon({
      className: "custom-driver-marker",
      html: `<div style="background: #06b6d4; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(6, 182, 212, 0.8); display: flex; align-items: center; justify-content: center; font-size: 11px;">🚚</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })
  : null;

const siteIcon = typeof window !== "undefined"
  ? L.divIcon({
      className: "custom-site-marker",
      html: `<div style="background: #ef4444; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(239, 68, 68, 0.8); display: flex; align-items: center; justify-content: center; font-size: 11px;">🏗️</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })
  : null;

type Props = {
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  driverStatus?: string | null;
  siteLat: number;
  siteLng: number;
  siteName: string;
  height?: string;
};

export default function MiniMap({
  driverLat,
  driverLng,
  driverStatus,
  siteLat,
  siteLng,
  siteName,
  height = "180px",
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
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

  const routeLine: [number, number][] = [];
  if (driverLat && driverLng) {
    routeLine.push([driverLat, driverLng]);
  }
  routeLine.push([siteLat, siteLng]);

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
        className="w-full rounded overflow-hidden border border-slate-700"
        style={{ height }}
      >
        <MapContainer
          center={center}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          dragging={true}
          zoomControl={false}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains={["a", "b", "c"]}
          />

          {routeLine.length > 1 && (
            <Polyline
              positions={routeLine}
              pathOptions={{
                color: "#06b6d4",
                weight: 3,
                opacity: 0.7,
                dashArray: "8, 8",
              }}
            />
          )}

          {driverLat && driverLng && driverIcon && (
            <Marker position={[driverLat, driverLng]} icon={driverIcon}>
              <Popup>
                <div className="text-xs">
                  <strong>🚚 Driver</strong>
                  <br />
                  {driverLat.toFixed(4)}, {driverLng.toFixed(4)}
                </div>
              </Popup>
            </Marker>
          )}

          {siteIcon && (
            <Marker position={[siteLat, siteLng]} icon={siteIcon}>
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
      </div>
    </div>
  );
}