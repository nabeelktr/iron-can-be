import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// Only status transitions users themselves are allowed to make.
// Trainers/admins can fully cancel/complete via their own routes.
const USER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  active: ["paused"],
  paused: ["active"],
};

// PATCH /api/fitness/diet/assignment — let a user pause or resume their own
// active diet plan assignment. This does NOT allow cancelling/completing a plan
// (that's a trainer-only action) — it's purely for temporarily stepping out
// of a plan (e.g. holiday week) without losing history.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = (await request.json()) as { status?: string };
    const nextStatus = body.status;

    if (nextStatus !== "active" && nextStatus !== "paused") {
      return NextResponse.json(
        { error: "status must be 'active' or 'paused'" },
        { status: 400 },
      );
    }

    // Grab the user's current non-terminal assignment (active OR paused).
    const { data: assignment, error: fetchErr } = await supabase
      .from("diet_plan_assignments")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!assignment) {
      return NextResponse.json(
        { error: "No diet plan assignment to update" },
        { status: 404 },
      );
    }

    const allowed = USER_ALLOWED_TRANSITIONS[assignment.status] ?? [];
    if (!allowed.includes(nextStatus) && assignment.status !== nextStatus) {
      return NextResponse.json(
        {
          error: `Can't transition from ${assignment.status} to ${nextStatus}`,
        },
        { status: 400 },
      );
    }

    if (assignment.status === nextStatus) {
      return NextResponse.json({ assignment });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("diet_plan_assignments")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.id)
      .select()
      .single();

    if (updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ assignment: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
