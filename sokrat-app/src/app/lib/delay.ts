// ============================================================
// SOKRAT delay classifier
// Turns raw minute counts into a friendly label.
// ============================================================

export type DelayClass = "ON_TIME" | "MINOR" | "MAJOR";

export type DelayInfo = {
  className: DelayClass;
  label: string;
  totalMinutes: number;
  color: string;
  bg: string;
};

export function classifyDelay(
  plantMin = 0,
  transitMin = 0,
  siteMin = 0
): DelayInfo {
  const total = (plantMin || 0) + (transitMin || 0) + (siteMin || 0);

  if (total <= 0) {
    return {
      className: "ON_TIME",
      label: "🟢 On Time",
      totalMinutes: 0,
      color: "text-green-400",
      bg: "bg-green-950/40",
    };
  }
  if (total <= 30) {
    return {
      className: "MINOR",
      label: `🟡 Minor (${total}m)`,
      totalMinutes: total,
      color: "text-amber-400",
      bg: "bg-amber-950/40",
    };
  }
  return {
    className: "MAJOR",
    label: `🔴 Major (${total}m)`,
    totalMinutes: total,
    color: "text-red-400",
    bg: "bg-red-950/40",
  };
}

export function getStatusBadge(state: string): { label: string; color: string } {
  if (!state) return { label: "—", color: "bg-slate-800 text-slate-400" };
  if (state.includes("REJECTED"))
    return { label: "REJECTED", color: "bg-red-950/60 text-red-400" };
  if (state === "INITIALIZED" || state.startsWith("LOADING"))
    return { label: "🏭 Factory", color: "bg-orange-950/50 text-orange-400" };
  if (state.startsWith("DISPATCHED"))
    return { label: "🚚 In Transit", color: "bg-green-950/50 text-green-400" };
  if (state === "ARRIVED_AT_GATE")
    return { label: "📍 At Gate", color: "bg-blue-950/50 text-blue-400" };
  if (state.startsWith("RECEIVED") || state.includes("OFFLOADING"))
    return { label: "🏗️ On Site", color: "bg-cyan-950/50 text-cyan-400" };
  if (state.startsWith("INSTALLATION"))
    return { label: "🔧 Installing", color: "bg-purple-950/50 text-purple-400" };
  if (state === "INSTALLATION_COMPLETED")
    return { label: "✅ Complete", color: "bg-green-950/50 text-green-400" };
  return { label: state, color: "bg-slate-800 text-slate-400" };
}