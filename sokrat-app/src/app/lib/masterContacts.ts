// ============================================================
// Master Contacts & Vehicles helper
//
// Reads from the master_contacts and master_vehicles tables
// (created via T4.59). Used to fill gaps where RAMCO does not
// provide data — inspector phone, vehicle ownership, etc.
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

/**
 * Look up an inspector by name.
 * Returns null if not found.
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
  // If all fields are already populated, skip the lookup.
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