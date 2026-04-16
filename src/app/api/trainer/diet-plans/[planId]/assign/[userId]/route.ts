import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// POST /api/trainer/diet-plans/[planId]/assign/[userId] — assign a diet plan to a user
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ planId: string; userId: string }> },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, user, profile } = auth;
    const { planId, userId } = await params;

    const body = await request.json().catch(() => ({}));
    const { notes, start_date, end_date } = body;

    // Verify plan belongs to this trainer
    const { data: plan, error: planError } = await supabase
      .from("diet_plans")
      .select("id")
      .eq("id", planId)
      .eq("created_by_trainer_id", profile.id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Diet plan not found" },
        { status: 404 },
      );
    }

    // Verify user is in trainer's network
    const { data: relationship } = await supabase
      .from("trainer_users")
      .select("id")
      .eq("trainer_id", profile.id)
      .eq("user_id", userId)
      .eq("status", "joined")
      .single();

    if (!relationship) {
      return NextResponse.json(
        { error: "User not in your network" },
        { status: 403 },
      );
    }

    // Deactivate any existing active assignment for this user
    await supabase
      .from("diet_plan_assignments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");

    // Create new assignment
    const { data: assignment, error } = await supabase
      .from("diet_plan_assignments")
      .insert({
        user_id: userId,
        plan_id: planId,
        assigned_by: user.id,
        trainer_id: profile.id,
        start_date: start_date || new Date().toISOString().split("T")[0],
        end_date: end_date || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      { assignment_id: assignment.id, assignment },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
