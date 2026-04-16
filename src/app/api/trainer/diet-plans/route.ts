import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/diet-plans — list trainer's own diet plans
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let query = supabase
      .from("diet_plans")
      .select("*, days:diet_plan_days(count)")
      .eq("created_by_trainer_id", profile.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data: plans, error } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(plans ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/trainer/diet-plans — create a diet plan
export async function POST(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, user, profile } = auth;

    const body = await request.json();
    const {
      name,
      description,
      target_calories,
      target_protein,
      target_carbs,
      target_fat,
      num_days,
      days,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Plan name is required" },
        { status: 400 },
      );
    }

    // Create the plan with trainer reference
    const { data: plan, error: planError } = await supabase
      .from("diet_plans")
      .insert({
        created_by: user.id,
        created_by_trainer_id: profile.id,
        name: name.trim(),
        description: description || null,
        target_calories: target_calories || null,
        target_protein: target_protein || null,
        target_carbs: target_carbs || null,
        target_fat: target_fat || null,
        num_days: num_days || 7,
        is_template: true,
        tier_required: "premium",
      })
      .select()
      .single();

    if (planError)
      return NextResponse.json(
        { error: planError.message },
        { status: 500 },
      );

    // Create nested days/meals/items if provided
    if (days && Array.isArray(days)) {
      for (const day of days) {
        const { data: dayRow, error: dayError } = await supabase
          .from("diet_plan_days")
          .insert({
            plan_id: plan.id,
            day_number: day.day_number,
            name: day.name || null,
            display_order: day.display_order ?? day.day_number - 1,
          })
          .select()
          .single();

        if (dayError) continue;

        if (day.meals && Array.isArray(day.meals)) {
          for (const meal of day.meals) {
            const { data: mealRow, error: mealError } = await supabase
              .from("diet_plan_meals")
              .insert({
                day_id: dayRow.id,
                meal_type: meal.meal_type,
                display_order: meal.display_order ?? 0,
                notes: meal.notes || null,
              })
              .select()
              .single();

            if (mealError) continue;

            if (meal.items && Array.isArray(meal.items)) {
              const itemRows = meal.items.map(
                (item: any, idx: number) => ({
                  meal_id: mealRow.id,
                  food_id: item.food_id,
                  quantity: item.quantity || 1,
                  serving_unit: item.serving_unit || null,
                  notes: item.notes || null,
                  display_order: item.display_order ?? idx,
                }),
              );

              await supabase.from("diet_plan_meal_items").insert(itemRows);
            }
          }
        }
      }
    }

    return NextResponse.json({ id: plan.id, plan }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
