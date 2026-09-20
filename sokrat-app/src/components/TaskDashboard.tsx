"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../app/lib/supabase";
import { reverseGeocode } from "../app/lib/geocode";
import { fetchRoute } from "../app/lib/routing";
import { simulateDriverAlongRoute } from "../app/lib/simulate";
import NavigationPanel from "./NavigationPanel";
import React from "react";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("./MiniMap"), { ssr: false });

type Factory = {
  factory_id: string;
  factory_name: string;
  dispatcher_name: string;
  panels_count: number;
  loading_order: number;
  status?: string;
  lat?: number;
  lng?: number;
};

export type SelectedTaskData = {
  task_id: string;
  manifest_group_id: string;
  status: string;
  priority: string;
  assigned_by: string;
  assigned_at: string;
  trip_details: any;
  order_details?: any[];
  factories: Factory[];
  current_stage?: number | null;

  driver_name?: string | null;
  driver_phone?: string | null;
  driver_rating?: number | null;
  driver_total_trips?: number | null;

  vehicle_plate?: string | null;
  vehicle_trailer_type?: string | null;
  vehicle_ownership?: string | null;

  inspector_name?: string | null;
  inspector_phone?: string | null;
  inspector_email?: string | null;

  driver_current_lat?: number | null;
  driver_current_lng?: number | null;
  driver_last_update?: string | null;
  driver_status?: string | null;

  site_name?: string | null;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_gps_source?: string | null;
  site_gps_updated_at?: string | null;

  selected_scope?: string | null;
  selected_defect?: string | null;
  dispatcher_panels_count?: number | null;
  dispatcher_notes?: string | null;

  epd1_url?: string | null;
  mix1_url?: string | null;
  epd2_url?: string | null;
  mix2_url?: string | null;

  delivery_note_url?: string | null;
  delivery_note_file_name?: string | null;
};

type UserTask = SelectedTaskData & {
  id: string;
  user_name: string;
  user_role: string;
  due_at: string;
  current_stage?: number | null;
  asset_count?: number;
  current_state?: string;
};

type Props = {
  userName: string;
  userRole: string;
  selectedTaskId?: string | null;
  onSelectTask?: (task: SelectedTaskData | null) => void;
  refreshKey?: number;   // bump this from parent to force reload
};

// ---- Reverse-geocoded site label ----
function useSiteLabel(
  lat: number | null | undefined,
  lng: number | null | undefined
) {
  const [label, setLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (lat == null || lng == null) {
      setLabel(null);
      return;
    }
    let cancelled = false;
    reverseGeocode(lat, lng).then((result) => {
      if (!cancelled) setLabel(result);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return label;
}

function SiteRow({ task }: { task: UserTask }) {
  const geoLabel = useSiteLabel(task.site_latitude, task.site_longitude);
  const hasCoords = task.site_latitude != null && task.site_longitude != null;

  let display: string;
  let subLabel: string | null = null;

  if (!hasCoords) {
    display = "Awaiting coordinates";
    subLabel = "Inspector or RAMCO has not shared GPS yet";
  } else if (geoLabel) {
    display = geoLabel;
    subLabel = `${task.site_latitude!.toFixed(4)}, ${task.site_longitude!.toFixed(4)}`;
  } else if (task.site_name) {
    display = task.site_name;
    subLabel = `${task.site_latitude!.toFixed(4)}, ${task.site_longitude!.toFixed(4)}`;
  } else {
    display = `${task.site_latitude!.toFixed(4)}, ${task.site_longitude!.toFixed(4)}`;
  }

  return (
    <div className="border-t border-slate-800/60 pt-1 text-[9px] space-y-0.5">
      <div className="grid grid-cols-2 gap-1">
        <span className="text-slate-500">📍 Site:</span>
        <span
          className={`text-right ${
            hasCoords ? "text-slate-200" : "text-amber-500 italic"
          }`}
        >
          {display}
        </span>
      </div>
      {subLabel && (
        <div className="grid grid-cols-2 gap-1">
          <span className="text-slate-600 text-[8px]">
            {hasCoords ? "Coordinates:" : ""}
          </span>
          <span className="text-slate-500 text-right text-[8px] font-mono">
            {subLabel}
          </span>
        </div>
      )}
      {hasCoords && task.site_gps_source && (
        <div className="grid grid-cols-2 gap-1">
          <span className="text-slate-600 text-[8px]">Source:</span>
          <span className="text-right text-[8px]">
            <span
              className={`px-1.5 py-0.5 rounded font-bold ${
                task.site_gps_source === "INSPECTOR"
                  ? "bg-cyan-950/50 text-cyan-400"
                  : task.site_gps_source === "RAMCO"
                  ? "bg-purple-950/50 text-purple-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {task.site_gps_source}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const timeSince = (timestamp: string | null | undefined) => {
  if (!timestamp) return "N/A";
  const now = new Date();
  const then = new Date(timestamp);
  const diffMins = Math.round((now.getTime() - then.getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
};

export default function TaskDashboard({
  userName,
  userRole,
  selectedTaskId,
  onSelectTask,
  refreshKey = 0,
}: Props) {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Demo-only simulated driver position
  const [simPos, setSimPos] = useState<{
    taskId: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const simCancelRef = useRef<(() => void) | null>(null);

  const isDemoMode =
    typeof window !== "undefined" &&
    window.location.search.includes("demo=1");

  const startSimulation = async (task: UserTask) => {
    if (!task.site_latitude || !task.site_longitude) {
      alert("Task has no site coordinates yet.");
      return;
    }

    const origin: [number, number] | null =
      task.factories?.[0]?.lat && task.factories?.[0]?.lng
        ? [task.factories[0].lat!, task.factories[0].lng!]
        : task.driver_current_lat && task.driver_current_lng
        ? [task.driver_current_lat, task.driver_current_lng]
        : null;

    if (!origin) {
      alert("No origin GPS available (factory or driver).");
      return;
    }

    const route = await fetchRoute(origin, [
      task.site_latitude,
      task.site_longitude,
    ]);

    simCancelRef.current?.();
    setSimRunning(true);

    const cancel = simulateDriverAlongRoute({
      route: route.coordinates,
      durationMs: 20000,
      intervalMs: 400,
      onTick: (lat, lng) => {
        setSimPos({ taskId: task.id, lat, lng });
      },
      onDone: () => {
        setSimRunning(false);
        simCancelRef.current = null;
      },
    });

    simCancelRef.current = cancel;
  };

  const stopSimulation = () => {
    simCancelRef.current?.();
    simCancelRef.current = null;
    setSimRunning(false);
    setSimPos(null);
  };

  const loadTasks = async () => {
    const { data: taskData, error: taskError } = await supabase
      .from("user_tasks")
      .select("*")
      .eq("user_name", userName)
      .eq("user_role", userRole)
      .order("manifest_group_id", { ascending: true });

    if (taskError || !taskData) {
      setLoading(false);
      return;
    }

    const manifestIds = taskData.map((t) => t.manifest_group_id);

    const { data: manifestData } = await supabase
      .from("manifests")
      .select(
        "manifest_group_id, factories, order_details, current_stage, driver_name, driver_phone, driver_rating, driver_total_trips, vehicle_plate, vehicle_trailer_type, vehicle_ownership, inspector_name, inspector_phone, inspector_email, driver_current_lat, driver_current_lng, driver_last_update, driver_status, site_name, site_latitude, site_longitude, site_gps_source, site_gps_updated_at, selected_scope, selected_defect, dispatcher_panels_count, dispatcher_notes, epd1_url, mix1_url, epd2_url, mix2_url, delivery_note_url, delivery_note_file_name"
      )
      .in("manifest_group_id", manifestIds);
    // Count actual assets per manifest + track current state
    const { data: assetCounts } = await supabase
      .from("assets")
      .select("manifest_group_id, state")
      .in("manifest_group_id", manifestIds);

    const assetCountByManifest: Record<string, number> = {};
    const currentStateByManifest: Record<string, string> = {};

    // Rank order — lower = less advanced. We pick the *least advanced*
    // state so that if ANY panel is still at the factory, the whole trip
    // reads as "at factory".
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

    (assetCounts || []).forEach((row: any) => {
      const id = row.manifest_group_id;
      assetCountByManifest[id] = (assetCountByManifest[id] || 0) + 1;
      const prev = currentStateByManifest[id];
      if (prev === undefined || stateRank(row.state) < stateRank(prev)) {
        currentStateByManifest[id] = row.state;
      }
    });

    const driverNames = [
      ...new Set(taskData.map((t) => t.driver_name).filter(Boolean)),
    ];
    const { data: driverData } = await supabase
      .from("drivers")
      .select("name, rating, total_trips")
      .in("name", driverNames);

    const getDriverRating = (driverName: string | null | undefined) => {
      if (!driverName) return null;
      return driverData?.find((d) => d.name === driverName);
    };

    const enrichedTasks: UserTask[] = taskData.map((task) => {
      const manifest = manifestData?.find(
        (m) => m.manifest_group_id === task.manifest_group_id
      );
              return {
          ...task,
          factories: manifest?.factories || [],
          order_details: manifest?.order_details,
          current_stage: manifest?.current_stage,
          asset_count: assetCountByManifest[task.manifest_group_id] || 0,
          current_state: currentStateByManifest[task.manifest_group_id] || "INITIALIZED",
          driver_name: manifest?.driver_name,
        driver_phone: manifest?.driver_phone,
        driver_rating:
          getDriverRating(manifest?.driver_name)?.rating ??
          manifest?.driver_rating,
        driver_total_trips:
          getDriverRating(manifest?.driver_name)?.total_trips ??
          manifest?.driver_total_trips,
        vehicle_plate: manifest?.vehicle_plate,
        vehicle_trailer_type: manifest?.vehicle_trailer_type,
        vehicle_ownership: manifest?.vehicle_ownership,
        inspector_name: manifest?.inspector_name,
        inspector_phone: manifest?.inspector_phone,
        inspector_email: manifest?.inspector_email,
        driver_current_lat: manifest?.driver_current_lat,
        driver_current_lng: manifest?.driver_current_lng,
        driver_last_update: manifest?.driver_last_update,
        driver_status: manifest?.driver_status,
        site_name: manifest?.site_name,
        site_latitude: manifest?.site_latitude,
        site_longitude: manifest?.site_longitude,
        site_gps_source: manifest?.site_gps_source,
        site_gps_updated_at: manifest?.site_gps_updated_at,
        selected_scope: manifest?.selected_scope,
        selected_defect: manifest?.selected_defect,
        dispatcher_panels_count: manifest?.dispatcher_panels_count,
        dispatcher_notes: manifest?.dispatcher_notes,
        epd1_url: manifest?.epd1_url,
        mix1_url: manifest?.mix1_url,
        epd2_url: manifest?.epd2_url,
        mix2_url: manifest?.mix2_url,
        delivery_note_url: manifest?.delivery_note_url,
        delivery_note_file_name: manifest?.delivery_note_file_name,
      };
    });

     // Sort by priority: HIGH → MEDIUM → LOW, then by manifest ID
    const priorityRank: Record<string, number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
    };
    const sorted = [...enrichedTasks].sort((a, b) => {
      const ra = priorityRank[a.priority] ?? 99;
      const rb = priorityRank[b.priority] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.manifest_group_id.localeCompare(b.manifest_group_id);
    });

    setTasks(sorted);
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, [userName, userRole, refreshKey]);

  if (loading) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center text-xs text-slate-400">
        Loading tasks...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center text-xs text-slate-400">
        📋 No tasks assigned to {userName}
      </div>
    );
  }
// ---- Status pill derived from current_state ----
function getStatusPill(state: string | undefined) {
  const s = state || "";
  if (s.includes("REJECTED"))
    return { label: "REJECTED", cls: "bg-red-950/60 text-red-400 border-red-900" };
  if (s === "INSTALLATION_COMPLETED")
    return { label: "✅ COMPLETED", cls: "bg-green-950/60 text-green-400 border-green-900" };
  if (
    s.startsWith("DISPATCHED") ||
    s === "ARRIVED_AT_GATE" ||
    s.startsWith("RECEIVED_ON_SITE") ||
    s === "GATE_IN_OFFLOADING" ||
    s === "OFFLOADING_COMPLETED" ||
    s === "INSTALLATION_INITIATED"
  )
    return { label: "🚚 IN PROGRESS", cls: "bg-blue-950/60 text-blue-300 border-blue-900" };
  if (s === "INITIALIZED" || s.startsWith("LOADING"))
    return { label: "🟡 PENDING", cls: "bg-amber-950/60 text-amber-400 border-amber-900" };
  return { label: "🟡 PENDING", cls: "bg-amber-950/60 text-amber-400 border-amber-900" };
}
  const priorityColor = (p: string) => {
    if (p === "HIGH") return "bg-red-950/50 text-red-400";
    if (p === "MEDIUM") return "bg-amber-950/50 text-amber-400";
    return "bg-slate-800 text-slate-400";
  };

  const handleTaskClick = async (task: UserTask) => {
    const isSame = expandedTaskId === task.id;

    if (isSame) {
      setExpandedTaskId(null);
      if (onSelectTask) onSelectTask(null as any);
      return;
    }

    await loadTasks();
    setExpandedTaskId(task.id);

    if (onSelectTask) {
      onSelectTask({
        task_id: task.id,
        manifest_group_id: task.manifest_group_id,
        status: task.status,
        priority: task.priority,
        assigned_by: task.assigned_by,
        assigned_at: task.assigned_at,
        trip_details: task.trip_details,
        factories: task.factories || [],
        driver_name: task.driver_name,
        driver_phone: task.driver_phone,
        driver_rating: task.driver_rating,
        driver_total_trips: task.driver_total_trips,
        vehicle_plate: task.vehicle_plate,
        vehicle_trailer_type: task.vehicle_trailer_type,
        vehicle_ownership: task.vehicle_ownership,
        inspector_name: task.inspector_name,
        inspector_phone: task.inspector_phone,
        inspector_email: task.inspector_email,
        driver_current_lat: task.driver_current_lat,
        driver_current_lng: task.driver_current_lng,
        driver_last_update: task.driver_last_update,
        driver_status: task.driver_status,
        site_name: task.site_name,
        site_latitude: task.site_latitude,
        site_longitude: task.site_longitude,
        site_gps_source: task.site_gps_source,
        site_gps_updated_at: task.site_gps_updated_at,
        selected_scope: task.selected_scope,
        selected_defect: task.selected_defect,
        dispatcher_panels_count: task.dispatcher_panels_count,
        dispatcher_notes: task.dispatcher_notes,
        epd1_url: task.epd1_url,
        mix1_url: task.mix1_url,
        epd2_url: task.epd2_url,
        mix2_url: task.mix2_url,
        delivery_note_url: task.delivery_note_url,
        delivery_note_file_name: task.delivery_note_file_name,
        order_details: task.order_details,
      });
    }
  };

  return (
    <div className="bg-slate-950 border border-cyan-900/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
        <span className="text-[9px] uppercase font-bold text-cyan-400 tracking-wider">
          📋 My Assigned Tasks ({tasks.length})
        </span>
        <span className="text-[8px] text-slate-500">
          {userName} • {userRole}
        </span>
      </div>

      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
        {tasks.map((task) => {
          const isMultiFactory = task.factories && task.factories.length > 1;
          const isExpanded = expandedTaskId === task.id;
          const isSimForThisTask = simPos?.taskId === task.id;

          return (
            <div
              key={task.id}
              className={`bg-slate-900 border rounded text-xs transition cursor-pointer ${
                isExpanded
                  ? "border-cyan-500 ring-1 ring-cyan-500/40"
                  : "border-slate-800 hover:border-cyan-800"
              }`}
              onClick={() => handleTaskClick(task)}
            >
              <div className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-200 text-[10px] truncate">
                    {task.manifest_group_id}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-[8px] px-2 py-0.5 rounded font-bold border ${getStatusPill(task.current_state).cls}`}
                    >
                      {getStatusPill(task.current_state).label}
                    </span>
                    <span
                      className={`text-[8px] px-2 py-0.5 rounded font-bold ${priorityColor(
                        task.priority
                      )}`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>

                {isMultiFactory && userRole === "DISPATCHER" && (
                  <div className="mt-1 bg-purple-950/30 border border-purple-800/50 rounded px-1.5 py-0.5">
                    <span className="text-[8px] text-purple-300 font-bold">
                      🏭 {task.factories!.length}-Stage Multi-Factory Load
                    </span>
                  </div>
                )}

                <div className="flex justify-between mt-1 text-[9px] text-slate-400">
                  <span>Assigned by: {task.assigned_by}</span>
                  <span className="text-cyan-400">{task.status}</span>
                </div>

                <div className="mt-0.5 text-[8px] text-slate-500">
                  🕐 {formatTimestamp(task.assigned_at)}
                </div>
              </div>

              {isExpanded && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-slate-800 pt-2">
                  <div className="grid grid-cols-2 gap-1 text-[9px]">
                    <div className="text-slate-500">👤 Assigned by:</div>
                    <div className="text-slate-200 text-right font-bold">
                      {task.assigned_by}
                    </div>
                    <div className="text-slate-500">🕐 Assigned at:</div>
                    <div className="text-slate-300 text-right text-[8px]">
                      {formatTimestamp(task.assigned_at)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[9px] border-t border-slate-800/60 pt-1">
                    <div className="text-slate-500">📋 Scope:</div>
                    <div className="text-cyan-400 text-right font-bold">
                      {task.selected_scope || "FULL"}
                    </div>
                  </div>

                  {task.driver_name && (
                    <div className="grid grid-cols-2 gap-1 text-[9px] border-t border-slate-800/60 pt-1">
                      <div className="text-slate-500">🚚 Driver:</div>
                      <div className="text-slate-200 text-right font-medium">
                        {task.driver_name}
                      </div>
                      {task.driver_phone && (
                        <>
                          <div className="text-slate-500">📞 Contact:</div>
                          <div className="text-slate-200 text-right font-mono text-[8px]">
                            {task.driver_phone}
                          </div>
                        </>
                      )}
                      {task.driver_rating !== null &&
                        task.driver_rating !== undefined &&
                        task.driver_rating > 0 && (
                          <>
                            <div className="text-slate-500">⭐ Rating:</div>
                            <div className="text-amber-400 text-right font-bold">
                              {task.driver_rating.toFixed(1)} ★ (
                              {task.driver_total_trips || 0} trips)
                            </div>
                          </>
                        )}
                    </div>
                  )}

                  {task.vehicle_plate && (
                    <div className="grid grid-cols-2 gap-1 text-[9px] border-t border-slate-800/60 pt-1">
                      <div className="text-slate-500">🚛 Plate:</div>
                      <div className="text-slate-200 text-right font-mono">
                        {task.vehicle_plate}
                      </div>
                      {task.vehicle_trailer_type && (
                        <>
                          <div className="text-slate-500">Trailer:</div>
                          <div className="text-slate-200 text-right">
                            {task.vehicle_trailer_type}
                          </div>
                        </>
                      )}
                      {task.vehicle_ownership && (
                        <>
                          <div className="text-slate-500">Ownership:</div>
                          <div
                            className={`text-right font-bold ${
                              task.vehicle_ownership === "OWNED"
                                ? "text-green-400"
                                : "text-amber-400"
                            }`}
                          >
                            {task.vehicle_ownership}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {task.inspector_name && (
                    <div className="border-t border-slate-800/60 pt-1 text-[9px] space-y-0.5">
                      <div className="grid grid-cols-2 gap-1">
                        <span className="text-slate-500">👷 Inspector:</span>
                        <span className="text-slate-200 text-right">
                          {task.inspector_name}
                        </span>
                      </div>
                      {task.inspector_phone && (
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-slate-500">📞 Phone:</span>
                          <span className="text-slate-200 text-right font-mono text-[8px]">
                            {task.inspector_phone}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <SiteRow task={task} />

                  {task.asset_count !== undefined && task.asset_count > 0 && (
                    <div className="grid grid-cols-2 gap-1 text-[9px] border-t border-slate-800/60 pt-1">
                      <div className="text-slate-500">📦 Panels:</div>
                      <div className="text-cyan-400 text-right font-bold">
                        {task.asset_count}
                      </div>
                    </div>
                  )}

                  {isMultiFactory && userRole === "DISPATCHER" && (
                    <div className="space-y-1 border-t border-slate-800/60 pt-1">
                      {task.factories!.map((factory, idx) => {
                        const isMyStage = factory.dispatcher_name === userName;
                        return (
                          <div
                            key={idx}
                            className={`flex justify-between text-[8px] px-1.5 py-1 rounded ${
                              isMyStage
                                ? "bg-cyan-950/40 border border-cyan-800/40"
                                : "bg-slate-950/50 border border-slate-800/40"
                            }`}
                          >
                            <div className="flex flex-col">
                              <span
                                className={
                                  isMyStage
                                    ? "text-cyan-300 font-bold"
                                    : "text-slate-400"
                                }
                              >
                                Stage {factory.loading_order}:{" "}
                                {factory.factory_name}
                              </span>
                              <span className="text-slate-500 text-[7px]">
                                Dispatcher: {factory.dispatcher_name}
                                {isMyStage && " (You)"}
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-slate-300">
                                {factory.panels_count} panels
                              </span>
                              <span className="text-slate-500 text-[7px]">
                                {factory.status || "PENDING"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Live Map */}
                  {task.site_latitude && task.site_longitude && (
                    <div className="border-t border-slate-800/60 pt-1">
                      <div className="flex justify-between text-[8px] mb-1">
                        <span className="text-slate-500">🛰️ Updated:</span>
                        <span className="text-slate-400">
                          {task.driver_last_update
                            ? timeSince(task.driver_last_update)
                            : "GPS pending"}
                        </span>
                      </div>

                      {isDemoMode && (
                        <div className="flex gap-1 mb-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startSimulation(task);
                            }}
                            disabled={simRunning}
                            className="flex-1 bg-amber-600 hover:bg-amber-500 text-slate-950 text-[8px] font-bold py-1 rounded disabled:opacity-40"
                          >
                            {simRunning && isSimForThisTask
                              ? "🚚 Driving..."
                              : "🔧 Simulate Driver GPS"}
                          </button>
                          {simRunning && isSimForThisTask && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                stopSimulation();
                              }}
                              className="bg-red-700 hover:bg-red-600 text-white text-[8px] font-bold px-2 py-1 rounded"
                            >
                              ■ Stop
                            </button>
                          )}
                        </div>
                      )}

<div onClick={(e) => e.stopPropagation()} className="aspect-square w-full">
                        <MiniMap
                          driverLat={
                            isSimForThisTask
                              ? simPos.lat
                              : task.driver_current_lat
                          }
                          driverLng={
                            isSimForThisTask
                              ? simPos.lng
                              : task.driver_current_lng
                          }
                          originLat={task.factories?.[0]?.lat ?? null}
                          originLng={task.factories?.[0]?.lng ?? null}
                          originLabel={
                            task.factories?.[0]?.factory_name || "Factory"
                          }
                          currentState={
                            simRunning && isSimForThisTask
                              ? "DISPATCHED_NO_DEFECTS"
                              : task.current_state
                          }
                          siteLat={task.site_latitude}
                          siteLng={task.site_longitude}
                          siteName={task.site_name || "Site"}
                          height="320px"
                        />

                        {/* ETA card — shows for all nodes once the trip is dispatched */}
                        {task.current_state?.startsWith("DISPATCHED") &&
                          task.site_latitude &&
                          task.site_longitude && (
                            <NavigationPanel
                              driverLat={
                                isSimForThisTask
                                  ? simPos.lat
                                  : task.driver_current_lat ?? null
                              }
                              driverLng={
                                isSimForThisTask
                                  ? simPos.lng
                                  : task.driver_current_lng ?? null
                              }
                              siteLat={task.site_latitude}
                              siteLng={task.site_longitude}
                              siteName={task.site_name || "Site"}
                              isActive={true}
                                                            compact={true}
                            />
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}