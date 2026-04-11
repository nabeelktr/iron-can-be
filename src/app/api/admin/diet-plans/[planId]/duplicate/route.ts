import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// POST /api/admin/diet-plans/[planId]/duplicate — clone a diet plan
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase, user } = auth;
    const { planId } = await params;

    const body = await request.json();
    const newName = body.name?.trim();
    if (!newName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Fetch the full plan
    const { data: original, error: fetchError } = await supabase
      .from("diet_plans")
      .select(
        `*, days:diet_plan_days(
          *,
          meals:diet_plan_meals(
            *,
            items:diet_plan_meal_items(*)
          )
        )`,
      )
      .eq("id", planId)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Create the new plan
    const { data: newPlan, error: planError } = await supabase
      .from("diet_plans")
      .insert({
        created_by: user.id,
        name: newName,
        description: original.description,
        target_calories: original.target_calories,
        target_protein: original.target_protein,
        target_carbs: original.target_carbs,
        target_fat: original.target_fat,
        num_days: original.num_days,
      })
      .select("id")
      .single();

    if (planError)
      return NextResponse.json({ error: planError.message }, { status: 500 });

    // Deep copy days, meals, and items
    for (const day of original.days ?? []) {
      const { data: newDay, error: dayError } = await supabase
        .from("diet_plan_days")
        .insert({
          plan_id: newPlan.id,
          day_number: day.day_number,
          name: day.name,
          display_order: day.display_order,
        })
        .select("id")
        .single();

      if (dayError) continue;

      for (const meal of day.meals ?? []) {
        const { data: newMeal, error: mealError } = await supabase
          .from("diet_plan_meals")
          .insert({
            day_id: newDay.id,
            meal_type: meal.meal_type,
            display_order: meal.display_order,
            notes: meal.notes,
          })
          .select("id")
          .single();

        if (mealError) continue;

        if (meal.items?.length) {
          const itemRows = meal.items.map(
            (item: { food_id: string; quantity: number; serving_unit: string | null; notes: string | null; display_order: number }) => ({
              meal_id: newMeal.id,
              food_id: item.food_id,
              quantity: item.quantity,
              serving_unit: item.serving_unit,
              notes: item.notes,
              display_order: item.display_order,
            }),
          );

          await supabase.from("diet_plan_meal_items").insert(itemRows);
        }
      }
    }

    return NextResponse.json({ id: newPlan.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
