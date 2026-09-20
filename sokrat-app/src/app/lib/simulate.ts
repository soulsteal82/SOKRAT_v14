// ============================================================
// SOKRAT Driver GPS Simulator (DEMO ONLY)
//
// Moves a marker along a provided route over a fixed duration,
// calling `onTick` at regular intervals.
//
// Used only in ?demo=1 mode for the meeting.
// ============================================================

export type SimOptions = {
  route: [number, number][];
  durationMs: number;
  onTick: (lat: number, lng: number) => void;
  onDone?: () => void;
  intervalMs?: number;
};

export function simulateDriverAlongRoute(opts: SimOptions): () => void {
  const { route, durationMs, onTick, onDone, intervalMs = 500 } = opts;

  if (route.length < 2) {
    onDone?.();
    return () => {};
  }

  const totalSteps = Math.max(1, Math.floor(durationMs / intervalMs));
  let step = 0;

  const timer = setInterval(() => {
    const t = step / totalSteps; // 0 → 1

    const segIdx = Math.min(
      route.length - 2,
      Math.floor(t * (route.length - 1))
    );
    const segT = t * (route.length - 1) - segIdx;

    const [aLat, aLng] = route[segIdx];
    const [bLat, bLng] = route[segIdx + 1];

    const lat = aLat + (bLat - aLat) * segT;
    const lng = aLng + (bLng - aLng) * segT;

    onTick(lat, lng);
    step++;

    if (step > totalSteps) {
      clearInterval(timer);
      onDone?.();
    }
  }, intervalMs);

  return () => clearInterval(timer);
}