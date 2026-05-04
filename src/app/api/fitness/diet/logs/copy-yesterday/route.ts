import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface DietLogRow {
  food_id: string | null;
  meal_type: string;
  food_snapshot: Record<string, unknown> | null;
  quantity: number | null;
  serving_unit: string | null;
  is_planned: boolean;
  is_consumed: boolean;
  notes: string | null;
}

// POST /api/fitness/diet/logs/copy-yesterday
// Copy every log from the previous day into the target date. Intended for
// users who eat repetitive meals — one tap and yesterday's whole log is re-
// created (minus the plan-tied ticks, which the plan will re-surface anyway
// and which we don't want to double-count toward adherence).
//
// Body: { date?: "YYYY-MM-DD" }  — target date, defaults to today.
// Only ad-hoc logs (is_planned=false) are copied, to avoid weird interactions
// with the plan's tick-based adherence system.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
    };
    const targetDate = body.date || new Date().toISOString().split("T")[0];
    const target = new Date(targetDate + "T00:00:00");
    const yesterday = new Date(target);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().split("T")[0];

    // Get the user's active assignment (for the assignment_id FK on new logs)
    const { data: assignment } = await supabase
      .from("diet_plan_assignments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    const { data: sourceLogs, error: fetchErr } = await supabase
      .from("diet_logs")
      .select(
        "food_id, meal_type, food_snapshot, quantity, serving_unit, is_planned, is_consumed, notes",
      )
      .eq("user_id", user.id)
      .eq("date", yesterdayIso)
      .eq("is_planned", false);

    if (fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const rows = (sourceLogs ?? []) as DietLogRow[];
    if (rows.length === 0) {
      return NextResponse.json({ copied: 0, message: "Nothing to copy" });
    }

    const inserts = rows.map((r) => ({
      user_id: user.id,
      assignment_id: assignment?.id ?? null,
      date: targetDate,
      meal_type: r.meal_type,
      food_id: r.food_id,
      food_snapshot: r.food_snapshot,
      quantity: r.quantity ?? 1,
      serving_unit: r.serving_unit,
      is_planned: false,
      is_consumed: r.is_consumed ?? false,
      notes: r.notes,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("diet_logs")
      .insert(inserts)
      .select("id");

    if (insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ copied: inserted?.length ?? 0 }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
