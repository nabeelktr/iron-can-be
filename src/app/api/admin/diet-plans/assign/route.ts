import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// POST /api/admin/diet-plans/assign — assign a plan to a user
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { userId, planId, notes, start_date, end_date } = body;

    if (!userId || !planId) {
      return NextResponse.json(
        { error: "userId and planId are required" },
        { status: 400 },
      );
    }

    // Deactivate any existing active assignment for this user
    await supabase
      .from("diet_plan_assignments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active");

    // Create the new assignment
    const { data, error } = await supabase
      .from("diet_plan_assignments")
      .insert({
        user_id: userId,
        plan_id: planId,
        assigned_by: user.id,
        start_date: start_date || new Date().toISOString().split("T")[0],
        end_date: end_date || null,
        notes: notes || null,
      })
      .select("id")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data?.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
