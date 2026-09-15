"use client";

import { useEffect, useState } from "react";
import { supabase } from "../app/lib/supabase";
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

const formatRelativeTime = (timestamp: string) => {
  if (!timestamp) return "N/A";
  const now = new Date();
  const target = new Date(timestamp);
  const diffMs = target.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);

  if (Math.abs(diffMins) < 60) {
    return diffMins > 0 ? `in ${diffMins}m` : `${Math.abs(diffMins)}m ago`;
  }
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return diffDays > 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
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
};

type Props = {
  userName: string;
  userRole: string;
};

export default function TaskDashboard({ userName, userRole }: Props) {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from("user_tasks")
        .select("*")
        .eq("user_name", userName)
        .eq("user_role", userRole)
        .order("priority", { ascending: true })
        .order("due_at", { ascending: true });

      if (!error && data) {
        setTasks(data);
      }
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

      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {tasks.map((task) => (
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

  <div className="flex justify-between mt-1 text-[9px] text-slate-400">
  <span>Assigned by: {task.assigned_by}</span>
  <span className="text-cyan-400">{task.status}</span>
</div>

<div className="mt-0.5 text-[8px] text-slate-500">
  🕐 {formatTimestamp(task.assigned_at)}
</div>

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
        ))}
      </div>
    </div>
  );
}