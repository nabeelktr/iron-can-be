import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// POST /api/fitness/diet/manual — manually add a food entry (premium only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    // Check premium tier
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
    const { date, meal_type, food_name, calories, protein_g, carbs_g, fat_g, quantity, serving_unit, notes, is_consumed } = body;

    if (!meal_type || !food_name || calories == null) {
      return NextResponse.json(
        { error: "meal_type, food_name, and calories are required" },
        { status: 400 },
      );
    }

    const validMealTypes = [
      "early_morning", "breakfast", "mid_morning_snack",
      "lunch", "evening_snack", "dinner", "bedtime", "other",
    ];
    if (!validMealTypes.includes(meal_type)) {
      return NextResponse.json(
        { error: "Invalid meal_type" },
        { status: 400 },
      );
    }

    // Get active assignment if any
    const { data: assignment } = await supabase
      .from("diet_plan_assignments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    // Create diet log with food_id=NULL (manual entry)
    const foodSnapshot = {
      name: food_name,
      calories: Number(calories),
      protein_g: Number(protein_g || 0),
      carbs_g: Number(carbs_g || 0),
      fat_g: Number(fat_g || 0),
      fiber_g: 0,
      serving_size: Number(quantity || 1),
      serving_unit: serving_unit || "serving",
    };

    const { data: log, error } = await supabase
      .from("diet_logs")
      .insert({
        user_id: user.id,
        assignment_id: assignment?.id || null,
        date: date || new Date().toISOString().split("T")[0],
        meal_type,
        food_id: null,
        food_snapshot: foodSnapshot,
        quantity: Number(quantity || 1),
        serving_unit: serving_unit || "serving",
        is_planned: false,
        is_consumed: is_consumed ?? true,
        notes: notes || null,
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
