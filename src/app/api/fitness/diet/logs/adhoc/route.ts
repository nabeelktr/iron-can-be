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

// POST /api/fitness/diet/logs/adhoc — log an ad-hoc food (not tied to a planned item).
// Accepts an external food_snapshot directly — works for foods from Open Food Facts,
// Nutritionix, USDA, or any off-plan consumption. Free tier.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const {
      date,
      meal_type,
      food_snapshot,
      quantity,
      serving_unit,
      notes,
      external_source,
      external_id,
      is_consumed,
    } = body as {
      date?: string;
      meal_type?: string;
      food_snapshot?: {
        name: string;
        calories: number;
        protein_g?: number;
        carbs_g?: number;
        fat_g?: number;
        fiber_g?: number;
        serving_size?: number;
        serving_unit?: string;
        brand?: string | null;
      };
      quantity?: number;
      serving_unit?: string;
      notes?: string;
      external_source?: "openfoodfacts" | "nutritionix" | "usda" | "manual";
      external_id?: string;
      is_consumed?: boolean;
    };

    if (!meal_type || !VALID_MEAL_TYPES.includes(meal_type)) {
      return NextResponse.json(
        { error: "Valid meal_type is required" },
        { status: 400 },
      );
    }
    if (!food_snapshot?.name || food_snapshot.calories == null) {
      return NextResponse.json(
        { error: "food_snapshot.name and food_snapshot.calories are required" },
        { status: 400 },
      );
    }

    // Defensive assignment lookup — proceed with null if RLS blocks or query fails
    let assignmentId: string | null = null;
    try {
      const { data: assignmentData } = await supabase
        .from("diet_plan_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      assignmentId = assignmentData?.id ?? null;
    } catch {
      // non-blocking
    }

    const snapshot = {
      name: food_snapshot.name,
      brand: food_snapshot.brand ?? null,
      calories: Number(food_snapshot.calories),
      protein_g: Number(food_snapshot.protein_g ?? 0),
      carbs_g: Number(food_snapshot.carbs_g ?? 0),
      fat_g: Number(food_snapshot.fat_g ?? 0),
      fiber_g: Number(food_snapshot.fiber_g ?? 0),
      serving_size: Number(food_snapshot.serving_size ?? 1),
      serving_unit: food_snapshot.serving_unit ?? "serving",
      external_source: external_source ?? null,
      external_id: external_id ?? null,
    };

    const { data: log, error } = await supabase
      .from("diet_logs")
      .insert({
        user_id: user.id,
        assignment_id: assignmentId,
        date: date || new Date().toISOString().split("T")[0],
        meal_type,
        food_id: null,
        food_snapshot: snapshot,
        quantity: Number(quantity ?? 1),
        serving_unit: serving_unit ?? snapshot.serving_unit,
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
