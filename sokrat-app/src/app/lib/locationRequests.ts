// ============================================================
// Location Requests helper
//
// When a dispatcher or driver needs the inspector's site
// location and it hasn't been shared yet, they tap a button
// that inserts a row here. The inspector sees a banner and
// resolves it by sharing their location.
// ============================================================

import { supabaseBrowser as supabase } from "./supabase-browser";

export type LocationRequest = {
  id: string;
  manifest_group_id: string;
  requested_by_name: string | null;
  requested_by_role: string | null;
  requested_at: string;
  resolved: boolean;
  resolved_at: string | null;
};

/**
 * Create a new location request for a manifest.
 */
export async function createLocationRequest(params: {
  manifestGroupId: string;
  requestedByName: string;
  requestedByRole: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;

  const { error } = await supabase.from("location_requests").insert({
    manifest_group_id: params.manifestGroupId,
    requested_by: userId,
    requested_by_name: params.requestedByName,
    requested_by_role: params.requestedByRole,
  });

  if (error) {
    console.error("[locationRequests] insert failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Get the most recent unresolved request for a manifest, if any.
 */
export async function getPendingRequest(
  manifestGroupId: string
): Promise<LocationRequest | null> {
  const { data, error } = await supabase
    .from("location_requests")
    .select(
      "id, manifest_group_id, requested_by_name, requested_by_role, requested_at, resolved, resolved_at"
    )
    .eq("manifest_group_id", manifestGroupId)
    .eq("resolved", false)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[locationRequests] getPendingRequest failed:", error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Mark a request as resolved.
 */
export async function resolveLocationRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;

  const { error } = await supabase
    .from("location_requests")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", requestId);

  if (error) {
    console.error("[locationRequests] resolve failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Mark all pending requests for a manifest as resolved.
 * Called automatically when the site location is shared.
 */
export async function resolveAllForManifest(
  manifestGroupId: string
): Promise<void> {
  await supabase
    .from("location_requests")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq("manifest_group_id", manifestGroupId)
    .eq("resolved", false);
}