"use client";

import { useEffect, useState } from "react";
import { supabase } from "../app/lib/supabase";

type Factory = {
  factory_id: string;
  factory_name: string;
  dispatcher_name: string;
  panels_count: number;
  loading_order: number;
  status?: string;
};

type UserTask = {
  id: string;
  user_name: string;
  user_role: string;
  manifest_group_id: string;
  status: string;
  priority: string;
  assigned_by: string;
  assigned_at: string;
  due_at: string;
  trip_details: any;
  factories?: Factory[];
};

type Props = {
  userName: string;
  userRole: string;
};

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

export default function TaskDashboard({ userName, userRole }: Props) {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      const { data: taskData, error: taskError } = await supabase
        .from("user_tasks")
        .select("*")
        .eq("user_name", userName)
        .eq("user_role", userRole)
        .order("priority", { ascending: true })
        .order("due_at", { ascending: true });

      if (taskError || !taskData) {
        setLoading(false);
        return;
      }

      const manifestIds = taskData.map((t) => t.manifest_group_id);

      const { data: manifestData } = await supabase
        .from("manifests")
        .select("manifest_group_id, factories")
        .in("manifest_group_id", manifestIds);

      const enrichedTasks = taskData.map((task) => {
        const manifest = manifestData?.find(
          (m) => m.manifest_group_id === task.manifest_group_id
        );
        return {
          ...task,
          factories: manifest?.factories || [],
        };
      });

      setTasks(enrichedTasks);
      setLoading(false);
    };

    loadTasks();
  }, [userName, userRole]);

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

  const priorityColor = (p: string) => {
    if (p === "HIGH") return "bg-red-950/50 text-red-400";
    if (p === "MEDIUM") return "bg-amber-950/50 text-amber-400";
    return "bg-slate-800 text-slate-400";
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

      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {tasks.map((task) => {
          const isMultiFactory = task.factories && task.factories.length > 1;

          return (
            <div
              key={task.id}
              className="bg-slate-900 border border-slate-800 rounded p-2 text-xs hover:border-cyan-800 transition cursor-pointer"
              onClick={() =>
                setExpandedTaskId(expandedTaskId === task.id ? null : task.id)
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-slate-200 text-[10px]">
                  {task.manifest_group_id}
                </span>
                <span className={`text-[8px] px-2 py-0.5 rounded font-bold ${priorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              </div>

              {isMultiFactory && (
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

              {isMultiFactory && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-800 space-y-1">
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
                          <span className={isMyStage ? "text-cyan-300 font-bold" : "text-slate-400"}>
                            Stage {factory.loading_order}: {factory.factory_name}
                          </span>
                          <span className="text-slate-500 text-[7px]">
                            Dispatcher: {factory.dispatcher_name}
                            {isMyStage && " (You)"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-slate-300">{factory.panels_count} panels</span>
                          <span className="text-slate-500 text-[7px]">
                            {factory.status || "PENDING"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {expandedTaskId === task.id && task.trip_details && (
                <div className="mt-2 pt-2 border-t border-slate-800 space-y-1 text-[9px]">
                  {task.trip_details.vehicle_plate && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Vehicle:</span>
                      <span className="text-slate-300 font-mono">
                        {task.trip_details.vehicle_plate}
                      </span>
                    </div>
                  )}
                  {task.trip_details.driver && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Driver:</span>
                      <span className="text-slate-300">{task.trip_details.driver}</span>
                    </div>
                  )}
                  {task.trip_details.site && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Site:</span>
                      <span className="text-slate-300">{task.trip_details.site}</span>
                    </div>
                  )}
                  {task.trip_details.destination && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Destination:</span>
                      <span className="text-slate-300">{task.trip_details.destination}</span>
                    </div>
                  )}
                  {task.trip_details.panels_count && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Panels:</span>
                      <span className="text-cyan-400 font-bold">
                        {task.trip_details.panels_count}
                      </span>
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