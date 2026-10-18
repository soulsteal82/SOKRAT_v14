"use client";

import React, { useEffect, useState, useRef } from "react";
import { supabaseBrowser as supabase } from "@/app/lib/supabase-browser";
import { useAuth } from "@/app/lib/auth-context";
import { classifyDelay } from "@/app/lib/delay";
import type { RealtimeChannel } from "@supabase/supabase-js";
import FleetRadar from "./FleetRadar";
import {
  MasterContact,
  MasterVehicle,
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from "@/app/lib/masterContacts";

// ============================================================
// Planner God-View — tabs for Trips / Contacts / Vehicles
// plus Fleet Radar. Existing trips table preserved.
// ============================================================

type PlannerRow = {
  manifest_group_id: string;
  priority: string;
  status_label: string;
  status_color: string;
  delay_label: string;
  delay_color: string;
  total_delay_minutes: number;
};

type ActiveTab = "trips" | "contacts" | "vehicles" | "billing";

function getStatusMeta(state: string | undefined) {
  const s = state || "";
  if (s.includes("REJECTED"))
    return { label: "⛔ REJECTED", color: "bg-red-950/60 text-red-400 border-red-900" };
  if (s === "INITIALIZED")
    return { label: "🏭 AT FACTORY", color: "bg-orange-950/60 text-orange-400 border-orange-900" };
  if (s === "LOADING_INITIATED")
    return { label: "📦 LOADING", color: "bg-orange-950/60 text-orange-400 border-orange-900" };
  if (s === "LOADING_COMPLETED")
    return { label: "✅ LOADED", color: "bg-amber-950/60 text-amber-400 border-amber-900" };
  if (s.startsWith("DISPATCHED"))
    return { label: "🚚 IN TRANSIT", color: "bg-blue-950/60 text-blue-300 border-blue-900" };
  if (s === "ARRIVED_AT_GATE")
    return { label: "📍 AT GATE", color: "bg-cyan-950/60 text-cyan-300 border-cyan-900" };
  if (s.startsWith("RECEIVED_ON_SITE"))
    return { label: "🏗️ ON SITE", color: "bg-cyan-950/60 text-cyan-300 border-cyan-900" };
  if (s === "GATE_IN_OFFLOADING")
    return { label: "🔄 OFFLOADING", color: "bg-cyan-950/60 text-cyan-300 border-cyan-900" };
  if (s === "OFFLOADING_COMPLETED")
    return { label: "📥 OFFLOADED", color: "bg-teal-950/60 text-teal-300 border-teal-900" };
  if (s === "INSTALLATION_INITIATED")
    return { label: "🔧 INSTALLING", color: "bg-purple-950/60 text-purple-300 border-purple-900" };
  if (s === "INSTALLATION_COMPLETED")
    return { label: "✅ COMPLETED", color: "bg-green-950/60 text-green-400 border-green-900" };
  return { label: s || "—", color: "bg-slate-800 text-slate-400 border-slate-700" };
}

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
// ============================================================
// BILLING TAB — vendor-only monthly trip counter + CSV export
// Gate: only rendered when the logged-in user's email matches
// VENDOR_EMAIL (see PlannerDashboard below).
// TODO(T4.35): replace email gate with role === "VENDOR_ADMIN"
// ============================================================

type BillingRow = {
  month: string;          // "2026-10"
  trip_count: number;
  panel_count: number;
};

function BillingTab() {
  const [rows, setRows] = React.useState<BillingRow[]>([]);
  const panelCountByManifestRef = React.useRef<Record<string, number>>({});
    const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = React.useState<string | null>(null);
  const [tripsByMonth, setTripsByMonth] = React.useState<
    Record<string, { ref: string; dispatched_at: string; site_name: string | null }[]>
  >({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: manifests, error: mErr } = await supabase
        .from("manifests")
        .select("manifest_group_id, dispatched_at, site_name")
        .not("dispatched_at", "is", null);

      if (mErr) throw mErr;

      const dispatched = (manifests || []) as {
        manifest_group_id: string;
        dispatched_at: string;
        site_name: string | null;
      }[];

      if (dispatched.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const ids = dispatched.map((m) => m.manifest_group_id);

      const { data: assets, error: aErr } = await supabase
        .from("assets")
        .select("manifest_group_id")
        .in("manifest_group_id", ids);

      if (aErr) throw aErr;

      const panelCountByManifest: Record<string, number> = {};
      (assets || []).forEach((a: any) => {
        panelCountByManifest[a.manifest_group_id] =
          (panelCountByManifest[a.manifest_group_id] || 0) + 1;
      });
      panelCountByManifestRef.current = panelCountByManifest;

      const byMonth: Record<string, BillingRow> = {};
      const tripLists: Record<
        string,
        { ref: string; dispatched_at: string; site_name: string | null }[]
      > = {};

      dispatched.forEach((m) => {
        const month = String(m.dispatched_at).slice(0, 7);
        if (!byMonth[month]) {
          byMonth[month] = { month, trip_count: 0, panel_count: 0 };
          tripLists[month] = [];
        }
        byMonth[month].trip_count += 1;
        byMonth[month].panel_count += panelCountByManifest[m.manifest_group_id] || 0;
        tripLists[month].push({
          ref: m.manifest_group_id,
          dispatched_at: m.dispatched_at,
          site_name: m.site_name,
        });
      });

      Object.values(tripLists).forEach((list) =>
        list.sort((a, b) => a.dispatched_at.localeCompare(b.dispatched_at))
      );

      const sorted = Object.values(byMonth).sort((a, b) =>
        b.month.localeCompare(a.month)
      );
      setRows(sorted);
      setTripsByMonth(tripLists);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const downloadCsv = () => {
    const csvEscape = (v: string) => {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = "month,trip_ref,dispatched_at,panel_count,site_name\n";

    const lines: string[] = [];
    rows.forEach((r) => {
      const trips = tripsByMonth[r.month] || [];
      trips.forEach((t) => {
        const panelCount = panelCountByManifestRef.current[t.ref] || 0;
        lines.push(
          [
            csvEscape(r.month),
            csvEscape(t.ref),
            csvEscape(t.dispatched_at),
            String(panelCount),
            csvEscape(t.site_name ?? ""),
          ].join(",")
        );
      });
    });

    const body = lines.join("\n");
    const blob = new Blob([header + body], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sokrat-billing-detail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatMonth = (iso: string) => {
    const [y, m] = iso.split("-");
    const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${names[parseInt(m, 10) - 1]}-${y}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const totalTrips = rows.reduce((s, r) => s + r.trip_count, 0);
  const totalPanels = rows.reduce((s, r) => s + r.panel_count, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Billing — Monthly Billable Trips
          </div>
          <div className="text-[9px] text-slate-500 italic mt-0.5">
            A billable trip = a manifest with a recorded dispatch timestamp.
          </div>
        </div>
        <button
          onClick={downloadCsv}
          disabled={rows.length === 0}
          className="text-[10px] bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 px-3 py-1.5 rounded font-black uppercase tracking-wider transition"
        >
          ⬇ Export CSV
        </button>
      </div>

      {loading && (
        <div className="text-[10px] text-slate-500 italic">Loading…</div>
      )}

      {error && (
        <div className="bg-red-950/30 border border-red-800 text-red-400 p-2 rounded text-[10px] font-mono">
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-[10px] text-slate-500 italic">
          No dispatched trips yet. Once trips are dispatched, they will
          appear here automatically.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-2 py-1.5">Month</th>
                  <th className="text-right px-2 py-1.5">Trips</th>
                  <th className="text-right px-2 py-1.5">Panels</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isExpanded = expandedMonth === r.month;
                  const trips = tripsByMonth[r.month] || [];
                  return (
                    <React.Fragment key={r.month}>
                      <tr
                        onClick={() =>
                          setExpandedMonth(isExpanded ? null : r.month)
                        }
                        className="border-b border-slate-900 hover:bg-slate-900/40 cursor-pointer"
                      >
                        <td className="px-2 py-1.5 text-slate-200 font-bold">
                          <span className="inline-flex items-center gap-2">
                            <span className="text-cyan-500 text-[10px]">
                              {isExpanded ? "▼" : "▶"}
                            </span>
                            {formatMonth(r.month)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-cyan-400">
                          {r.trip_count}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-400">
                          {r.panel_count}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-slate-900 bg-slate-950/60">
                          <td colSpan={3} className="px-4 py-2">
                            <div className="space-y-1 font-mono text-[10px]">
                              {trips.length === 0 ? (
                                <div className="text-slate-500 italic">
                                  No trips in this month.
                                </div>
                              ) : (
                                trips.map((t) => (
                                  <div
                                    key={t.ref}
                                    className="flex justify-between gap-3 border-b border-slate-900/60 pb-1 last:border-b-0"
                                  >
                                    <span className="text-slate-300">
                                      {t.ref}
                                    </span>
                                    <span className="text-slate-500">
                                      {formatDate(t.dispatched_at)}
                                    </span>
                                    <span className="text-cyan-500 text-right max-w-[40%] truncate">
                                      {t.site_name || "—"}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700">
                  <td className="px-2 py-1.5 text-[9px] uppercase font-bold text-slate-500">
                    Total
                  </td>
                  <td className="px-2 py-1.5 text-right font-black text-cyan-300">
                    {totalTrips}
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-slate-300">
                    {totalPanels}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="text-[8px] text-slate-600 italic text-center pt-1">
            Click a month to see the trip list. CSV export includes month, trip_count, panel_count per row.
          </div>
        </>
      )}
    </div>
  );
}
// ============================================================
// CONTACTS TAB
// ============================================================

function ContactsTab() {
  const [contacts, setContacts] = useState<MasterContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MasterContact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    role: "INSPECTOR" as "INSPECTOR" | "DISPATCHER" | "DRIVER",
    name: "",
    phone: "",
    email: "",
    employer: "",
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await listContacts();
    setContacts(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ role: "INSPECTOR", name: "", phone: "", email: "", employer: "" });
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (c: MasterContact) => {
    setForm({
      role: c.role,
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      employer: c.employer ?? "",
    });
    setEditing(c);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      alert("Name is required");
      return;
    }
    setBusy(true);
    let res;
    if (editing) {
      res = await updateContact(editing.id, {
        role: form.role,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        employer: form.employer.trim() || null,
      });
    } else {
      res = await createContact({
        role: form.role,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        employer: form.employer.trim() || null,
      });
    }
    setBusy(false);
    if (!res.success) {
      alert("Error: " + (res.error || "Unknown"));
      return;
    }
    resetForm();
    await load();
  };

  const handleDelete = async (c: MasterContact) => {
    if (!confirm(`Delete contact "${c.name}"?`)) return;
    setBusy(true);
    const res = await deleteContact(c.id);
    setBusy(false);
    if (!res.success) {
      alert("Error: " + (res.error || "Unknown"));
      return;
    }
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
          Contacts ({contacts.length})
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[10px] bg-cyan-600 hover:bg-cyan-500 text-slate-950 px-3 py-1 rounded font-black uppercase tracking-wider"
          >
            + Add Contact
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-cyan-800/60 rounded-lg p-3 space-y-2">
          <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
            {editing ? "Edit Contact" : "New Contact"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Role
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="INSPECTOR">Inspector</option>
                <option value="DISPATCHER">Dispatcher</option>
                <option value="DRIVER">Driver</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+971 50 xxx xxxx"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Employer
              </label>
              <input
                type="text"
                value={form.employer}
                onChange={(e) => setForm({ ...form, employer: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={busy}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold py-2 rounded text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {busy ? "Saving…" : editing ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              disabled={busy}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded text-xs uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-[10px] text-slate-500 italic">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="text-[10px] text-slate-500 italic">
          No contacts yet. Tap "+ Add Contact" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-2 py-1.5">Role</th>
                <th className="text-left px-2 py-1.5">Name</th>
                <th className="text-left px-2 py-1.5">Phone</th>
                <th className="text-left px-2 py-1.5">Employer</th>
                <th className="text-right px-2 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                  <td className="px-2 py-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                      {c.role}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-200">{c.name}</td>
                  <td className="px-2 py-1.5 text-slate-400 font-mono text-[10px]">
                    {c.phone || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-slate-400 text-[10px]">
                    {c.employer || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => handleEdit(c)}
                      disabled={busy}
                      className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold mr-3 disabled:opacity-30"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={busy}
                      className="text-[9px] text-red-400 hover:text-red-300 font-bold disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// VEHICLES TAB
// ============================================================

function VehiclesTab() {
  const [vehicles, setVehicles] = useState<MasterVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MasterVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    plate_number: "",
    trailer_type: "FLATBED",
    ownership: "OWNED" as "OWNED" | "RENTED",
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await listVehicles();
    setVehicles(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ plate_number: "", trailer_type: "FLATBED", ownership: "OWNED" });
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (v: MasterVehicle) => {
    setForm({
      plate_number: v.plate_number,
      trailer_type: v.trailer_type ?? "FLATBED",
      ownership: (v.ownership as "OWNED" | "RENTED") ?? "OWNED",
    });
    setEditing(v);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.plate_number.trim()) {
      alert("Plate number is required");
      return;
    }
    setBusy(true);
    let res;
    if (editing) {
      res = await updateVehicle(editing.id, {
        plate_number: form.plate_number.trim(),
        trailer_type: form.trailer_type || null,
        ownership: form.ownership,
      });
    } else {
      res = await createVehicle({
        plate_number: form.plate_number.trim(),
        trailer_type: form.trailer_type || null,
        ownership: form.ownership,
      });
    }
    setBusy(false);
    if (!res.success) {
      alert("Error: " + (res.error || "Unknown"));
      return;
    }
    resetForm();
    await load();
  };

  const handleDelete = async (v: MasterVehicle) => {
    if (!confirm(`Delete vehicle "${v.plate_number}"?`)) return;
    setBusy(true);
    const res = await deleteVehicle(v.id);
    setBusy(false);
    if (!res.success) {
      alert("Error: " + (res.error || "Unknown"));
      return;
    }
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
          Vehicles ({vehicles.length})
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[10px] bg-cyan-600 hover:bg-cyan-500 text-slate-950 px-3 py-1 rounded font-black uppercase tracking-wider"
          >
            + Add Vehicle
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-cyan-800/60 rounded-lg p-3 space-y-2">
          <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
            {editing ? "Edit Vehicle" : "New Vehicle"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Plate Number *
              </label>
              <input
                type="text"
                value={form.plate_number}
                onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
                placeholder="A-00001"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Trailer Type
              </label>
              <select
                value={form.trailer_type}
                onChange={(e) => setForm({ ...form, trailer_type: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="FLATBED">FLATBED</option>
                <option value="LOWBOY">LOWBOY</option>
                <option value="STEP_DECK">STEP_DECK</option>
                <option value="REMOVABLE_GOOSENECK">REMOVABLE_GOOSENECK</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] text-slate-500 uppercase font-bold mb-1">
                Ownership
              </label>
              <select
                value={form.ownership}
                onChange={(e) =>
                  setForm({ ...form, ownership: e.target.value as "OWNED" | "RENTED" })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="OWNED">OWNED</option>
                <option value="RENTED">RENTED</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={busy}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold py-2 rounded text-xs uppercase tracking-wider disabled:opacity-50"
            >
              {busy ? "Saving…" : editing ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              disabled={busy}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded text-xs uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-[10px] text-slate-500 italic">Loading…</div>
      ) : vehicles.length === 0 ? (
        <div className="text-[10px] text-slate-500 italic">
          No vehicles yet. Tap "+ Add Vehicle" to create one.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[9px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-2 py-1.5">Plate</th>
                <th className="text-left px-2 py-1.5">Trailer</th>
                <th className="text-left px-2 py-1.5">Ownership</th>
                <th className="text-right px-2 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                  <td className="px-2 py-1.5 font-mono text-slate-200">
                    {v.plate_number}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300 text-[10px]">
                    {v.trailer_type || "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        v.ownership === "OWNED"
                          ? "bg-green-950/60 text-green-400"
                          : "bg-amber-950/60 text-amber-400"
                      }`}
                    >
                      {v.ownership || "—"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => handleEdit(v)}
                      disabled={busy}
                      className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold mr-3 disabled:opacity-30"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(v)}
                      disabled={busy}
                      className="text-[9px] text-red-400 hover:text-red-300 font-bold disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN PLANNER DASHBOARD
// ============================================================

export default function PlannerDashboard() {
  // T4.31 — vendor-only Billing tab gate
  // TODO(T4.35): replace with role === "VENDOR_ADMIN"
  const { profile: userProfile } = useAuth();
  const isDemoMode =
    typeof window !== "undefined" &&
    window.location.search.includes("demo=1");
  const isVendor =
    userProfile?.email === "planner@sokrat.systems" && isDemoMode;  
  const [rows, setRows] = useState<PlannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [radarOpen, setRadarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("trips");

  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [custodyByTrip, setCustodyByTrip] = useState<
    Record<string, { asset_serial: string; state: string; custody_history: any[] }[]>
  >({});
  const [custodyLoading, setCustodyLoading] = useState<string | null>(null);

  const loadCustodyForTrip = async (manifestGroupId: string) => {
    setCustodyLoading(manifestGroupId);
    const { data } = await supabase
      .from("assets")
      .select("asset_serial, state, custody_history")
      .eq("manifest_group_id", manifestGroupId)
      .order("asset_serial", { ascending: true });

    if (data) {
      setCustodyByTrip((prev) => {
        if (JSON.stringify(prev[manifestGroupId]) === JSON.stringify(data)) {
          return prev; // No changes, skip re-render
        }
        return { ...prev, [manifestGroupId]: data };
      });
    }
    setCustodyLoading(null);
  };

  const handleToggleTrip = async (manifestGroupId: string) => {
    if (expandedTripId === manifestGroupId) {
      setExpandedTripId(null);
      return;
    }
    setExpandedTripId(manifestGroupId);
    await loadCustodyForTrip(manifestGroupId);
  };

  useEffect(() => {
    if (!expandedTripId) return;
    const id = setInterval(() => {
      loadCustodyForTrip(expandedTripId);
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTripId]);

  const loadRows = async () => {
    const { data: manifests, error } = await supabase
      .from("manifests")
      .select("manifest_group_id, driver_name, inspector_name, priority")
      .order("manifest_group_id", { ascending: true });

    if (error || !manifests) {
      setLoading(false);
      return;
    }

    const manifestIds = manifests.map((m) => m.manifest_group_id);

    const { data: assets } = await supabase
      .from("assets")
      .select(
        "manifest_group_id, state, factory_delay_minutes, transit_delay_minutes, site_delay_minutes"
      )
      .in("manifest_group_id", manifestIds);

    const stateByManifest: Record<string, string> = {};
    const delayByManifest: Record<string, { f: number; t: number; s: number }> = {};

    (assets || []).forEach((a: any) => {
      const id = a.manifest_group_id;
      const prev = stateByManifest[id];
      if (prev === undefined || stateRank(a.state) < stateRank(prev)) {
        stateByManifest[id] = a.state;
      }
      if (!delayByManifest[id]) delayByManifest[id] = { f: 0, t: 0, s: 0 };
      delayByManifest[id].f = Math.max(delayByManifest[id].f, a.factory_delay_minutes || 0);
      delayByManifest[id].t = Math.max(delayByManifest[id].t, a.transit_delay_minutes || 0);
      delayByManifest[id].s = Math.max(delayByManifest[id].s, a.site_delay_minutes || 0);
    });

    const built: PlannerRow[] = manifests.map((m: any) => {
      const state = stateByManifest[m.manifest_group_id] || "INITIALIZED";
      const d = delayByManifest[m.manifest_group_id] || { f: 0, t: 0, s: 0 };
      const total = d.f + d.t + d.s;
      const delayInfo = classifyDelay(d.f, d.t, d.s);
      const statusMeta = getStatusMeta(state);

      return {
        manifest_group_id: m.manifest_group_id,
        priority: m.priority || "LOW",
        status_label: statusMeta.label,
        status_color: statusMeta.color,
        delay_label: delayInfo.label,
        delay_color: `${delayInfo.bg} ${delayInfo.color}`,
        total_delay_minutes: total,
      };
    });

    const priorityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    built.sort((a, b) => {
      const ra = priorityRank[a.priority] ?? 99;
      const rb = priorityRank[b.priority] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.manifest_group_id.localeCompare(b.manifest_group_id);
    });

    setRows((prev) => {
      // Prevent re-rendering if the data hasn't actually changed
      if (JSON.stringify(prev) === JSON.stringify(built)) {
        return prev;
      }
      return built;
    });
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadRows();
  }, []);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadRows();
      }, 400);
    };

    const channel = supabase
      .channel("planner-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manifests" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assets" },
        scheduleRefresh
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-950 border border-purple-900/40 rounded-xl p-6 text-center">
        <div className="text-2xl animate-pulse mb-2">📊</div>
        <div className="text-xs text-purple-300 font-bold uppercase tracking-widest">
          Loading God-View…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-purple-900/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-900/40 bg-purple-950/30">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <span className="text-xs font-black tracking-widest text-purple-300 uppercase">
            Planner Dashboard
          </span>
          <span className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-green-950/40 border border-green-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[8px] text-green-300 font-bold uppercase tracking-wider">
              Live
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "trips" && lastRefresh && (
            <button
              onClick={loadRows}
              title="Force sync"
              className="text-[9px] text-slate-500 hover:text-cyan-400 font-mono transition"
            >
              Updated{" "}
              {(() => {
                const secs = Math.max(
                  0,
                  Math.round((Date.now() - lastRefresh.getTime()) / 1000)
                );
                if (secs < 60) return `${secs}s ago`;
                const mins = Math.round(secs / 60);
                if (mins < 60) return `${mins}m ago`;
                return `${Math.round(mins / 60)}h ago`;
              })()}{" "}
              ⟳
            </button>
          )}
          <button
            onClick={() => setRadarOpen(true)}
            className="text-[9px] bg-cyan-600 hover:bg-cyan-500 border border-cyan-500 text-slate-950 px-3 py-1 rounded font-black uppercase tracking-wider transition"
          >
            🛰️ Fleet Radar
          </button>
        </div>
      </div>

       {/* Tab bar */}
      <div className="flex border-b border-slate-800 bg-slate-950">
        <button
          onClick={() => setActiveTab("trips")}
          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
            activeTab === "trips"
              ? "text-cyan-400 border-b-2 border-cyan-500 bg-slate-900/60"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          📊 Trips ({rows.length})
        </button>
        {isDemoMode && (
          <button
            onClick={() => setActiveTab("contacts")}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === "contacts"
                ? "text-cyan-400 border-b-2 border-cyan-500 bg-slate-900/60"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            👥 Contacts
          </button>
        )}
        {isDemoMode && (
          <button
            onClick={() => setActiveTab("vehicles")}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === "vehicles"
                ? "text-cyan-400 border-b-2 border-cyan-500 bg-slate-900/60"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            🚛 Vehicles
          </button>
        )}
        {isVendor && (
          <button
            onClick={() => setActiveTab("billing")}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === "billing"
                ? "text-cyan-400 border-b-2 border-cyan-500 bg-slate-900/60"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            💰 Billing
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === "trips" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/60 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="text-left px-4 py-2">Trip Ref</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Delay Class</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isExpanded = expandedTripId === r.manifest_group_id;
                  const custody = custodyByTrip[r.manifest_group_id] || [];
                  const isLoading = custodyLoading === r.manifest_group_id;

                  return (
                    <React.Fragment key={r.manifest_group_id}>
                      <tr
                        onClick={() => handleToggleTrip(r.manifest_group_id)}
                        className="border-b border-slate-900 hover:bg-slate-900/60 transition cursor-pointer"
                      >
                        <td className="px-4 py-2.5 font-mono text-slate-200 text-[10px]">
                          <span className="inline-flex items-center gap-2">
                            <span className="text-cyan-500 text-[10px]">
                              {isExpanded ? "▼" : "▶"}
                            </span>
                            {r.manifest_group_id}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block text-[9px] px-2 py-1 rounded font-bold border ${r.status_color}`}
                          >
                            {r.status_label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block text-[9px] px-2 py-1 rounded font-bold border border-slate-800 ${r.delay_color}`}
                          >
                            {r.delay_label}
                          </span>
                          {r.total_delay_minutes > 0 && (
                            <span className="text-[8px] text-slate-500 font-mono ml-2">
                              ({r.total_delay_minutes}m)
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-slate-900 bg-slate-950/60">
                          <td colSpan={3} className="px-4 py-3">
                            <div className="space-y-2">
                              <div className="text-[9px] uppercase font-bold text-purple-300 tracking-widest">
                                Custody Log
                              </div>

                              {isLoading && (
                                <div className="text-[10px] text-slate-500 italic">
                                  Loading custody history…
                                </div>
                              )}

                              {!isLoading && custody.length === 0 && (
                                <div className="text-[10px] text-slate-500 italic">
                                  No panels yet.
                                </div>
                              )}

                              {!isLoading &&
                                custody.length > 0 &&
                                (() => {
                                  const focusPanel = [...custody].sort(
                                    (a, b) =>
                                      stateRank(a.state) - stateRank(b.state)
                                  )[0];

                                  return (
                                    <div className="bg-slate-900/60 border border-slate-800 rounded p-2">
                                      <div className="space-y-0.5 font-mono text-[9px] text-slate-400">
                                        {(focusPanel.custody_history || []).map(
                                          (log: any, i: number) => {
                                            const ts = log.timestamp;
                                            const displayTs =
                                              ts &&
                                              ts.trim() !== "" &&
                                              ts !== "[PENDING HARDWARE SCAN]"
                                                ? ts
                                                : "—";
                                            return (
                                              <div
                                                key={i}
                                                className="flex justify-between gap-3"
                                              >
                                                <span className="truncate">
                                                  [{displayTs}] {log.state}
                                                </span>
                                                <span className="text-cyan-500 shrink-0">
                                                  → {log.custody}
                                                </span>
                                              </div>
                                            );
                                          }
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {rows.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                No trips found in the database.
              </div>
            )}
          </div>
        )}

        {activeTab === "contacts" && isDemoMode && <ContactsTab />}
        {activeTab === "vehicles" && isDemoMode && <VehiclesTab />}
                {activeTab === "billing" && isVendor && <BillingTab />}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-purple-950/20 border-t border-purple-900/40 text-[9px] text-slate-500 text-center font-mono">
        Live updates via Supabase Realtime · Powered by SOKRAT
      </div>

      <FleetRadar isOpen={radarOpen} onClose={() => setRadarOpen(false)} />
    </div>
  );
}