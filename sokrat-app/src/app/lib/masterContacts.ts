// ============================================================
// Master Contacts & Vehicles helper
//
// Reads from the master_contacts and master_vehicles tables
// (created via T4.59). Used to fill gaps where RAMCO does not
// provide data — inspector phone, vehicle ownership, etc.
//
// Also contains CRUD operations used by the planner UI (T4.59b).
// ============================================================

import { supabaseBrowser as supabase } from "./supabase-browser";

export type MasterContact = {
  id: string;
  role: "INSPECTOR" | "DISPATCHER" | "DRIVER";
  name: string;
  phone: string | null;
  email: string | null;
  employer: string | null;
};

export type MasterVehicle = {
  id: string;
  plate_number: string;
  trailer_type: string | null;
  ownership: "OWNED" | "RENTED" | null;
};

// ============================================================
// LOOKUP (read-only, used during manifest processing)
// ============================================================

/**
 * Look up an inspector by name.
 */
export async function lookupInspector(
  name: string | null | undefined
): Promise<MasterContact | null> {
  if (!name || name.trim() === "") return null;

  const { data, error } = await supabase
    .from("master_contacts")
    .select("id, role, name, phone, email, employer")
    .eq("role", "INSPECTOR")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    console.warn("[masterContacts] lookupInspector failed:", error.message);
    return null;
  }

  return data ?? null;
}

/**
 * Look up a vehicle by plate number.
 */
export async function lookupVehicle(
  plateNumber: string | null | undefined
): Promise<MasterVehicle | null> {
  if (!plateNumber || plateNumber.trim() === "") return null;

  const { data, error } = await supabase
    .from("master_vehicles")
    .select("id, plate_number, trailer_type, ownership")
    .eq("plate_number", plateNumber)
    .maybeSingle();

  if (error) {
    console.warn("[masterContacts] lookupVehicle failed:", error.message);
    return null;
  }

  return data ?? null;
}

/**
 * Enrich a manifest's inspector details using master_contacts.
 * If the manifest is missing inspector_phone or inspector_email,
 * this returns an object with those fields filled in.
 */
export async function enrichInspectorFields(manifest: {
  inspector_name: string | null;
  inspector_phone: string | null;
  inspector_email: string | null;
}): Promise<{
  inspector_name: string | null;
  inspector_phone: string | null;
  inspector_email: string | null;
  employer: string | null;
}> {
  if (
    manifest.inspector_name &&
    manifest.inspector_phone &&
    manifest.inspector_email
  ) {
    return { ...manifest, employer: null };
  }

  const contact = await lookupInspector(manifest.inspector_name);

  return {
    inspector_name: manifest.inspector_name,
    inspector_phone: manifest.inspector_phone ?? contact?.phone ?? null,
    inspector_email: manifest.inspector_email ?? contact?.email ?? null,
    employer: contact?.employer ?? null,
  };
}

/**
 * Enrich a manifest's vehicle details using master_vehicles.
 * If the manifest is missing vehicle_ownership or trailer type,
 * this returns an object with those fields filled in.
 */
export async function enrichVehicleFields(manifest: {
  vehicle_plate: string | null;
  vehicle_ownership: string | null;
  vehicle_trailer_type: string | null;
}): Promise<{
  vehicle_plate: string | null;
  vehicle_ownership: string | null;
  vehicle_trailer_type: string | null;
}> {
  if (manifest.vehicle_ownership && manifest.vehicle_trailer_type) {
    return { ...manifest };
  }

  const vehicle = await lookupVehicle(manifest.vehicle_plate);

  return {
    vehicle_plate: manifest.vehicle_plate,
    vehicle_ownership: manifest.vehicle_ownership ?? vehicle?.ownership ?? null,
    vehicle_trailer_type:
      manifest.vehicle_trailer_type ?? vehicle?.trailer_type ?? null,
  };
}

// ============================================================
// CRUD (used by the planner UI, T4.59b)
// ============================================================

/**
 * Fetch all contacts, optionally filtered by role.
 */
export async function listContacts(
  role?: "INSPECTOR" | "DISPATCHER" | "DRIVER"
): Promise<MasterContact[]> {
  let query = supabase
    .from("master_contacts")
    .select("id, role, name, phone, email, employer")
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("[masterContacts] listContacts failed:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Create a new contact.
 */
export async function createContact(params: {
  role: "INSPECTOR" | "DISPATCHER" | "DRIVER";
  name: string;
  phone: string | null;
  email: string | null;
  employer: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;

  const { error } = await supabase.from("master_contacts").insert({
    role: params.role,
    name: params.name,
    phone: params.phone,
    email: params.email,
    employer: params.employer,
    created_by: userId,
  });

  if (error) {
    console.error("[masterContacts] createContact failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Update an existing contact.
 */
export async function updateContact(
  id: string,
  updates: Partial<{
    role: "INSPECTOR" | "DISPATCHER" | "DRIVER";
    name: string;
    phone: string | null;
    email: string | null;
    employer: string | null;
  }>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("master_contacts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[masterContacts] updateContact failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Delete a contact.
 */
export async function deleteContact(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("master_contacts").delete().eq("id", id);

  if (error) {
    console.error("[masterContacts] deleteContact failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Fetch all vehicles.
 */
export async function listVehicles(): Promise<MasterVehicle[]> {
  const { data, error } = await supabase
    .from("master_vehicles")
    .select("id, plate_number, trailer_type, ownership")
    .order("plate_number", { ascending: true });

  if (error) {
    console.warn("[masterContacts] listVehicles failed:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Create a new vehicle.
 */
export async function createVehicle(params: {
  plate_number: string;
  trailer_type: string | null;
  ownership: "OWNED" | "RENTED" | null;
}): Promise<{ success: boolean; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id ?? null;

  const { error } = await supabase.from("master_vehicles").insert({
    plate_number: params.plate_number,
    trailer_type: params.trailer_type,
    ownership: params.ownership,
    created_by: userId,
  });

  if (error) {
    console.error("[masterContacts] createVehicle failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Update an existing vehicle.
 */
export async function updateVehicle(
  id: string,
  updates: Partial<{
    plate_number: string;
    trailer_type: string | null;
    ownership: "OWNED" | "RENTED" | null;
  }>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("master_vehicles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[masterContacts] updateVehicle failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Delete a vehicle.
 */
export async function deleteVehicle(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("master_vehicles").delete().eq("id", id);

  if (error) {
    console.error("[masterContacts] deleteVehicle failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}