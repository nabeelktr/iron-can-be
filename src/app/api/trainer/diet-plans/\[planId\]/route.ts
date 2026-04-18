import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// PUT /api/trainer/diet-plans/[planId] — update a diet plan
export async function PUT(
  request: NextRequest,
  { params }: { params: { planId: string } },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const planId = params.planId;
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

    // Verify trainer owns this plan
    const { data: plan, error: planCheckError } = await supabase
      .from("diet_plans")
      .select("id, created_by_trainer_id")
      .eq("id", planId)
      .single();

    if (planCheckError || !plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 },
      );
    }

    if (plan.created_by_trainer_id !== profile.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    // Update plan metadata
    const { data: updatedPlan, error: updateError } = await supabase
      .from("diet_plans")
      .update({
        name: name.trim(),
        description: description || null,
        target_calories: target_calories || null,
        target_protein: target_protein || null,
        target_carbs: target_carbs || null,
        target_fat: target_fat || null,
        num_days: num_days || 7,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    // Delete all existing days/meals/items for this plan
    if (days && Array.isArray(days)) {
      // Delete existing structure
      await supabase.from("diet_plan_days").delete().eq("plan_id", planId);

      // Create new nested days/meals/items
      for (const day of days) {
        const { data: dayRow, error: dayError } = await supabase
          .from("diet_plan_days")
          .insert({
            plan_id: planId,
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

    return NextResponse.json({ plan: updatedPlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
