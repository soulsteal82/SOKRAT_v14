// ============================================================
// POST /api/admin/invite
//
// Server-side endpoint that invites a user via Supabase Admin API.
// The service_role key is held only on the server (never in browser).
//
// Authentication: we check that the requesting user is a PLANNER.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ------------------------------------------------------------
// Server-side Supabase admin client
// ------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // -------- 1. Verify the request comes from a logged-in PLANNER --------
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.replace("Bearer ", "").trim();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing auth token" },
        { status: 401 }
      );
    }

    // Client using the requesting user's token, to verify identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    // Look up the requesting user's role
    const { data: requesterProfile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !requesterProfile) {
      return NextResponse.json(
        { error: "Could not load your profile" },
        { status: 500 }
      );
    }

    if (requesterProfile.role !== "PLANNER") {
      return NextResponse.json(
        { error: "Only PLANNER users can invite others" },
        { status: 403 }
      );
    }

    // -------- 2. Validate the request body --------
    const body = await req.json();
    const { email, name, phone, role } = body as {
      email: string;
      name: string;
      phone?: string;
      role: string;
    };

    if (!email || !name || !role) {
      return NextResponse.json(
        { error: "Missing required fields: email, name, role" },
        { status: 400 }
      );
    }

    const allowedRoles = ["DISPATCHER", "DRIVER", "INSPECTOR", "PLANNER"];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${allowedRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // -------- 3. Invite the user (service role) --------
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          name,
          phone: phone || null,
          role,
        },
      redirectTo: `${req.headers.get("origin") || new URL(req.url).origin}/login`,      });

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message },
        { status: 500 }
      );
    }

    // -------- 4. Ensure the profile has role + name set --------
    // The trigger creates the profile row, but it reads role from metadata.
    // As a fallback, update the profile explicitly.
    if (inviteData.user) {
      await adminClient
        .from("profiles")
        .update({
          name,
          phone: phone || null,
          role,
          active: true,
        })
        .eq("id", inviteData.user.id);
    }

    return NextResponse.json({
      success: true,
      user_id: inviteData.user?.id,
      email,
      role,
    });
  } catch (err: any) {
    console.error("[/api/admin/invite] error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}