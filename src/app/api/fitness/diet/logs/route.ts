import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// GET /api/fitness/diet/logs?date=YYYY-MM-DD — get diet logs for a date
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    const { data: logs, error } = await supabase
      .from("diet_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("created_at");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(logs ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/fitness/diet/logs — log a food item
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { food_id, meal_type, quantity, serving_unit, notes, is_planned, date } = body;

    if (!food_id || !meal_type) {
      return NextResponse.json(
        { error: "food_id and meal_type are required" },
        { status: 400 },
      );
    }

    // Fetch the food item to create a snapshot
    const { data: food, error: foodError } = await supabase
      .from("foods")
      .select("*")
      .eq("id", food_id)
      .single();

    if (foodError || !food) {
      return NextResponse.json({ error: "Food not found" }, { status: 404 });
    }

    // Get active assignment if any
    const { data: assignment } = await supabase
      .from("diet_plan_assignments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    const foodSnapshot = {
      name: food.name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
      serving_size: food.serving_size,
      serving_unit: food.serving_unit,
    };

    const { data, error } = await supabase
      .from("diet_logs")
      .insert({
        user_id: user.id,
        assignment_id: assignment?.id || null,
        date: date || new Date().toISOString().split("T")[0],
        meal_type,
        food_id,
        food_snapshot: foodSnapshot,
        quantity: quantity ?? 1,
        serving_unit: serving_unit || null,
        is_planned: is_planned ?? false,
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
