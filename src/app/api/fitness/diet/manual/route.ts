import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

const VALID_MEAL_TYPES = [
  "early_morning",
  "breakfast",
  "mid_morning_snack",
  "lunch",
  "evening_snack",
  "dinner",
  "bedtime",
  "other",
];

// POST /api/fitness/diet/manual — premium-only manual food entry.
//
// Snapshot rule (shared across diet_logs):
//   food_snapshot.{calories,protein_g,...} are macros for ONE serving_unit
//   (= serving_size grams of that unit). diet_logs.quantity is the multiplier.
//   Summary = snap × quantity. The client MUST send per-serving macros, not
//   pre-multiplied totals — pre-multiplying caused a quantity² double-count.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("subscription_tier")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.subscription_tier !== "premium") {
      return NextResponse.json(
        { error: "Premium subscription required for manual diet entries" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      date,
      meal_type,
      food_name,
      brand,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      quantity,
      serving_size,
      serving_unit,
      notes,
      is_consumed,
    } = body;

    if (!meal_type || !food_name || calories == null) {
      return NextResponse.json(
        { error: "meal_type, food_name, and calories are required" },
        { status: 400 },
      );
    }
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return NextResponse.json({ error: "Invalid meal_type" }, { status: 400 });
    }

    let assignmentId: string | null = null;
    try {
      const { data: assignment } = await supabase
        .from("diet_plan_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      assignmentId = assignment?.id ?? null;
    } catch {
      // non-blocking
    }

    const foodSnapshot = {
      name: String(food_name),
      brand: brand ?? null,
      calories: Number(calories),
      protein_g: Number(protein_g ?? 0),
      carbs_g: Number(carbs_g ?? 0),
      fat_g: Number(fat_g ?? 0),
      fiber_g: Number(fiber_g ?? 0),
      serving_size: Number(serving_size ?? 1),
      serving_unit: String(serving_unit ?? "serving"),
    };

    const { data: log, error } = await supabase
      .from("diet_logs")
      .insert({
        user_id: user.id,
        assignment_id: assignmentId,
        date: date || new Date().toISOString().split("T")[0],
        meal_type,
        food_id: null,
        food_snapshot: foodSnapshot,
        quantity: Number(quantity ?? 1),
        serving_unit: String(serving_unit ?? "serving"),
        is_planned: false,
        is_consumed: is_consumed ?? false,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: log.id, log }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
