// ============================================================
// SOKRAT Routing
// OSRM hybrid with hardcoded fallback.
//
// Free, no API key.
// If OSRM is unreachable or slow, we fall back to a straight
// line so the app never breaks on stage.
//
// Used by:
//   - Task 7: NavigationPanel (driver Talabat card)
//   - Task 8: MiniMap real routes
//   - Task 10: Fleet Radar
// ============================================================

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver: string;
};

export type RouteResult = {
  coordinates: [number, number][]; // [lat, lng]
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  source: "OSRM" | "FALLBACK";
};

// Public OSRM demo server (free, no key)
const OSRM_BASE = "https://router.project-osrm.org";
const OSRM_TIMEOUT_MS = 3000;

// ------------------------------------------------------------
// Fallback route (ICAD → Yas Island) used if OSRM fails.
// Straight-line-ish with a midpoint — visually fine, never
// blocks the app.
// ------------------------------------------------------------
const FALLBACK_COORDS: [number, number][] = [
  [24.4539, 54.3773],
  [24.4678, 54.4123],
  [24.5012, 54.4567],
  [24.5198, 54.5123],
  [24.5387, 54.5678],
];

export async function fetchRoute(
  from: [number, number],
  to: [number, number]
): Promise<RouteResult> {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson&steps=true`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OSRM ${res.status}`);

    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error("No route returned");
    }

    const route = data.routes[0];

    // OSRM returns [lng, lat] — flip to [lat, lng]
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]]
    );

    // Flatten turn-by-turn steps
    const steps: RouteStep[] = [];
    (route.legs || []).forEach((leg: any) => {
      (leg.steps || []).forEach((s: any) => {
        steps.push({
          instruction: formatInstruction(s),
          distanceMeters: s.distance,
          durationSeconds: s.duration,
          maneuver: s.maneuver?.type || "continue",
        });
      });
    });

    return {
      coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      steps,
      source: "OSRM",
    };
  } catch (err) {
    console.warn("[routing] OSRM failed, using fallback:", err);
    return fallbackRoute(from, to);
  }
}

// ------------------------------------------------------------
// Fallback — simple straight-ish route with a midpoint
// ------------------------------------------------------------
function fallbackRoute(
  from: [number, number],
  to: [number, number]
): RouteResult {
  const mid: [number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
  ];
  const coordinates: [number, number][] = [from, mid, to];

  const dist = haversine(from, to);
  const durationSec = (dist / 1000 / 55) * 3600; // assume 55 km/h avg

  return {
    coordinates,
    distanceMeters: dist,
    durationSeconds: durationSec,
    steps: [
      {
        instruction: "Head toward destination",
        distanceMeters: dist,
        durationSeconds: durationSec,
        maneuver: "depart",
      },
      {
        instruction: "Arrive at destination",
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: "arrive",
      },
    ],
    source: "FALLBACK",
  };
}

// ------------------------------------------------------------
// Traffic simulation
// 🔄 MOCK → TomTom / Google Traffic API when we integrate live traffic.
// Splits the route into 3 segments and assigns traffic tiers.
// ------------------------------------------------------------
export type TrafficSegment = {
  startIndex: number;
  endIndex: number;
  tier: "CLEAR" | "MODERATE" | "HEAVY";
  color: string;
  addedMinutes: number;
  label: string;
};

export function simulateTraffic(route: RouteResult): TrafficSegment[] {
  const total = route.coordinates.length;
  if (total < 4) return [];

  const third = Math.floor(total / 3);
  const baseMinutes = route.durationSeconds / 60;

  // Deterministic seed so it doesn't flicker on re-render
  const seed = Math.floor(baseMinutes) % 3;
  const tiers: Array<"CLEAR" | "MODERATE" | "HEAVY"> = [
    "CLEAR",
    "MODERATE",
    "HEAVY",
  ];
  const pick = (i: number) => tiers[(seed + i) % 3];

  const makeSeg = (
    startIndex: number,
    endIndex: number,
    tier: "CLEAR" | "MODERATE" | "HEAVY"
  ): TrafficSegment => {
    const colorMap = {
      CLEAR: "#22c55e",
      MODERATE: "#f97316",
      HEAVY: "#ef4444",
    };
    const addMap = { CLEAR: 0, MODERATE: 6, HEAVY: 14 };
    const labelMap = { CLEAR: "Clear", MODERATE: "Moderate", HEAVY: "Heavy" };
    return {
      startIndex,
      endIndex,
      tier,
      color: colorMap[tier],
      addedMinutes: addMap[tier],
      label: labelMap[tier],
    };
  };

  return [
    makeSeg(0, third, pick(0)),
    makeSeg(third, third * 2, pick(1)),
    makeSeg(third * 2, total - 1, pick(2)),
  ];
}

// ------------------------------------------------------------
// ETA calculator — base duration + traffic penalties
// ------------------------------------------------------------
export function computeETA(
  route: RouteResult,
  trafficSegments: TrafficSegment[]
): { etaMinutes: number; etaTimestamp: Date; addedMinutes: number } {
  const baseMinutes = Math.round(route.durationSeconds / 60);
  const addedMinutes = trafficSegments.reduce(
    (s, seg) => s + seg.addedMinutes,
    0
  );
  const etaMinutes = baseMinutes + addedMinutes;
  const etaTimestamp = new Date(Date.now() + etaMinutes * 60 * 1000);
  return { etaMinutes, etaTimestamp, addedMinutes };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatInstruction(step: any): string {
  const type = step.maneuver?.type || "continue";
  const modifier = step.maneuver?.modifier || "";
  const road = step.name ? ` onto ${step.name}` : "";
  const dist = step.distance
    ? ` in ${(step.distance / 1000).toFixed(1)} km`
    : "";

  switch (type) {
    case "depart":
      return `Depart${road}`;
    case "arrive":
      return "Arrive at destination";
    case "turn":
      return `Turn ${modifier}${road}`;
    case "merge":
      return `Merge ${modifier}${road}`;
    case "fork":
      return `Keep ${modifier}${road}`;
    case "roundabout":
      return `Enter roundabout${road}`;
    case "exit roundabout":
      return `Exit roundabout${road}`;
    case "on ramp":
      return `Take ramp${road}`;
    case "off ramp":
      return `Take exit${road}`;
    case "new name":
      return `Continue${road}`;
    default:
      return `Continue${dist}${road}`;
  }
}