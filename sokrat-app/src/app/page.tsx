"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from 'next/dynamic';

const getISOTimestamp = (): string => {
  return new Date().toISOString();
};

// Import Leaflet CSS directly in the component
import 'leaflet/dist/leaflet.css';
import TaskDashboard, { SelectedTaskData } from "@/components/TaskDashboard";
import RamcoSyncPanel from "@/components/RamcoSyncPanel";
import SiteGpsButton from "@/components/SiteGpsButton";
import NavigationPanel from "@/components/NavigationPanel";
import FullScreenNav from "@/components/FullScreenNav";
import PlannerDashboard from "@/components/PlannerDashboard";
import { startDriverGpsBroadcast, DriverGpsHandle } from "@/app/lib/driverGps";
import { supabase } from "../app/lib/supabase";

const DeliveryNoteModal = dynamic(
  () => import("@/components/DeliveryNoteModal"),
  { ssr: false }
);// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);

const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);

const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);

const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);


type TripScope = "FULL" | "FACTORY_ONLY" | "DELIVERY_ONLY";

type LogisticalManifest = {
  manifest_group_id: string;
  fleet_carrier_id: string;
  geofence_verified: boolean;
  factory_gate_out_actual: string;
  site_gate_in_target: string;
  scope: TripScope;
  externalDriver: boolean;
  externalInspector: boolean;
  driver: {
    name: string;
    id: string;
    phone: string;
    email?: string;
    rating: number;
    totalTrips: number;
    isExternal: boolean;
  };
  vehicle: {
    plateNumber: string;
    trailerType: "FLATBED" | "LOWBOY" | "STEP_DECK" | "REMOVABLE_GOOSENECK";
    ownership: "RENTED" | "OWNED";
    make?: string;
    model?: string;
    year?: number;
  };
  siteInspector: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
  };
  inspectorRating?: {
    score: number;
    comment?: string;
    timestamp: string;
  };
  driverPortalLink?: string;
  inspectorPortalLink?: string;
  delivery_note_url?: string | null;
  delivery_note_file_name?: string | null;
};

type CustodyLog = {
  timestamp: string;
  state: string;
  custody: string;
};

type AssetMetadata = {
  length_meters: number;
  width_meters: number;
  height_meters: number;
  weight_tons: number;
  structural_type: string;
};

type Asset = {
  id: string;
  state: string;
  epd1_certificate_url: string | null;
  mix1_certificate_url: string | null;
  epd2_certificate_url: string | null;
  mix2_certificate_url: string | null;
  epd1_file_name?: string | null;
  mix1_file_name?: string | null;
  epd2_file_name?: string | null;
  mix2_file_name?: string | null;
  factory_qa_status: "PASSED" | "FAILED" | null;
  factory_qa_defect_reason?: string | null;
  site_rejection_reason?: string | null;
  factory_delay_minutes: number;
  transit_delay_minutes: number;
  site_delay_minutes: number;
  delay_reason?: string | null;
  installed_timestamp?: string | null;
  installed_location?: string | null;
  manifest_group_id: string;
  previous_state_before_rejection?: string | null;
  metadata: AssetMetadata | null;
  custodyHistory: CustodyLog[];
  hasScannedQR: boolean;
  rejection_photos?: string[];
  loading_started_timestamp?: string | null;
  loading_completed_timestamp?: string | null;
  offloading_started_timestamp?: string | null;
  offloading_completed_timestamp?: string | null;
  installation_started_timestamp?: string | null;
  installation_completed_timestamp?: string | null;
};

// Route coordinates for the map (ICAD to Yas Island)
const ROUTE_COORDINATES: [number, number][] = [
  [24.4539, 54.3773], // ICAD Industrial Zone
  [24.4600, 54.3900],
  [24.4678, 54.4123], // E30 / E11 Junction
  [24.4800, 54.4300],
  [24.5012, 54.4567], // E11 Coastal Corridor
  [24.5100, 54.4800],
  [24.5198, 54.5123], // Yas Gateway
  [24.5280, 54.5400],
  [24.5387, 54.5678], // Yas Island Project
];

const SEQUENCE = [
  "INITIALIZED",
  "LOADING_INITIATED",
  "LOADING_COMPLETED",
  "DISPATCHED",
  "ARRIVED_AT_GATE",
  "RECEIVED_ON_SITE",
  "GATE_IN_OFFLOADING",
  "OFFLOADING_COMPLETED",
  "INSTALLATION_INITIATED",
  "INSTALLATION_COMPLETED"
];

const PRECAST_DELAY_REASONS = [
  "Traffic Congestion",
  "Route Diversion",
  "Weighbridge Inspection Delay",
  "Safety Stoppage"
];

const DEFECT_VECTORS = [
  "No Defects",
  "Dimensions",
  "Cracks",
  "Honeycombing"
];

const TRAILER_TYPES = ["FLATBED", "LOWBOY", "STEP_DECK", "REMOVABLE_GOOSENECK"];

const getFormattedTimestamp = (date: Date = new Date()): string => {
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export default function Home() {
  const [profile, setProfile] = useState<"DISPATCHER" | "DRIVER" | "INSPECTOR" | "PLANNER">("DISPATCHER");
    const [selectedTask, setSelectedTask] = useState<SelectedTaskData | null>(null);
    const [taskRefreshKey, setTaskRefreshKey] = useState(0);
      const custodyLogRef = useRef<HTMLDivElement | null>(null);
        const [showFullScreenNav, setShowFullScreenNav] = useState(false);
          // Driver live GPS broadcast
  const gpsHandleRef = useRef<DriverGpsHandle | null>(null);
  const [gpsBroadcasting, setGpsBroadcasting] = useState(false);
   const [showDeliveryNote, setShowDeliveryNote] = useState(false);
  const [checkedEPD, setCheckedEPD] = useState(false);
  const [checkedMixDesign, setCheckedMixDesign] = useState(false);
  const [checkedDeliveryNote, setCheckedDeliveryNote] = useState(false);
  const [inputBatchSize, setInputBatchSize] = useState<number>(1);


  // Rating state
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");

  // External link generation

  // Certificate upload states - now 4 certificates
  const [epd1File, setEpd1File] = useState<File | null>(null);
  const [mix1File, setMix1File] = useState<File | null>(null);
  const [epd2File, setEpd2File] = useState<File | null>(null);
  const [mix2File, setMix2File] = useState<File | null>(null);
  const [epd1FileName, setEpd1FileName] = useState<string>("");
  const [mix1FileName, setMix1FileName] = useState<string>("");
  const [epd2FileName, setEpd2FileName] = useState<string>("");
  const [mix2FileName, setMix2FileName] = useState<string>("");

  // Delivery Note state
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);
  const [deliveryNoteFileName, setDeliveryNoteFileName] = useState<string>("");

  const [manifest, setManifest] = useState<LogisticalManifest>({
    manifest_group_id: "ICAD-YAS-ALM-260706-042",
    fleet_carrier_id: "AL FARIS HEAVY LOGISTICS",
    geofence_verified: false,
    factory_gate_out_actual: "2026-07-07T06:00:00Z",
    site_gate_in_target: "2026-07-07T08:00:00Z",
    scope: "FULL",
    externalDriver: false,
    externalInspector: false,
    driver: {
      name: "Ahmed Al Maktoum",
      id: "DRV-001",
      phone: "+971 50 123 4567",
      email: "ahmed@alfaris.ae",
      rating: 4.2,
      totalTrips: 156,
      isExternal: false
    },
    vehicle: {
      plateNumber: "A-12345",
      trailerType: "FLATBED",
      ownership: "OWNED",
      make: "Scania",
      model: "R500",
      year: 2022
    },
    siteInspector: {
      name: "Khalid Al Suwaidi",
      phone: "+971 50 987 6543",
      email: "khalid@yasproject.ae",
      company: "Yas Project Management"
    },
    inspectorRating: undefined,
    driverPortalLink: undefined,
    inspectorPortalLink: undefined,
    delivery_note_url: null,
    delivery_note_file_name: null
  });

  const generateInitialBatch = (manifestId: string, totalCount: number) => {
    return Array.from({ length: totalCount > 0 ? totalCount : 1 }, (_, i) => {
      const idNum = 82 + i;
      return {
        id: `BIM-PRC-FL03-SEC04-W${String(idNum).padStart(3, "0")}`,
        state: "INITIALIZED",
        epd1_certificate_url: null,
        mix1_certificate_url: null,
        epd2_certificate_url: null,
        mix2_certificate_url: null,
        epd1_file_name: null,
        mix1_file_name: null,
        epd2_file_name: null,
        mix2_file_name: null,
        factory_qa_status: "PASSED" as "PASSED" | "FAILED",
        factory_qa_defect_reason: null,
        site_rejection_reason: null,
        factory_delay_minutes: 0,
        transit_delay_minutes: 0,
        site_delay_minutes: 0,
        delay_reason: null,
        installed_timestamp: null,
        installed_location: null,
        manifest_group_id: manifestId,
        previous_state_before_rejection: null,
        metadata: {
          length_meters: 6.25,
          width_meters: 0.35,
          height_meters: 2.85,
          weight_tons: parseFloat((8.50 + i * 0.02).toFixed(2)),
          structural_type: "Load-Bearing Precast Wall Panel"
        },
        custodyHistory: [{ timestamp: "[PENDING HARDWARE SCAN]", state: "INITIALIZED", custody: "FACTORIES (Dispatcher)" }],
        hasScannedQR: false,
        rejection_photos: [],
        loading_started_timestamp: null,
        loading_completed_timestamp: null,
        offloading_started_timestamp: null,
        offloading_completed_timestamp: null,
        installation_started_timestamp: null,
        installation_completed_timestamp: null
      };
    });
  };

  const [assets, setAssets] = useState<Asset[]>([]);

  const [activeAssetId, setActiveAssetId] = useState<string>("BIM-PRC-FL03-SEC04-W082");
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("Floor 3, Grid Sector B-4");
  const [isScanning, setIsScanning] = useState(false);
  const [scanTypeLabel, setScanTypeLabel] = useState("NFC ARRAY");
  const [selectedDelayReason, setSelectedDelayReason] = useState("");

  // Map state

  const [selectedDispatcherDefect, setSelectedDispatcherDefect] = useState(DEFECT_VECTORS[0]);
  const [selectedInspectorDefect, setSelectedInspectorDefect] = useState(DEFECT_VECTORS[0]);
  const [dispatcherRejectFiles, setDispatcherRejectFiles] = useState<File[]>([]);
  const [inspectorRejectFiles, setInspectorRejectFiles] = useState<File[]>([]);

const currentAsset = assets.length > 0 
  ? (assets.find(a => a.id === activeAssetId) || assets[0])
  : null;

  // Auto-scroll the custody log to the bottom whenever new entries arrive
  useEffect(() => {
    if (custodyLogRef.current) {
      custodyLogRef.current.scrollTop = custodyLogRef.current.scrollHeight;
    }
  }, [currentAsset?.custodyHistory?.length]);
    // Driver live GPS broadcast — only when profile is DRIVER and trip is dispatched
  useEffect(() => {
    const shouldBroadcast =
      profile === "DRIVER" &&
      !!selectedTask &&
      !!currentAsset?.state?.startsWith("DISPATCHED");

    if (shouldBroadcast) {
      // Avoid double-start
      if (gpsHandleRef.current) return;

      console.log("[SOKRAT] Starting driver GPS broadcast for", selectedTask?.manifest_group_id);
      const handle = startDriverGpsBroadcast(
        selectedTask!.manifest_group_id,
        () => setGpsBroadcasting(true)
      );
      gpsHandleRef.current = handle;
      setGpsBroadcasting(true);
    } else {
      if (gpsHandleRef.current) {
        console.log("[SOKRAT] Stopping driver GPS broadcast");
        gpsHandleRef.current.stop();
        gpsHandleRef.current = null;
      }
      setGpsBroadcasting(false);
    }

    return () => {
      // Cleanup on unmount only if we're no longer broadcasting
      // (the effect re-runs on state change; we don't want to kill mid-trip)
    };
  }, [profile, selectedTask?.manifest_group_id, currentAsset?.state]);
  // ============================================
  // PHASE 2: Load assets (panels) from Supabase for a task
  // ============================================
  const loadAssetsForTask = async (manifestGroupId: string) => {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("manifest_group_id", manifestGroupId)
      .order("asset_serial", { ascending: true });

    if (error || !data) return;

    // Map Supabase assets to the app's Asset type
    const loadedAssets: Asset[] = data.map((a: any) => ({
      id: a.asset_serial,
      state: a.state || "INITIALIZED",
      epd1_certificate_url: a.epd1_certificate_url,
      mix1_certificate_url: a.mix1_certificate_url,
      epd2_certificate_url: a.epd2_certificate_url,
      mix2_certificate_url: a.mix2_certificate_url,
      epd1_file_name: a.epd1_file_name,
      mix1_file_name: a.mix1_file_name,
      epd2_file_name: a.epd2_file_name,
      mix2_file_name: a.mix2_file_name,
      factory_qa_status: a.factory_qa_status,
      factory_qa_defect_reason: a.factory_qa_defect_reason,
      site_rejection_reason: a.site_rejection_reason,
      factory_delay_minutes: a.factory_delay_minutes || 0,
      transit_delay_minutes: a.transit_delay_minutes || 0,
      site_delay_minutes: a.site_delay_minutes || 0,
      delay_reason: a.delay_reason,
      installed_timestamp: a.installed_timestamp,
      installed_location: a.installed_location,
      manifest_group_id: a.manifest_group_id,
      previous_state_before_rejection: a.previous_state_before_rejection,
      metadata: a.metadata || null,
      custodyHistory: a.custody_history || [],
      hasScannedQR: a.has_scanned_qr || false,
      rejection_photos: a.rejection_photos || [],
      loading_started_timestamp: a.loading_started_timestamp,
      loading_completed_timestamp: a.loading_completed_timestamp,
      offloading_started_timestamp: a.offloading_started_timestamp,
      offloading_completed_timestamp: a.offloading_completed_timestamp,
      installation_started_timestamp: a.installation_started_timestamp,
      installation_completed_timestamp: a.installation_completed_timestamp,
    }));

    if (loadedAssets.length > 0) {
      setAssets(loadedAssets);
      setActiveAssetId(loadedAssets[0].id);
    }
  };


  // Check if trip is complete based on scope
  const isTripComplete = () => {
    if (manifest.scope === "FACTORY_ONLY") {
      return assets.every(a => a.state === "DISPATCHED" || a.state.startsWith("REJECTED"));
    }
    if (manifest.scope === "DELIVERY_ONLY") {
      return assets.every(a => a.state === "ARRIVED_AT_GATE" || a.state.startsWith("REJECTED"));
    }
    return assets.every(a => a.state === "INSTALLATION_COMPLETED" || a.state.startsWith("REJECTED"));
  };

  // Get scope status message
  const getScopeStatusMessage = () => {
    if (manifest.scope === "FACTORY_ONLY") {
      return "🔚 Trip completed at DISPATCHED (Client pickup)";
    }
    if (manifest.scope === "DELIVERY_ONLY") {
      return "🔚 Trip completed at ARRIVED_AT_GATE (Client handles installation)";
    }
    return "✅ Trip fully completed (Installation confirmed)";
  };

  // Helper to get driver button text
  const getDriverButtonText = () => {
    if (manifest.scope === "DELIVERY_ONLY") {
      return "✅ Confirm Delivery Complete";
    }
    return "Arrived Site Gate Boundary";
  };

  // Get current position based on asset state
  const getCurrentPosition = (): [number, number] => {
    const stateMap: Record<string, number> = {
      "INITIALIZED": 0,
      "LOADING_INITIATED": 0,
      "LOADING_COMPLETED": 0,
      "DISPATCHED": 2,
      "ARRIVED_AT_GATE": 3,
      "RECEIVED_ON_SITE": 3,
      "GATE_IN_OFFLOADING": 3,
      "OFFLOADING_COMPLETED": 3,
      "INSTALLATION_INITIATED": 4,
      "INSTALLATION_COMPLETED": 4
    };
    const index = stateMap[String(currentAsset?.state || "")] ?? 0;
            return ROUTE_COORDINATES[index] || ROUTE_COORDINATES[0];
  };

  // Check traffic congestion (simulated)
  const checkTrafficCongestion = () => {
    const trafficConditions = [
      { status: 'HEAVY', speed: '15-25 km/h', color: 'red' },
      { status: 'MODERATE', speed: '30-45 km/h', color: 'orange' },
      { status: 'CLEAR', speed: '60-80 km/h', color: 'green' },
    ];
    const condition = trafficConditions[Math.floor(Math.random() * trafficConditions.length)];
    alert(`🛣️ TRAFFIC CHECK COMPLETED\n\n📍 Route: ICAD → Yas Island\n\n📊 Current Traffic Conditions:\n• E11 Coastal Corridor: ${condition.status} (${condition.speed})\n• E30 Highway: MODERATE (35-45 km/h)\n• Yas Gateway approach: CLEAR (55-65 km/h)\n\nℹ️ Use this information to verify the driver's delay claim.`);
  };

  // SLA CALCULATION FUNCTIONS
  const getPlantSLA = () => {
    const initLog = currentAsset?.custodyHistory?.find(log => log.state === "INITIALIZED");
    const dispatchLog = currentAsset?.custodyHistory?.find(log => log.state === "DISPATCHED");
    if (initLog && dispatchLog) {
      const start = new Date(initLog.timestamp);
      const end = new Date(dispatchLog.timestamp);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return Math.round((end.getTime() - start.getTime()) / 60000);
      }
    }
    return 0;
  };

  const getTransitSLA = () => {
    const dispatchLog = currentAsset?.custodyHistory?.find(log => log.state === "DISPATCHED");
    const arrivalLog = currentAsset?.custodyHistory?.find(log => log.state === "ARRIVED_AT_GATE");
    if (dispatchLog && arrivalLog) {
      const start = new Date(dispatchLog.timestamp);
      const end = new Date(arrivalLog.timestamp);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return Math.round((end.getTime() - start.getTime()) / 60000);
      }
    }
    return currentAsset?.transit_delay_minutes || 0;
  };

  const getSiteSLA = () => {
    const arrivalLog = currentAsset?.custodyHistory?.find(log => log.state === "ARRIVED_AT_GATE");
    const completionLog = currentAsset?.custodyHistory?.find(log => log.state === "INSTALLATION_COMPLETED");
    if (arrivalLog && completionLog) {
      const start = new Date(arrivalLog.timestamp);
      const end = new Date(completionLog.timestamp);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return Math.round((end.getTime() - start.getTime()) / 60000);
      }
    }
    return 0;
  };

  const getTotalTripDuration = () => {
    const initLog = currentAsset?.custodyHistory?.find(log => log.state === "INITIALIZED");
    const completionLog = currentAsset?.custodyHistory?.find(log => log.state === "INSTALLATION_COMPLETED");
    if (initLog && completionLog) {
      const start = new Date(initLog.timestamp);
      const end = new Date(completionLog.timestamp);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return Math.round((end.getTime() - start.getTime()) / 60000);
      }
    }
    return 0;
  };

  const getDelayBreakdown = () => {
    return {
      plantDelays: currentAsset?.factory_delay_minutes || 0,
      transitDelays: currentAsset?.transit_delay_minutes || 0,
      siteDelays: currentAsset?.site_delay_minutes || 0
    };
  };

  useEffect(() => {
    if (assets.length > 0 && !assets.some(a => a.id === activeAssetId)) {
      setActiveAssetId(assets[0].id);
    }
  }, [assets]);

  useEffect(() => {
    setCheckedEPD(currentAsset?.state === "INSTALLATION_COMPLETED");
    setCheckedMixDesign(currentAsset?.state === "INSTALLATION_COMPLETED");
    setCheckedDeliveryNote(currentAsset?.state === "INSTALLATION_COMPLETED");
  }, [activeAssetId]);

   useEffect(() => {
    const isAtSite = currentAsset?.state ? ["ARRIVED_AT_GATE", "RECEIVED_ON_SITE", "GATE_IN_OFFLOADING", "OFFLOADING_COMPLETED",
      "INSTALLATION_INITIATED", "INSTALLATION_COMPLETED"].includes(currentAsset.state) : false;
    setManifest(prev => ({ ...prev, geofence_verified: isAtSite }));
  }, [currentAsset?.state]);

  function getNextState(curr: string): string | null {
    const idx = SEQUENCE.indexOf(curr);
    if (idx === -1 || idx === SEQUENCE.length - 1) return null;
    return SEQUENCE[idx + 1];
  }

function getAssetCustody(state: string | null | undefined, selectedTask?: any): string {
  if (!state) return "—";
  
  // Get current dispatcher for multi-stage trips
  const getDispatcherForStage = () => {
    if (!selectedTask?.factories || selectedTask.factories.length === 0) return null;
    const stage = selectedTask.current_stage || 1;
    const factory = selectedTask.factories[stage - 1];
    return factory?.dispatcher_name || null;
  };
  
  if (state === "INITIALIZED" || state === "LOADING_INITIATED" || state === "LOADING_COMPLETED") {
    const dispatcher = getDispatcherForStage();
    const stage = selectedTask?.current_stage || 1;
    const totalStages = selectedTask?.factories?.length || 1;
    if (dispatcher && totalStages > 1) {
      return `FACTORIES ${String.fromCharCode(64 + stage)} (${dispatcher})`;
      // Stage 1 → "FACTORIES A", Stage 2 → "FACTORIES B"
    }
    return "FACTORIES (Dispatcher)";
  }
  
  if (state.startsWith("DISPATCHED") || state === "ARRIVED_AT_GATE") {
    return "TRANSIT LOGISTICS (Driver)";
  }
  
  if (state.startsWith("RECEIVED_ON_SITE") || state === "GATE_IN_OFFLOADING" || state === "OFFLOADING_COMPLETED" ||
    state === "INSTALLATION_INITIATED" || state === "INSTALLATION_COMPLETED") {
    return "CONSTRUCTION SITE (Inspector)";
  }
  
  return "CONSTRUCTION SITE (Inspector)";
}
    function handleBulkNFCScan() {
    setScanTypeLabel("NFC / RFID BATCH GATE SCAN");
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const nowTime = getFormattedTimestamp();
      setAssets(prev => {
        const newAssets = prev.map(a => {
          if (!a.hasScannedQR) {
            const updated = {
              ...a,
              hasScannedQR: true,
              custodyHistory: a.custodyHistory.map(log =>
                log.state === "INITIALIZED" && log.timestamp === "[PENDING HARDWARE SCAN]"
                  ? { ...log, timestamp: nowTime }
                  : log
              )
            };
            saveAssetState(updated.id, updated);
            return updated;
          }
          return a;
        });
        return newAssets;
      });
      setError(null);
    }, 1000);
  }

    function handleSingleQRScan() {
    setScanTypeLabel(`QR COUPLING: ${activeAssetId}`);
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const nowTime = getFormattedTimestamp();
      setAssets(prev =>
        prev.map(a => {
          if (a.id === activeAssetId) {
            return {
              ...a,
              hasScannedQR: true,
              custodyHistory: a.custodyHistory.map(log =>
                log.state === "INITIALIZED" && log.timestamp === "[PENDING HARDWARE SCAN]"
                  ? { ...log, timestamp: nowTime }
                  : log
              )
            };
          }
          return a;
        })
      );
    }, 900);
  }

  // Generate external driver link
  
  
  // Function to clear all certificates
  const clearAllCertificates = () => {
    setEpd1File(null);
    setMix1File(null);
    setEpd2File(null);
    setMix2File(null);
    setEpd1FileName("");
    setMix1FileName("");
    setEpd2FileName("");
    setMix2FileName("");
    setAssets(prev =>
      prev.map(a => ({
        ...a,
        epd1_certificate_url: null,
        mix1_certificate_url: null,
        epd2_certificate_url: null,
        mix2_certificate_url: null,
        epd1_file_name: null,
        mix1_file_name: null,
        epd2_file_name: null,
        mix2_file_name: null
      }))
    );
        // Save to Supabase
    saveTaskState({
      epd1_url: null,
      mix1_url: null,
      epd2_url: null,
      mix2_url: null,
    });
    setError(null);
  };

  // Upload Delivery Note
  const handleDeliveryNoteUpload = async () => {
    try {
      if (!deliveryNoteFile) {
        setError("Please select a delivery note file first");
        return;
      }
      const deliveryNoteUrl = await fileToBase64(deliveryNoteFile);
      setManifest(prev => ({
        ...prev,
        delivery_note_url: deliveryNoteUrl,
        delivery_note_file_name: deliveryNoteFile.name
      }));
  await saveTaskState({
  delivery_note_url: deliveryNoteUrl,
  delivery_note_file_name: deliveryNoteFile.name,
}, manifest.manifest_group_id);
      setError(null);
      alert(`✅ Delivery Note uploaded successfully!\nFile: ${deliveryNoteFile.name}`);
    } catch (err: any) {
      setError("Failed to upload delivery note: " + err.message);
    }
  };

  // Clear Delivery Note
  const clearDeliveryNote = () => {
    setDeliveryNoteFile(null);
    setDeliveryNoteFileName("");
    setManifest(prev => ({
      ...prev,
      delivery_note_url: null,
      delivery_note_file_name: null
    }));
        // Save to Supabase
    saveTaskState({
      delivery_note_url: null,
      delivery_note_file_name: null,
    });
    setError(null);
  };

  const submitRating = async () => {
    if (ratingScore === 0) {
      setError("Please select a rating");
      return;
    }

    const result = await submitRatingToSupabase(
      manifest.driver.name,
      ratingScore,
      ratingComment,
      manifest.manifest_group_id
    );

    if (!result.success) {
      setError("Failed to submit rating: " + result.error);
      return;
    }

    const ratingData = {
      score: ratingScore,
      comment: ratingComment || undefined,
      timestamp: getFormattedTimestamp(),
    };

    setManifest((prev) => ({
      ...prev,
      inspectorRating: ratingData,
      driver: {
        ...prev.driver,
        rating: result.newRating || prev.driver.rating,
        totalTrips: result.newTotalTrips || prev.driver.totalTrips,
      },
    }));

    setRatingScore(0);
    setRatingComment("");
    setError(null);

    alert(
      `✅ Rating submitted!\n\n` +
      `⭐ Your rating: ${ratingScore} ★\n` +
      `📊 New average: ${result.newRating?.toFixed(2)} ★\n` +
      `🚚 Total trips for ${manifest.driver.name}: ${result.newTotalTrips}`
    );
  };

  function handleRebuildCustomBatch() {
    setError(null);
    if (inputBatchSize < 1 || isNaN(inputBatchSize)) {
      setError("CONFIGURATION_ERROR: Batch setup needs a minimum parameter allocation of 1 item.");
      return;
    }
    const freshBatch = generateInitialBatch(manifest.manifest_group_id, inputBatchSize);
    setAssets(freshBatch);
    setActiveAssetId(freshBatch[0].id);
  }

  const processFiles = async (files: File[]): Promise<string[]> => {
    const promises = files.map(file => fileToBase64(file));
    return await Promise.all(promises);
  };

  // Handle uploading all 4 certificates
  const handleCertificateUpload = async () => {
    try {
      let epd1Url = null, mix1Url = null, epd2Url = null, mix2Url = null;
      let epd1Name = null, mix1Name = null, epd2Name = null, mix2Name = null;

      if (epd1File) {
        epd1Url = await fileToBase64(epd1File);
        epd1Name = epd1File.name;
      }
      if (mix1File) {
        mix1Url = await fileToBase64(mix1File);
        mix1Name = mix1File.name;
      }
      if (epd2File) {
        epd2Url = await fileToBase64(epd2File);
        epd2Name = epd2File.name;
      }
      if (mix2File) {
        mix2Url = await fileToBase64(mix2File);
        mix2Name = mix2File.name;
      }

      setAssets(prev =>
        prev.map(a => ({
          ...a,
          epd1_certificate_url: epd1Url || a.epd1_certificate_url,
          mix1_certificate_url: mix1Url || a.mix1_certificate_url,
          epd2_certificate_url: epd2Url || a.epd2_certificate_url,
          mix2_certificate_url: mix2Url || a.mix2_certificate_url,
          epd1_file_name: epd1Name || a.epd1_file_name,
          mix1_file_name: mix1Name || a.mix1_file_name,
          epd2_file_name: epd2Name || a.epd2_file_name,
          mix2_file_name: mix2Name || a.mix2_file_name
        }))
      );
            // Save to Supabase — use manifest.manifest_group_id as fallback
      const update: any = {};
      if (epd1Url) update.epd1_url = epd1Url;
      if (mix1Url) update.mix1_url = mix1Url;
      if (epd2Url) update.epd2_url = epd2Url;
      if (mix2Url) update.mix2_url = mix2Url;
      if (Object.keys(update).length > 0) {
        await saveTaskState(update, manifest.manifest_group_id);
      }
      setError(null);
      alert(`✅ Certificates uploaded successfully!\nEPD 1: ${epd1FileName || "Not uploaded"}\nMix 1: ${mix1FileName || "Not uploaded"}\nEPD 2: ${epd2FileName || "Not uploaded"}\nMix 2: ${mix2FileName || "Not uploaded"}`);
    } catch (err: any) {
      setError("Failed to upload certificates: " + err.message);
    }
  };

  const handleManualGeofenceOverride = () => {
    setManifest(prev => ({ ...prev, geofence_verified: true }));
    setError(null);
    setAssets(prev =>
      prev.map(a => {
        if (a.id === activeAssetId) {
          return {
            ...a,
            custodyHistory: [
              ...a.custodyHistory,
              {
                timestamp: getFormattedTimestamp(),
                state: "GEOFENCE_OVERRIDE_MANUAL",
                custody: "CONSTRUCTION SITE (Inspector)"
              }
            ]
          };
        }
        return a;
      })
    );
    alert("✅ GEOFENCE OVERRIDE SUCCESSFUL\n\nYou can now proceed with:\n• RECEIVED+APPROVED\n• Start Offloading\n• Complete Offloading\n• Start Installation\n• Complete Installation");
  };

  // transitionTo with dispatched defect info
  function transitionTo(nextState: string, customFields?: Partial<Asset>) {
    setError(null);
    try {
      const isRejectingAction = nextState.startsWith("REJECTED");
      
      if ((nextState === "INSTALLATION_INITIATED" || nextState === "INSTALLATION_COMPLETED") && !manifest.geofence_verified) {
        throw "GEOFENCE_LOCKOUT: Site handshake protocol blocked. Carrier remains outside designated perimeter coordinates.";
      }
      
      if (!isRejectingAction && !currentAsset?.state.startsWith("REJECTED")) {
        const validTransitions: Record<string, string[]> = {
          "INITIALIZED": ["LOADING_INITIATED"],
          "LOADING_INITIATED": ["LOADING_COMPLETED"],
          "LOADING_COMPLETED": ["DISPATCHED"],
          "DISPATCHED": ["ARRIVED_AT_GATE"],
          "ARRIVED_AT_GATE": ["RECEIVED_ON_SITE"],
          "RECEIVED_ON_SITE": ["GATE_IN_OFFLOADING"],
          "GATE_IN_OFFLOADING": ["OFFLOADING_COMPLETED"],
          "OFFLOADING_COMPLETED": ["INSTALLATION_INITIATED"],
          "INSTALLATION_INITIATED": ["INSTALLATION_COMPLETED"],
          "INSTALLATION_COMPLETED": []
        };
const allowed = validTransitions[currentAsset?.state || ""] || [];
        if (!allowed.includes(nextState)) {
          throw `INVALID_SEQUENCE: Cannot transition from ${currentAsset?.state} to ${nextState}.`;
        }
      }

      // When dispatching, include defect info in state
      let finalState = nextState;
      if (nextState === "DISPATCHED" && !isRejectingAction) {
        const defectLabel = selectedDispatcherDefect === "No Defects" 
          ? "NO_DEFECTS" 
          : selectedDispatcherDefect.toUpperCase().replace(/ /g, '_');
        finalState = `DISPATCHED_${defectLabel}`;
      }

      const updatedFields = { ...customFields };
      const now = getFormattedTimestamp();

      if (nextState === "LOADING_INITIATED" && !currentAsset?.loading_started_timestamp) {
        updatedFields.loading_started_timestamp = now;
      }
      if (nextState === "LOADING_COMPLETED" && !currentAsset?.loading_completed_timestamp) {
        updatedFields.loading_completed_timestamp = now;
      }
      if (nextState === "GATE_IN_OFFLOADING" && !currentAsset?.offloading_started_timestamp) {
        updatedFields.offloading_started_timestamp = now;
      }
      if (nextState === "OFFLOADING_COMPLETED" && !currentAsset?.offloading_completed_timestamp) {
        updatedFields.offloading_completed_timestamp = now;
      }
      if (nextState === "INSTALLATION_INITIATED" && !currentAsset?.installation_started_timestamp) {
        updatedFields.installation_started_timestamp = now;
      }
      if (nextState === "INSTALLATION_COMPLETED" && !currentAsset?.installation_completed_timestamp) {
        updatedFields.installation_completed_timestamp = now;
        updatedFields.installed_timestamp = now;
      }

      const getRejectionCustody = () => {
        if (profile === "DISPATCHER") return "FACTORIES (Dispatcher)";
        if (profile === "INSPECTOR") return "CONSTRUCTION SITE (Inspector)";
        return getAssetCustody(nextState);
      };

      if (isRejectingAction) {
        updatedFields.previous_state_before_rejection = currentAsset?.state;
        if (profile === "DISPATCHER" && dispatcherRejectFiles.length > 0) {
          processFiles(dispatcherRejectFiles).then(photoUrls => {
            setAssets(prev =>
              prev.map(a => {
                if (a.id === activeAssetId) {
                  const nextCustody = getRejectionCustody();
                  return {
                    ...a,
                    state: finalState,
                    ...updatedFields,
                    rejection_photos: photoUrls,
                    custodyHistory: [
                      ...a.custodyHistory,
                      {
                        timestamp: getFormattedTimestamp(),
                        state: finalState,
                        custody: nextCustody
                      }
                    ]
                  };
                }
                return a;
              })
            );
            setDispatcherRejectFiles([]);
          });
          return;
        }
        if (profile === "INSPECTOR" && inspectorRejectFiles.length > 0) {
          processFiles(inspectorRejectFiles).then(photoUrls => {
            setAssets(prev =>
              prev.map(a => {
                if (a.id === activeAssetId) {
                  const nextCustody = getRejectionCustody();
                  return {
                    ...a,
                    state: finalState,
                    ...updatedFields,
                    rejection_photos: photoUrls,
                    custodyHistory: [
                      ...a.custodyHistory,
                      {
                        timestamp: getFormattedTimestamp(),
                        state: finalState,
                        custody: nextCustody
                      }
                    ]
                  };
                }
                return a;
              })
            );
            setInspectorRejectFiles([]);
          });
          return;
        }
      }

      const nextCustody = isRejectingAction && (profile === "DISPATCHER" || profile === "INSPECTOR")
        ? getRejectionCustody()
        : getAssetCustody(nextState);

      setAssets(prev => {
        const newAssets = prev.map(a => {
          if (a.id === activeAssetId) {
            const updated = {
              ...a,
              state: finalState,
              ...updatedFields,
              custodyHistory: [
                ...a.custodyHistory,
                {
                  timestamp: getFormattedTimestamp(),
                  state: finalState,
                  custody: nextCustody
                }
              ]
            };
            // Save this asset to Supabase
            saveAssetState(updated.id, updated);
            return updated;
          }
          return a;
        });
        return newAssets;
      });
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message ?? String(err));
    }
  }

  // transitionAllAssets with dispatched defect info
  function transitionAllAssets(nextState: string, customFields?: Partial<Asset>) {
    setError(null);
    try {
      if ((nextState === "INSTALLATION_INITIATED" || nextState === "INSTALLATION_COMPLETED") && !manifest.geofence_verified) {
        throw "GEOFENCE_LOCKOUT: Mass site transitions require structural validation via geofence trigger parameters.";
      }

      // When dispatching, include defect info in state
      let finalState = nextState;
      if (nextState === "DISPATCHED") {
        const defectLabel = selectedDispatcherDefect === "No Defects" 
          ? "NO_DEFECTS" 
          : selectedDispatcherDefect.toUpperCase().replace(/ /g, '_');
        finalState = `DISPATCHED_${defectLabel}`;
      }

      const now = getFormattedTimestamp();
      const updatedFields = { ...customFields };

      if (nextState === "LOADING_INITIATED") {
  updatedFields.loading_started_timestamp = new Date().toISOString();      }
      if (nextState === "LOADING_COMPLETED") {
  updatedFields.loading_completed_timestamp = new Date().toISOString();      }
      if (nextState === "GATE_IN_OFFLOADING") {
  updatedFields.offloading_started_timestamp = new Date().toISOString();      }
      if (nextState === "OFFLOADING_COMPLETED") {
  updatedFields.offloading_completed_timestamp = new Date().toISOString();      }
      if (nextState === "INSTALLATION_INITIATED") {
  updatedFields.installation_started_timestamp = new Date().toISOString();      }
      if (nextState === "INSTALLATION_COMPLETED") {
updatedFields.installation_completed_timestamp = new Date().toISOString();
  updatedFields.installed_timestamp = new Date().toISOString();
      }

      setAssets(prev => {
        const newAssets = prev.map(a => {
          const nextCustody = getAssetCustody(nextState);
          const updated = {
            ...a,
            state: finalState,
            ...updatedFields,
            custodyHistory: [
              ...a.custodyHistory,
              { timestamp: getFormattedTimestamp(), state: finalState, custody: nextCustody }
            ]
          };
          // Save this asset to Supabase
          saveAssetState(updated.id, updated);
          return updated;
        });
        return newAssets;
      });
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message ?? String(err));
    }
  }

  const getLoadingDuration = () => {
    if (currentAsset?.loading_started_timestamp && currentAsset?.loading_completed_timestamp) {
      const start = new Date(currentAsset?.loading_started_timestamp);
      const end = new Date(currentAsset?.loading_completed_timestamp);
      const diff = Math.round((end.getTime() - start.getTime()) / 60000);
      return diff;
    }
    return null;
  };

const getOffloadingDuration = () => {
  if (currentAsset?.offloading_started_timestamp && currentAsset?.offloading_completed_timestamp) {
    const start = new Date(currentAsset.offloading_started_timestamp);
    const end = new Date(currentAsset.offloading_completed_timestamp);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    return diff;
  }
  return null;
};

  const getInstallationDuration = () => {
    if (currentAsset?.installation_started_timestamp && currentAsset?.installation_completed_timestamp) {
      const start = new Date(currentAsset?.installation_started_timestamp);
      const end = new Date(currentAsset?.installation_completed_timestamp);
      const diff = Math.round((end.getTime() - start.getTime()) / 60000);
      return diff;
    }
    return null;
  };

  const PhotoUploader = ({
    files,
    setFiles,
    maxFiles = 3
  }: {
    files: File[];
    setFiles: React.Dispatch<React.SetStateAction<File[]>>;
    maxFiles?: number;
  }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const newFiles = Array.from(e.target.files);
        const total = files.length + newFiles.length;
        if (total > maxFiles) {
          alert(`You can upload a maximum of ${maxFiles} photos.`);
          return;
        }
        setFiles(prev => [...prev, ...newFiles]);
      }
    };

    const removeFile = (index: number) => {
      setFiles(prev => prev.filter((_, i) => i !== index));
    };

    return (
      <div className="mt-2">
        <label className="block text-[8px] text-slate-400 uppercase font-bold mb-1">
          Upload Evidence Photos (optional, max {maxFiles})
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="block w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-cyan-400 hover:file:bg-slate-700"
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {files.map((file, idx) => (
              <div key={idx} className="relative w-16 h-16 border border-slate-700 rounded overflow-hidden group">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`preview ${idx}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeFile(idx)}
                  className="absolute top-0 right-0 bg-red-800 text-white rounded-full w-4 h-4 text-[8px] flex items-center justify-center opacity-80 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  // ============================================
  // PHASE 3: Save per-task state to Supabase
  // ============================================
const saveTaskState = async (
  updates: Partial<{
    selected_scope: string;
    selected_defect: string;
    dispatcher_panels_count: number;
    dispatcher_notes: string;
    epd1_url: string | null;
    mix1_url: string | null;
    epd2_url: string | null;
    mix2_url: string | null;
    delivery_note_url: string | null;
    delivery_note_file_name: string | null;
    current_stage: number;  // ← Add this
  }>,
  manifestIdOverride?: string
) => {
    const targetId = manifestIdOverride || selectedTask?.manifest_group_id;

    if (!targetId) {
      console.warn("[SAVE] BLOCKED - no manifest id");
      return;
    }

    console.log("[SAVE] Saving:", updates, "for:", targetId);

    const { error } = await supabase
      .from("manifests")
      .update(updates)
      .eq("manifest_group_id", targetId);

    if (error) {
      console.error("Failed to save task state:", error);
    }
  };
    // ============================================
  // Save a rating submission and update driver aggregate
  // ============================================
  const submitRatingToSupabase = async (
    driverName: string,
    score: number,
    comment: string,
    manifestGroupId: string
  ) => {
    try {
      // 1. Save the rating to the current manifest
      const { error: manifestError } = await supabase
        .from("manifests")
        .update({
          inspector_rating_score: score,
          inspector_rating_comment: comment || null,
          inspector_rating_timestamp: new Date().toISOString(),
        })
        .eq("manifest_group_id", manifestGroupId);

      if (manifestError) throw manifestError;

      // 2. Fetch the driver's current stats
      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select("id, rating, total_trips, total_rating_sum")
        .eq("name", driverName)
        .single();

      if (driverError) throw driverError;

      // 3. Calculate new aggregate
      const newTotalTrips = (driverData.total_trips || 0) + 1;
      const newRatingSum = (driverData.total_rating_sum || 0) + score;
      const newAverageRating = newRatingSum / newTotalTrips;

      // 4. Update the driver record
      const { error: updateError } = await supabase
        .from("drivers")
        .update({
          rating: parseFloat(newAverageRating.toFixed(2)),
          total_trips: newTotalTrips,
          total_rating_sum: newRatingSum,
          updated_at: new Date().toISOString(),
        })
        .eq("id", driverData.id);

      if (updateError) throw updateError;

      console.log(
        `[RATING] Driver ${driverName}: ${score}★ → new avg ${newAverageRating.toFixed(2)}★ (${newTotalTrips} trips)`
      );

      return { success: true, newRating: newAverageRating, newTotalTrips };
    } catch (err: any) {
      console.error("Rating submission failed:", err);
      return { success: false, error: err.message };
    }
  };
    // ============================================
  // Save asset (panel) state to Supabase
  // ============================================
  const saveAssetState = async (assetId: string, updates: Partial<Asset>) => {
    const { error } = await supabase
      .from("assets")
      .update({
        state: updates.state,
        custody_history: updates.custodyHistory,
        loading_started_timestamp: updates.loading_started_timestamp,
        loading_completed_timestamp: updates.loading_completed_timestamp,
        offloading_started_timestamp: updates.offloading_started_timestamp,
        offloading_completed_timestamp: updates.offloading_completed_timestamp,
        installation_started_timestamp: updates.installation_started_timestamp,
        installation_completed_timestamp: updates.installation_completed_timestamp,
        installed_timestamp: updates.installed_timestamp,
        factory_qa_status: updates.factory_qa_status,
        factory_qa_defect_reason: updates.factory_qa_defect_reason,
        site_rejection_reason: updates.site_rejection_reason,
        rejection_photos: updates.rejection_photos,
        has_scanned_qr: updates.hasScannedQR,
        transit_delay_minutes: updates.transit_delay_minutes,
        factory_delay_minutes: updates.factory_delay_minutes,
        site_delay_minutes: updates.site_delay_minutes,
        delay_reason: updates.delay_reason,
      })
      .eq("asset_serial", assetId)
      .eq("manifest_group_id", manifest.manifest_group_id);
  };
    // ============================================
  // Reset All Data (for testing)
  // ============================================
  const resetAllData = async () => {
    const confirmed = window.confirm(
      "⚠️ This will RESET all trip data:\n\n" +
      "• All scopes → FULL\n" +
      "• All defects → No Defects\n" +
      "• All certificates cleared\n" +
      "• All panels → INITIALIZED\n" +
      "• All custody history reset\n\n" +
      "Continue?"
    );

    if (!confirmed) return;

    try {
      // Reset all manifests
      const { error: manifestError } = await supabase
        .from("manifests")
        .update({
          selected_scope: "FULL",
          selected_defect: "No Defects",
          dispatcher_notes: null,
          epd1_url: null,
          mix1_url: null,
          epd2_url: null,
          mix2_url: null,
          delivery_note_url: null,
          delivery_note_file_name: null,
          site_latitude: null,
          site_longitude: null,
          site_gps_source: null,
          site_gps_updated_at: null,
        })
        .neq("manifest_group_id", "");

      if (manifestError) throw manifestError;

      // Reset all assets
      const { error: assetError } = await supabase
        .from("assets")
        .update({
          state: "INITIALIZED",
          custody_history: [
            {
              timestamp: "[PENDING HARDWARE SCAN]",
              state: "INITIALIZED",
              custody: "FACTORIES (Dispatcher)",
            },
          ],
          has_scanned_qr: false,
          loading_started_timestamp: null,
          loading_completed_timestamp: null,
          offloading_started_timestamp: null,
          offloading_completed_timestamp: null,
          installation_started_timestamp: null,
          installation_completed_timestamp: null,
          installed_timestamp: null,
          factory_qa_defect_reason: null,
          site_rejection_reason: null,
          rejection_photos: [],
          factory_delay_minutes: 0,
          transit_delay_minutes: 0,
          site_delay_minutes: 0,
          delay_reason: null,
        })
        .neq("asset_serial", "");

      if (assetError) throw assetError;

      // Clear local state
      setSelectedTask(null);
      setSelectedDelayReason("");
      setDispatcherRejectFiles([]);
      setInspectorRejectFiles([]);
      setEpd1File(null);
      setMix1File(null);
      setEpd2File(null);
      setMix2File(null);
      setEpd1FileName("");
      setMix1FileName("");
      setEpd2FileName("");
      setMix2FileName("");
      setDeliveryNoteFile(null);
      setDeliveryNoteFileName("");
      setCheckedEPD(false);
      setCheckedMixDesign(false);
      setCheckedDeliveryNote(false);
      setError(null);

      alert("✅ All data reset successfully!\n\nThe app will reload now.");

      // Force reload to refresh everything
      window.location.reload();
    } catch (err: any) {
      console.error("Reset failed:", err);
      setError("Reset failed: " + err.message);
    }
  };
  const renderDispatcherActions = () => {
    const loadingDuration = getLoadingDuration();
    
    // Certificate status variables - kept for UI display but NOT for validation
    const hasEpd1 = currentAsset?.epd1_certificate_url !== null;
    const hasMix1 = currentAsset?.mix1_certificate_url !== null;
    const hasEpd2 = currentAsset?.epd2_certificate_url !== null;
    const hasMix2 = currentAsset?.mix2_certificate_url !== null;
    const hasAnyEpd = hasEpd1 || hasEpd2;
    const hasAnyMix = hasMix1 || hasMix2;
    const hasCertificates = hasAnyEpd && hasAnyMix;
    const hasUploadedFiles = epd1File !== null || mix1File !== null || epd2File !== null || mix2File !== null;

    const getDispatcherNextState = () => {
      if (currentAsset?.state === "INITIALIZED") return "LOADING_INITIATED";
      if (currentAsset?.state === "LOADING_INITIATED") return "LOADING_COMPLETED";
      if (currentAsset?.state === "LOADING_COMPLETED") return "DISPATCHED";
      return null;
    };

    const getDispatcherButtonLabel = () => {
      if (currentAsset?.state === "INITIALIZED") return "🚀 Start Loading";
      if (currentAsset?.state === "LOADING_INITIATED") return "✅ Complete Loading";
      if (currentAsset?.state === "LOADING_COMPLETED") return "📦 Confirm Dispatch";
      return "⏳ Waiting...";
    };

    const nextState = getDispatcherNextState();
    const isButtonDisabled = !nextState;

    return (
      <div className="space-y-3 animate-fade-in bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-1">
          Available System Actions:
        </span>
                {/* View Delivery Note */}
        <button
          onClick={() => setShowDeliveryNote(true)}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 font-bold p-2 rounded text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
        >
          📋 View Delivery Note
        </button>

        {/* Current Scope Display & Controls */}
        <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] text-slate-400 uppercase font-bold">Current Trip Scope:</span>
            <span className={`text-[8px] px-2 py-0.5 rounded font-bold ${
              manifest.scope === "FULL" ? "bg-green-950/50 text-green-400" :
              manifest.scope === "FACTORY_ONLY" ? "bg-amber-950/50 text-amber-400" :
              "bg-blue-950/50 text-blue-400"
            }`}>
              {manifest.scope === "FULL" ? "🔵 Full Service" :
               manifest.scope === "FACTORY_ONLY" ? "🏭 Factory Only" :
               "🚚 Delivery Only"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <button
onClick={() => {
  setManifest(prev => ({ ...prev, scope: "FULL" }));
  saveTaskState({ selected_scope: "FULL" }, manifest.manifest_group_id);
  setTaskRefreshKey(prev => prev + 1);
}}              className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase transition ${
                manifest.scope === "FULL"
                  ? "bg-green-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              🔵 Full
            </button>
            <button
onClick={() => {
  setManifest(prev => ({ ...prev, scope: "DELIVERY_ONLY" }));
 saveTaskState({ selected_scope: "DELIVERY_ONLY" }, manifest.manifest_group_id);
 setTaskRefreshKey(prev => prev + 1);
}}              className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase transition ${
                manifest.scope === "DELIVERY_ONLY"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              🚚 Delivery
            </button>
            <button
onClick={() => {
  setManifest(prev => ({ ...prev, scope: "FACTORY_ONLY" }));
 saveTaskState({ selected_scope: "FACTORY_ONLY" }, manifest.manifest_group_id);
 setTaskRefreshKey(prev => prev + 1);
}}              className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase transition ${
                manifest.scope === "FACTORY_ONLY"
                  ? "bg-amber-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              🏭 Factory
            </button>
          </div>
          <p className="text-[7px] text-slate-500 mt-1 text-center">
            {manifest.scope === "FULL" && "🔵 Full tracking: Factory → Installation"}
            {manifest.scope === "FACTORY_ONLY" && "🏭 Ends at DISPATCHED (Client pickup)"}
            {manifest.scope === "DELIVERY_ONLY" && "🚚 Ends at ARRIVED_AT_GATE (Client handles installation)"}
          </p>
        </div>

        <div className="bg-slate-950 p-2 border border-slate-700 rounded-lg text-xs text-slate-400">
          ⏱️ Loading Duration:{" "}
          {loadingDuration !== null ? (
            <span className="text-cyan-400 font-bold">{loadingDuration} minutes</span>
          ) : (
            <span className="text-slate-500 italic font-bold">N/A</span>
          )}
        </div>

        {currentAsset?.state.startsWith("REJECTED_") && (
          <div className="p-2.5 bg-red-950/20 border border-red-900/40 rounded-lg flex flex-col gap-2 border-l-4 border-l-red-500">
            <span className="text-[11px] text-slate-300 font-medium">
              BIM structural entry flagged as factory rejection. Overturn item status?
            </span>
            <button
              onClick={() => {
                setAssets(prev =>
                  prev.map(a =>
                    a.id === activeAssetId
                      ? {
                          ...a,
                          state: "INITIALIZED",
                          factory_qa_status: "PASSED",
                          factory_qa_defect_reason: null,
                          rejection_photos: [],
                          loading_started_timestamp: null,
                          loading_completed_timestamp: null,
                          custodyHistory: [
                            ...a.custodyHistory,
                            { timestamp: getFormattedTimestamp(), state: "INITIALIZED", custody: "FACTORIES (Dispatcher)" }
                          ]
                        }
                      : a
                  )
                );
                setError(null);
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 py-1.5 rounded text-xs font-bold uppercase transition"
            >
              ✔ Overturn & Re-Approve Factory Asset
            </button>
          </div>
        )}



        {/* RAMCO-Fed Certificates (read-only) */}
        <RamcoSyncPanel
          epd1_url={currentAsset?.epd1_certificate_url}
          epd1_file_name={currentAsset?.epd1_file_name}
          mix1_url={currentAsset?.mix1_certificate_url}
          mix1_file_name={currentAsset?.mix1_file_name}
          epd2_url={currentAsset?.epd2_certificate_url}
          epd2_file_name={currentAsset?.epd2_file_name}
          mix2_url={currentAsset?.mix2_certificate_url}
          mix2_file_name={currentAsset?.mix2_file_name}
                    delivery_note_url={manifest.delivery_note_url}
          delivery_note_file_name={manifest.delivery_note_file_name}
          ramco_synced_at={null}
          isDemoMode={typeof window !== "undefined" && window.location.search.includes("demo=1")}
        />

              {/* Defect Selection */}
        <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg">
          <span className="block text-[8px] text-slate-400 uppercase font-bold mb-2">
            Select Active Defect Vector (If Rejecting):
          </span>
          <div className="grid grid-cols-2 gap-2">
            {DEFECT_VECTORS.map((defect) => (
              <label
                key={defect}
                className={`flex items-center gap-2 p-1.5 rounded border text-xs cursor-pointer select-none transition ${
                  selectedDispatcherDefect === defect
                    ? "bg-amber-950/40 border-amber-800 text-amber-400"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="dispatcherDefect"
                  value={defect}
                  checked={selectedDispatcherDefect === defect}
onChange={(e) => {
  setSelectedDispatcherDefect(e.target.value);
  saveTaskState({ selected_defect: e.target.value }, manifest.manifest_group_id);
  setTaskRefreshKey(prev => prev + 1);
}}                 className="accent-amber-500"
                />
                <span>{defect}</span>
              </label>
            ))}
          </div>
          <PhotoUploader files={dispatcherRejectFiles} setFiles={setDispatcherRejectFiles} maxFiles={3} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
onClick={async () => {
  if (!nextState) return;
  
  // Check if this is a multi-stage trip
  const totalStages = selectedTask?.factories?.length || 1;
  const currentStage = selectedTask?.current_stage || 1;
  
  // If dispatching (after all stages are done), or single stage, use normal flow
  if (nextState !== "LOADING_COMPLETED" || totalStages === 1) {
    transitionAllAssets(nextState);
    return;
  }
  
  // Multi-stage: at "Complete Loading", check if there's a next stage
  if (currentStage < totalStages) {
    // Advance to next stage
    await saveTaskState(
      { current_stage: currentStage + 1 } as any,
      manifest.manifest_group_id
    );
    
    // Capture the dispatcher name safely before async operations
    const stageDispatcherName = selectedTask?.factories?.[currentStage - 1]?.dispatcher_name || "Dispatcher";
    const nextDispatcherName = selectedTask?.factories?.[currentStage]?.dispatcher_name || "Next Dispatcher";
    
    // Reset assets back to INITIALIZED for the next dispatcher
    setAssets(prev =>
      prev.map(a => ({
        ...a,
        state: "INITIALIZED",
        custodyHistory: [
          ...a.custodyHistory,
          {
            timestamp: getFormattedTimestamp(),
            state: `STAGE_${currentStage}_COMPLETE`,
            custody: `FACTORIES ${String.fromCharCode(64 + currentStage)} (${stageDispatcherName})`
          }
        ]
      }))
    );
    
    // Reload the task to reflect new stage
    await loadAssetsForTask(manifest.manifest_group_id);
    
    alert(
      `✅ Stage ${currentStage} complete!\n\n` +
      `Driver proceeds to Factory ${String.fromCharCode(64 + currentStage + 1)}.\n` +
      `Next dispatcher: ${nextDispatcherName}`
    );
    
    // Update selectedTask's current_stage
    if (selectedTask) {
      setSelectedTask({
        ...selectedTask,
        current_stage: currentStage + 1,
      });
    }
  } else {
    // Last stage complete — proceed to dispatch
    transitionAllAssets(nextState);
  }
}}
            disabled={isButtonDisabled}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold p-2 rounded text-xs uppercase tracking-wider transition disabled:bg-slate-900 disabled:text-slate-600 border disabled:border-slate-800/40 disabled:opacity-40 disabled:pointer-events-none"
          >
            {getDispatcherButtonLabel()}
          </button>
          <button
            onClick={() => {
              transitionTo(
                `REJECTED_${selectedDispatcherDefect.toUpperCase().replace(/ /g, '_')}`,
                {
                  factory_qa_status: "FAILED",
                  factory_qa_defect_reason: `Pre-dispatch QA failure parameter: [${selectedDispatcherDefect}].`
                }
              );
            }}
disabled={!["INITIALIZED", "LOADING_INITIATED", "LOADING_COMPLETED"].includes(currentAsset?.state || "")}
            className="bg-red-950 hover:bg-red-900 text-red-400 border border-red-900/60 font-bold p-2 rounded text-xs uppercase tracking-wider transition disabled:opacity-30 disabled:pointer-events-none"
          >
            Reject Focus Item
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 text-slate-100 flex flex-col items-center justify-start select-none font-sans">
      {isScanning && (
        <div className="absolute inset-0 bg-slate-950/90 z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="w-56 h-56 border-2 border-cyan-500 rounded-xl relative flex flex-col items-center justify-center bg-slate-900 shadow-[0_0_40px_rgba(6,182,212,0.15)]">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-400 -mt-0.5 -ml-0.5"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-400 -mt-0.5 -mr-0.5"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-400 -mb-0.5 -ml-0.5"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-400 -mb-0.5 -mr-0.5"></div>
            <div className="w-full h-0.5 bg-cyan-400 absolute top-1/2 left-0 shadow-[0_0_10px_#06b6d4] animate-bounce"></div>
          </div>
          <h2 className="text-cyan-400 font-bold tracking-widest text-xs mt-6 uppercase">
            {scanTypeLabel} IN REAL-TIME SYNC...
          </h2>
        </div>
      )}

      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative space-y-4">
        {/* Header with Logo */}
        <div className="flex flex-col items-center justify-center border-b border-slate-800/80 pb-4 text-center">
          <img
            src="./Images/Logo.jpg"
            alt="S.O.K.R.A.T. Logo"
            className="h-16 w-auto mb-2 object-contain"
          />
          <h1 className="text-xl font-black tracking-[0.25em] text-slate-100">S.O.K.R.A.T.</h1>
          <p className="text-[9px] text-cyan-500 tracking-widest font-mono mt-0.5 uppercase">
            Smart Operations & Kinetic Real-Time Asset Twin
          </p>
                    <button
            onClick={resetAllData}
            className="mt-3 text-[9px] bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-400 px-3 py-1 rounded font-bold uppercase tracking-wider transition"
          >
            🔄 Reset All Data (Testing Only)
          </button>
        </div>
        {/* Task Dashboard for current role */}
        
                {/* Profile Switcher */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-2 bg-slate-950 p-2.5 border border-slate-800 rounded-lg">
            <label className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-1">
              [SYS_AUTH] Target Actor Node:
            </label>
            <select
  className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs text-cyan-400 focus:outline-none font-bold"
  value={profile}
  onChange={(e) => {
    setProfile(e.target.value as any);
    setSelectedTask(null);
    setAssets([]);
    setActiveAssetId("");
  }}
>
              <option value="DISPATCHER">DISPATCHER NODE (Plant)</option>
              <option value="DRIVER">DRIVER NODE (Transit Log)</option>
              <option value="INSPECTOR">INSPECTOR NODE (Site Structure)</option>
              <option value="PLANNER">PLANNER NODE (RAMCO God-View)</option>
            </select>
          </div>
        </div>
        
        <TaskDashboard
          userName={
            profile === "DISPATCHER"
              ? "Khalid Al Suwaidi"
              : profile === "DRIVER"
              ? "Mohammed Ali"
              : profile === "INSPECTOR"
              ? "Yusuf Al Hamadi"
              : "Abid"  /* PLANNER */
          }
          userRole={profile}
          selectedTaskId={selectedTask?.task_id || null}
                    refreshKey={taskRefreshKey}
onSelectTask={(task) => {
  if (!task) {
    // Task was collapsed — clear everything
    setSelectedTask(null);
    setAssets([]);
    setActiveAssetId("");
    return;
  }

  setSelectedTask(task);

  // ============================================
  // RESET transient UI state for the new task
  // ============================================
  setSelectedDelayReason("");
  setDispatcherRejectFiles([]);
  setInspectorRejectFiles([]);
  setCheckedEPD(false);
  setCheckedMixDesign(false);
  setCheckedDeliveryNote(false);
  setEpd1File(null);
  setMix1File(null);
  setEpd2File(null);
  setMix2File(null);
  setEpd1FileName("");
  setMix1FileName("");
  setEpd2FileName("");
  setMix2FileName("");
  setDeliveryNoteFile(null);
  setDeliveryNoteFileName("");
  setInputBatchSize(1);
  setError(null);

  // ============================================
  // PHASE 2: Load per-task state from Supabase
  // ============================================

  // 1. Load the manifest data
  setManifest((prev) => ({
    ...prev,
    manifest_group_id: task.manifest_group_id,
    scope: (task.selected_scope as any) || "FULL",
    delivery_note_url: task.delivery_note_url || null,
    delivery_note_file_name: task.delivery_note_file_name || null,
    driver: {
      name: task.driver_name || "TBD",
      id: "AUTO",
      phone: task.driver_phone || "TBD",
      email: "",
      rating: task.driver_rating || 0,
      totalTrips: task.driver_total_trips || 0,
      isExternal: false,
    },
    vehicle: {
      plateNumber: task.vehicle_plate || "TBD",
      trailerType: (task.vehicle_trailer_type as any) || "FLATBED",
      ownership: (task.vehicle_ownership as any) || "OWNED",
    },
    siteInspector: {
      name: task.inspector_name || "TBD",
      phone: task.inspector_phone || "TBD",
      email: task.inspector_email || "",
      company: "Site Project",
    },
  }));

  // 2. Load the defect
  setSelectedDispatcherDefect(task.selected_defect || "No Defects");

  // 3. Load the panels for this task
  loadAssetsForTask(task.manifest_group_id);
}}
        />

        {/* ═══════════════════════════════════════════════════════════
            DRIVER-FIRST LAYOUT
            When the profile is DRIVER and a dispatched task is open,
            show the primary actions (nav + system) right here, before
            any diagnostics. This is what the driver actually needs.
            ═══════════════════════════════════════════════════════════ */}
         {/* ═══════════════════════════════════════════════════════════
            PLANNER GOD-VIEW
            ═══════════════════════════════════════════════════════════ */}
        {profile === "PLANNER" && <PlannerDashboard />}
        {profile === "DRIVER" && selectedTask && assets.length > 0 && (
          <div className="space-y-3">
            {/* Live GPS pill */}
            {gpsBroadcasting && (
              <div className="flex items-center justify-center gap-2 bg-green-950/40 border border-green-800/60 text-green-300 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Broadcasting Live GPS
              </div>
            )}

            {/* Big "Open Navigation" launch card for the driver */}
            {currentAsset?.state?.startsWith("DISPATCHED") &&
             selectedTask.site_latitude &&
             selectedTask.site_longitude && (
              <button
                onClick={() => setShowFullScreenNav(true)}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-5 rounded-xl uppercase tracking-widest text-base transition flex items-center justify-center gap-3 shadow-2xl"
              >
                🗺️ OPEN NAVIGATION
              </button>
            )}

            {/* Full navigation card with traffic + turn-by-turn (driver only) */}
            {currentAsset?.state?.startsWith("DISPATCHED") &&
             selectedTask.site_latitude &&
             selectedTask.site_longitude && (
              <NavigationPanel
                driverLat={selectedTask.driver_current_lat ?? null}
                driverLng={selectedTask.driver_current_lng ?? null}
                siteLat={selectedTask.site_latitude}
                siteLng={selectedTask.site_longitude}
                siteName={selectedTask.site_name || "Site"}
                isActive={true}
                onOpenFullScreen={() => setShowFullScreenNav(true)}
                                hideLauncher={true}
              />
            )}

            {/* System actions (delay, arrived, etc.) — compact strip */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
              <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">
                Available System Actions:
              </span>

              {!currentAsset?.state.includes("REJECTED") && (
                <div className="space-y-2">
                  <div className="bg-slate-950 p-2 border border-slate-800 rounded-lg">
                    <span className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                      Select Active Transit Highway Delay Reason:
                    </span>
                    <select
                      value={selectedDelayReason}
                      onChange={(e) => setSelectedDelayReason(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-xs text-amber-500 p-1 rounded focus:outline-none"
                    >
                      <option value="">-- No Delay Detected --</option>
                      {PRECAST_DELAY_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (currentAsset?.state.startsWith("DISPATCHED")) {
                          transitionAllAssets("ARRIVED_AT_GATE");
                        }
                      }}
                      disabled={!currentAsset?.state.startsWith("DISPATCHED")}
                      className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-3 rounded text-xs uppercase disabled:opacity-30 disabled:pointer-events-none transition"
                    >
                      {getDriverButtonText()}
                    </button>
                    <button
                      onClick={() => {
                        const customLogState = selectedDelayReason
                          ? `TRANSIT_DELAY_(${selectedDelayReason.toUpperCase().replace(/\s+/g, "_")})`
                          : "TRANSIT_DELAY";
                        setAssets((prev) => {
                          const newAssets = prev.map((a) => {
                            const updated = {
                              ...a,
                              transit_delay_minutes: (a.transit_delay_minutes || 0) + 15,
                              delay_reason: selectedDelayReason,
                              custodyHistory: [
                                ...a.custodyHistory,
                                {
                                  timestamp: getFormattedTimestamp(),
                                  state: customLogState,
                                  custody: "TRANSIT LOGISTICS (Driver)",
                                },
                              ],
                            };
                            saveAssetState(updated.id, updated);
                            return updated;
                          });
                          return newAssets;
                        });
                      }}
                      disabled={!currentAsset?.state.startsWith("DISPATCHED") || !selectedDelayReason}
                      className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-4 rounded text-xs uppercase disabled:opacity-30 disabled:pointer-events-none transition"
                    >
                      ⚠ Log Delay (+15m)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
       
        {/* Custody Ledger - Verification Stamp */}
        {selectedTask && assets.length > 0 && (
          <div className="bg-cyan-950/10 border border-cyan-900/20 p-2.5 rounded-lg text-xs space-y-1">
            <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
              <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                📍 Verification Custody Stamp:
              </span>
              <span className="text-cyan-400 font-bold uppercase bg-slate-950 px-2 py-0.5 rounded border border-cyan-800 text-[9px]">
{getAssetCustody(currentAsset?.state, selectedTask)}
              </span>
            </div>
            <div
              ref={custodyLogRef}
              className="space-y-1 max-h-40 overflow-y-auto pr-1 font-mono text-[9px] text-slate-400 scrollbar-thin"
            >
              {currentAsset?.custodyHistory?.map((log, i) => (
                <div key={i} className="flex justify-between">
                  <span>[{log.timestamp || "—"}] {log.state}</span>
                  <span className="text-cyan-500">→ {log.custody}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Component Manifest Array */}
        {profile !== "DRIVER" && manifest.scope !== "FACTORY_ONLY" && assets.length > 0 && selectedTask && (
          <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-lg space-y-1.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                📦 Component Manifest Array ({assets.length} items)
              </span>
              <span className="text-[8px] text-cyan-400 font-mono">Live Sync Channel</span>
            </div>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs font-mono text-slate-200 focus:outline-none"
              value={activeAssetId}
              onChange={(e) => setActiveAssetId(e.target.value)}
            >
              {assets.map((a, i) => (
                <option key={a.id} value={a.id}>
                  [{String(i + 1).padStart(2, "0")}] {a.id} ({a.state})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scanning - Only show if not FACTORY_ONLY */}
        {profile !== "DRIVER" && manifest.scope !== "FACTORY_ONLY" && selectedTask && (
                  <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleBulkNFCScan}
              className="col-span-2 bg-gradient-to-r from-cyan-950 to-slate-900 hover:from-cyan-900 border border-cyan-500/40 p-2 rounded text-center transition shadow-md"
            >
              <div className="text-cyan-400 font-bold tracking-widest text-[9px] uppercase">
                📡 EXECUTE BULK NFC/RFID GATEWAY SCAN
              </div>
            </button>
            <button
              onClick={handleSingleQRScan}
              className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[9px] uppercase tracking-wider font-bold rounded text-slate-300 transition"
            >
              📷 SCAN QR CODE
            </button>
          </div>
        )}

        {/* Asset Details - Only show if not FACTORY_ONLY */}
{manifest.scope !== "FACTORY_ONLY" && selectedTask && (
          <div className="grid grid-cols-2 gap-2 bg-slate-950/50 p-2.5 border border-slate-800 rounded-lg text-xs">
            <div>
              <span className="block text-[8px] text-slate-500 uppercase tracking-wider">
                Asset serialization key:
              </span>
              <span className="font-mono font-bold text-slate-300 truncate block">
                {profile === "INSPECTOR" && !currentAsset?.hasScannedQR
                  ? "[SCAN REQUIRED]"
                  : currentAsset?.state === "INITIALIZED" && !currentAsset?.hasScannedQR
                  ? "[AWAITING SCAN SYNC]"
                  : currentAsset?.id}
              </span>
            </div>
            <div>
              <span className="block text-[8px] text-slate-500 uppercase tracking-wider">
                System State Value:
              </span>
              <span
                className={`font-bold tracking-wide uppercase ${
                  currentAsset?.state.includes("REJECTED") ? "text-red-500" : "text-cyan-400"
                }`}
              >
                {currentAsset?.state}
              </span>
            </div>
            {currentAsset?.hasScannedQR && currentAsset?.metadata && (
              <div className="col-span-2 grid grid-cols-4 gap-1.5 pt-2 mt-2 border-t border-slate-900 text-center animate-fade-in">
                <div className="bg-slate-900/60 p-1 rounded border border-slate-800 text-[10px]">
                  <div className="text-[7px] text-slate-500 uppercase font-bold">Length</div>
                  <div className="font-mono text-slate-300">{currentAsset?.metadata.length_meters}m</div>
                </div>
                <div className="bg-slate-900/60 p-1 rounded border border-slate-800 text-[10px]">
                  <div className="text-[7px] text-slate-500 uppercase font-bold">Width</div>
                  <div className="font-mono text-slate-300">{currentAsset?.metadata.width_meters}m</div>
                </div>
                <div className="bg-slate-900/60 p-1 rounded border border-slate-800 text-[10px]">
                  <div className="text-[7px] text-slate-500 uppercase font-bold">Height</div>
                  <div className="font-mono text-slate-300">{currentAsset?.metadata.height_meters}m</div>
                </div>
                <div className="bg-slate-900/60 p-1 rounded border border-slate-800 text-[10px]">
                  <div className="text-[7px] text-slate-500 uppercase font-bold">Weight</div>
                  <div className="font-mono text-amber-500 font-bold">{currentAsset?.metadata.weight_tons}T</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Documents & SLA */}
{profile !== "DRIVER" && manifest.scope !== "FACTORY_ONLY" && selectedTask && (
          <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg text-[11px] space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Manifest Group Reference Link:</span>
              <span className="font-mono text-cyan-400 font-bold bg-slate-900 px-1 rounded border border-slate-800">
                {manifest.manifest_group_id}
              </span>
            </div>
                        
              {/* Time Tracking per Phase */}
            <div className="pt-1.5 border-t border-slate-900 grid grid-cols-3 text-[9px] text-slate-500 text-center font-mono">
              <div>
                🏭 Factory:
                <span className="text-slate-300 font-bold block">{getPlantSLA()}m</span>
{(currentAsset?.factory_delay_minutes || 0) > 0 && (  
                <span className="text-red-400 text-[7px]">(+{currentAsset?.factory_delay_minutes}m delays)</span>
                )}
              </div>
              <div>
                🚚 Transit:
                <span className="text-amber-500 font-bold block">{getTransitSLA()}m</span>
{(currentAsset?.transit_delay_minutes || 0) > 0 && (
                  <span className="text-red-400 text-[7px]">(+{currentAsset?.transit_delay_minutes}m delays)</span>
                )}
              </div>
              <div>
                🏗️ Site:
                <span className="text-blue-400 font-bold block">{getSiteSLA()}m</span>
{(currentAsset?.site_delay_minutes || 0) > 0 && (
                  <span className="text-red-400 text-[7px]">(+{currentAsset?.site_delay_minutes}m delays)</span>
                )}
              </div>
            </div>
            {/* Total Trip Duration */}
            {getTotalTripDuration() > 0 && (
              <div className="text-center text-[8px] text-slate-500 font-mono border-t border-slate-800/40 pt-1">
                Total Trip Duration: <span className="text-cyan-400 font-bold">{getTotalTripDuration()}m</span>
                {(() => {
                  const delays = getDelayBreakdown();
                  const totalDelays = delays.plantDelays + delays.transitDelays + delays.siteDelays;
                  if (totalDelays > 0) {
                    return <span className="text-red-400"> (Includes {totalDelays}m total delays)</span>;
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-950/30 border border-red-800 text-red-400 p-2 rounded text-xs font-mono">
            ⚠️ {error}
          </div>
        )}

        {/* Trip Complete Message Based on Scope */}
        {selectedTask && assets.length > 0 && isTripComplete() && (
          <div className="bg-green-950/20 border border-green-900/40 p-2 rounded-lg text-center">
            <span className="text-green-400 font-bold text-xs block">
              {getScopeStatusMessage()}
            </span>
            <span className="text-green-400/60 text-[8px] font-mono">
              Trip ID: {manifest.manifest_group_id}
            </span>
          </div>
        )}

        {/* Action panels - Conditional based on scope */}
        <div className="border-t border-slate-800/80 pt-1.5">

                    {/* INSPECTOR NODE */}
          {profile === "INSPECTOR" && manifest.scope === "FULL" && selectedTask && (
            <div className="space-y-3 animate-fade-in">
              <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                Available System Actions:
              </span>
              {!currentAsset?.state.includes("REJECTED") ? (
                <div className="space-y-3">
                                  {/* Site GPS sharing — two-way with RAMCO planner */}
                  <SiteGpsButton
                    manifestGroupId={manifest.manifest_group_id}
                    siteName={selectedTask?.site_name}
                    currentLat={selectedTask?.site_latitude}
                    currentLng={selectedTask?.site_longitude}
                    currentSource={selectedTask?.site_gps_source}
                    currentUpdatedAt={selectedTask?.site_gps_updated_at}
                    onSaved={(la, ln, src) => {
                      setSelectedTask((prev) =>
                        prev
                          ? {
                              ...prev,
                              site_latitude: la,
                              site_longitude: ln,
                              site_gps_source: src,
                              site_gps_updated_at: new Date().toISOString(),
                            }
                          : prev
                      );
                    }}
                  />
                                    {/* View Delivery Note — inspector can verify against physical copy */}
                  <button
                    onClick={() => setShowDeliveryNote(true)}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 font-bold p-2 rounded text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
                  >
                    📋 View Delivery Note
                  </button>
                  <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg text-xs space-y-1.5">
  {/* Compute document presence + scan state once, so both the checkbox
      and its label use the same rule. */}
  {(() => {
    const scanned = !!currentAsset?.hasScannedQR;
    const completed = currentAsset?.state === "INSTALLATION_COMPLETED";

    const hasEpd =
      !!(currentAsset?.epd1_certificate_url || currentAsset?.epd2_certificate_url);
    const hasMix =
      !!(currentAsset?.mix1_certificate_url || currentAsset?.mix2_certificate_url);
    const hasDeliveryNote = !!manifest.delivery_note_url;

    const epdEnabled = scanned && hasEpd && !completed;
    const mixEnabled = scanned && hasMix && !completed;
    const noteEnabled = scanned && hasDeliveryNote && !completed;

    return (
      <>
        {/* Verify EPD */}
        <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={checkedEPD}
            disabled={!epdEnabled}
            onChange={(e) => setCheckedEPD(e.target.checked)}
            className="rounded accent-cyan-500 disabled:opacity-30"
          />
          <span
            className={
              !scanned
                ? "text-slate-600 italic"
                : !hasEpd
                ? "text-amber-500 italic"
                : ""
            }
          >
            {!scanned
              ? "Verify Twin Life Cycle Assessment (LCA / EPD Compliance)"
              : !hasEpd
              ? "⚠️ Verify EPD — awaiting RAMCO"
              : "Verify Twin Life Cycle Assessment (LCA / EPD Compliance)"}
          </span>
        </label>

        {/* Verify Mix Design */}
        <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={checkedMixDesign}
            disabled={!mixEnabled}
            onChange={(e) => setCheckedMixDesign(e.target.checked)}
            className="rounded accent-cyan-500 disabled:opacity-30"
          />
          <span
            className={
              !scanned
                ? "text-slate-600 italic"
                : !hasMix
                ? "text-amber-500 italic"
                : ""
            }
          >
            {!scanned
              ? "Verify High-Performance Structural Mix Design Specs"
              : !hasMix
              ? "⚠️ Verify Mix Design — awaiting RAMCO"
              : "Verify High-Performance Structural Mix Design Specs"}
          </span>
        </label>

        {/* Verify Delivery Note */}
        <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={checkedDeliveryNote}
            disabled={!noteEnabled}
            onChange={(e) => setCheckedDeliveryNote(e.target.checked)}
            className="rounded accent-cyan-500 disabled:opacity-30"
          />
          <span
            className={
              !scanned
                ? "text-slate-600 italic"
                : !hasDeliveryNote
                ? "text-amber-500 italic"
                : ""
            }
          >
            {!scanned
              ? "📋 Verify Delivery Note"
              : !hasDeliveryNote
              ? "⚠️ Verify Delivery Note — awaiting RAMCO"
              : "📋 Verify Delivery Note"}
          </span>
        </label>
      </>
    );
  })()}
</div>

                  <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg">
                    <span className="block text-[8px] text-slate-400 uppercase font-bold mb-2">
                      Select Structural Anomaly Core Reason:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {DEFECT_VECTORS.map((defect) => (
                        <label
                          key={defect}
                          className={`flex items-center gap-2 p-1.5 rounded border text-xs cursor-pointer select-none transition ${
                            selectedInspectorDefect === defect
                              ? "bg-amber-950/40 border-amber-800 text-amber-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name="inspectorDefect"
                            value={defect}
                            checked={selectedInspectorDefect === defect}
                            onChange={(e) => setSelectedInspectorDefect(e.target.value)}
                            className="accent-amber-500"
                          />
                          <span>{defect}</span>
                        </label>
                      ))}
                    </div>
                    <PhotoUploader files={inspectorRejectFiles} setFiles={setInspectorRejectFiles} maxFiles={3} />
                  </div>

                  {/* Geofence status with manual override */}
                  {!manifest.geofence_verified ? (
                    <div className="space-y-2">
                      <div className="bg-red-950/20 border border-red-900/40 p-2 rounded text-[10px] text-amber-500 text-center font-mono">
                        🔒 GEOFENCE LOCK: Site handshake control offline. Manual override available below.
                      </div>
                      <button
                        onClick={handleManualGeofenceOverride}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold p-2 rounded text-xs uppercase tracking-wider transition"
                      >
                        🔓 MANUAL OVERRIDE GEOFENCE
                      </button>
                    </div>
                  ) : (
                    <div className="bg-green-950/20 border border-green-900/40 p-2 rounded text-[10px] text-green-400 text-center font-mono">
                      ✅ GEOFENCE VERIFIED: Site handshake complete. Proceed with operations.
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {(currentAsset?.state === "ARRIVED_AT_GATE" || currentAsset?.state === "DISPATCHED") && (
                        <button
                          onClick={() => {
                            const defectLabel = selectedInspectorDefect === "No Defects"
                              ? "NO_DEFECTS"
                              : selectedInspectorDefect.toUpperCase().replace(/ /g, '_');
                            const stateWithDefect = `RECEIVED_ON_SITE_${defectLabel}`;
                            transitionAllAssets(stateWithDefect);
                          }}
                          className="col-span-2 bg-green-600 hover:bg-green-500 text-slate-950 font-bold p-2.5 rounded text-xs uppercase tracking-wider transition"
                        >
                          📋 RECEIVED+APPROVED: {selectedInspectorDefect.toUpperCase()}
                        </button>
                      )}
                      {(currentAsset?.state.startsWith("RECEIVED_ON_SITE") ||
                        currentAsset?.state === "GATE_IN_OFFLOADING" ||
                        currentAsset?.state === "OFFLOADING_COMPLETED" ||
                        currentAsset?.state === "INSTALLATION_INITIATED") && (
                        <button
                          onClick={() => {
                            const nextState = (() => {
                              if (currentAsset?.state.startsWith("RECEIVED_ON_SITE")) return "GATE_IN_OFFLOADING";
                              if (currentAsset?.state === "GATE_IN_OFFLOADING") return "OFFLOADING_COMPLETED";
                              if (currentAsset?.state === "OFFLOADING_COMPLETED") return "INSTALLATION_INITIATED";
                              if (currentAsset?.state === "INSTALLATION_INITIATED") return "INSTALLATION_COMPLETED";
                              return null;
                            })();
                            if (nextState) {
                              if ((nextState === "INSTALLATION_INITIATED" || nextState === "INSTALLATION_COMPLETED") && !manifest.geofence_verified) {
                                setError("GEOFENCE_LOCKOUT: Please override geofence first.");
                                return;
                              }
                              transitionAllAssets(nextState);
                            }
                          }}
                          disabled={
                            (currentAsset?.state === "OFFLOADING_COMPLETED" || currentAsset?.state === "INSTALLATION_INITIATED") &&
                            !manifest.geofence_verified
                          }
                          className="col-span-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold p-2.5 rounded text-xs uppercase tracking-wider transition disabled:opacity-30 disabled:pointer-events-none"
                        >
                          {currentAsset?.state.startsWith("RECEIVED_ON_SITE") && "🔄 INITIATE OFFLOADING"}
                          {currentAsset?.state === "GATE_IN_OFFLOADING" && "✅ COMPLETE OFFLOADING"}
                          {currentAsset?.state === "OFFLOADING_COMPLETED" && "🏗️ INITIATE INSTALLATION"}
                          {currentAsset?.state === "INSTALLATION_INITIATED" && "✅ COMPLETE INSTALLATION"}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(currentAsset?.state === "ARRIVED_AT_GATE" ||
                        currentAsset?.state.startsWith("RECEIVED_ON_SITE") ||
                        currentAsset?.state === "GATE_IN_OFFLOADING") && (
                        <button
                          onClick={() =>
                            transitionTo(
                              `REJECTED_SITE_${selectedInspectorDefect.toUpperCase().replace(/ /g, '_')}`,
                              {
                                site_rejection_reason: `Gate Refusal Exception Code: [${selectedInspectorDefect}].`
                              }
                            )
                          }
                          className="bg-red-950 text-red-400 border border-red-900 font-bold p-2 rounded text-xs uppercase transition"
                        >
                          Gate Reject
                        </button>
                      )}
                      {currentAsset?.state === "INSTALLATION_INITIATED" && (
                        <button
                          onClick={() =>
                            transitionTo(
                              `REJECTED_SITE_${selectedInspectorDefect.toUpperCase().replace(/ /g, '_')}`,
                              {
                                site_rejection_reason: `On-site placement structural anomaly: [${selectedInspectorDefect}].`
                              }
                            )
                          }
                          className="bg-red-950 text-red-400 border border-red-900 font-bold p-2 rounded text-xs uppercase transition"
                        >
                          Reject Element
                        </button>
                      )}
                    </div>

                    {getOffloadingDuration() !== null && (
                      <div className="bg-slate-950 p-2 border border-slate-700 rounded-lg text-xs text-slate-400">
                        ⏱️ Offloading Duration: <span className="text-cyan-400 font-bold">{getOffloadingDuration()} minutes</span>
                      </div>
                    )}
                    {getInstallationDuration() !== null && (
                      <div className="bg-slate-950 p-2 border border-slate-700 rounded-lg text-xs text-slate-400">
                        ⏱️ Installation Duration: <span className="text-cyan-400 font-bold">{getInstallationDuration()} minutes</span>
                      </div>
                    )}

                    {/* RATING SECTION */}
                    {currentAsset?.state === "INSTALLATION_COMPLETED" && !manifest.inspectorRating && (
                      <div className="bg-slate-950 p-2.5 border border-slate-700 rounded-lg space-y-2">
                        <span className="block text-[8px] text-slate-400 uppercase font-bold">
                          ⭐ Rate Driver: {manifest.driver.name}
                        </span>
                        <div className="flex gap-1 justify-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => setRatingScore(star)}
                              className={`text-2xl transition ${
                                ratingScore >= star ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                              }`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={ratingComment}
                          onChange={(e) => setRatingComment(e.target.value)}
                          placeholder="Optional feedback..."
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 h-12 resize-none"
                        />
                        <button
                          onClick={submitRating}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-1.5 rounded text-xs uppercase transition"
                        >
                          Submit Rating
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-red-950/20 border border-red-900/40 rounded-lg text-center">
                  <span className="text-xs text-red-400 block mb-2 font-mono">
                    Focused Component Flag Status: {currentAsset?.state}
                  </span>
                  <button
                    onClick={() =>
                      setAssets(prev =>
                        prev.map(a =>
                          a.id === activeAssetId
                            ? { ...a, state: "ARRIVED_AT_GATE", site_rejection_reason: null, rejection_photos: [] }
                            : a
                        )
                      )
                    }
                    className="w-full bg-amber-600 text-slate-950 font-bold py-1 rounded text-xs uppercase transition"
                  >
                    ⚠ Clear Rejection Lockout
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Dispatcher Node */}
          {profile === "DISPATCHER" && selectedTask && assets.length > 0 && renderDispatcherActions()}
        </div>

       
      </div>

      {/* Delivery Note Modal */}
      <DeliveryNoteModal
        isOpen={showDeliveryNote}
        onClose={() => setShowDeliveryNote(false)}
        manifestId={manifest.manifest_group_id}
        driverName={manifest.driver.name}
        driverPhone={manifest.driver.phone}
        vehiclePlate={manifest.vehicle.plateNumber}
        vehicleTrailerType={manifest.vehicle.trailerType}
        siteName={selectedTask?.site_name || "Project Site"}
        siteAddress={selectedTask?.site_name || "Abu Dhabi, UAE"}
        inspectorName={manifest.siteInspector.name}
        inspectorPhone={manifest.siteInspector.phone}
        orderDetails={(selectedTask as any)?.order_details || []}
        assignedAt={selectedTask?.assigned_at}
        factory={selectedTask?.factories?.[0]?.factory_name || null}
      />

      {/* Full-screen navigation overlay (top-level modal) */}
      <FullScreenNav
        isOpen={showFullScreenNav}
        onClose={() => setShowFullScreenNav(false)}
        driverLat={selectedTask?.driver_current_lat ?? null}
        driverLng={selectedTask?.driver_current_lng ?? null}
        siteLat={selectedTask?.site_latitude ?? null}
        siteLng={selectedTask?.site_longitude ?? null}
        siteName={selectedTask?.site_name || "Site"}
        vehiclePlate={manifest.vehicle.plateNumber}
        manifestGroupId={manifest.manifest_group_id}
        onDelayLogged={() => {
          loadAssetsForTask(manifest.manifest_group_id);
        }}
      />
    </div>
  );
}