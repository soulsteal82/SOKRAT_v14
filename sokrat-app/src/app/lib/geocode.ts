// ============================================================
// Reverse geocoding via OpenStreetMap Nominatim (free, no API key)
//
// Nominatim usage policy:
//   - Max 1 request per second
//   - Send a descriptive User-Agent (browsers do this automatically)
//   - Cache results (we do this in-memory)
//
// If the request fails, we return null and the UI falls back
// to showing raw coordinates.
// ============================================================

const cache = new Map<string, string | null>();

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=json&zoom=16&addressdetails=1&lat=${lat}&lon=${lng}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cache.set(key, null);
      return null;
    }

    const data = await res.json();
    const addr = data.address || {};

    // Build a short readable label
    const parts = [
      addr.suburb || addr.neighbourhood || addr.village || addr.town,
      addr.city || addr.county,
      addr.state,
    ].filter(Boolean);

    const label = parts.length
      ? parts.join(", ")
      : data.display_name || null;

    cache.set(key, label);
    return label;
  } catch {
    cache.set(key, null);
    return null;
  }
}