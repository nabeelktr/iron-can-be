import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/diet-plans/[planId] — full plan detail with nested data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { planId } = await params;

    const { data: plan, error } = await supabase
      .from("diet_plans")
      .select(
        `*, days:diet_plan_days(
          *,
          meals:diet_plan_meals(
            *,
            items:diet_plan_meal_items(
              *,
              food:foods(*)
            )
          )
        )`,
      )
      .eq("id", planId)
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    if (!plan)
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // Sort nested data by display_order
    const sorted = {
      ...plan,
      days: (plan.days ?? [])
        .sort(
          (a: { display_order: number }, b: { display_order: number }) =>
            a.display_order - b.display_order,
        )
        .map(
          (day: {
            meals?: {
              display_order: number;
              items?: { display_order: number }[];
            }[];
          }) => ({
            ...day,
            meals: (day.meals ?? [])
              .sort(
                (a: { display_order: number }, b: { display_order: number }) =>
                  a.display_order - b.display_order,
              )
              .map((meal: { items?: { display_order: number }[] }) => ({
                ...meal,
                items: (meal.items ?? []).sort(
                  (
                    a: { display_order: number },
                    b: { display_order: number },
                  ) => a.display_order - b.display_order,
                ),
              })),
          }),
        ),
    };

    return NextResponse.json(sorted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/admin/diet-plans/[planId] — update plan metadata and nested days/meals/items
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { planId } = await params;

    const body = await request.json();
    const allowedFields = [
      "name",
      "description",
      "target_calories",
      "target_protein",
      "target_carbs",
      "target_fat",
      "num_days",
    ];

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { error: updateError } = await supabase
      .from("diet_plans")
      .update(updates)
      .eq("id", planId);

    if (updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 });

    // Handle nested days/meals/items if provided
    if (body.days && Array.isArray(body.days)) {
      // Get existing days for this plan
      const { data: existingDays } = await supabase
        .from("diet_plan_days")
        .select("id")
        .eq("plan_id", planId);

      // Delete existing meals (cascade will handle items)
      if (existingDays && existingDays.length > 0) {
        const dayIds = existingDays.map((d: { id: string }) => d.id);
        await supabase.from("diet_plan_meals").delete().in("day_id", dayIds);
      }

      // Create new days, meals, and items
      for (const day of body.days) {
        // Find or create the day
        let dayId = existingDays?.find(
          (d: { id: string }, i: number) => i === body.days.indexOf(day),
        )?.id;

        if (!dayId) {
          const { data: dayData, error: dayError } = await supabase
            .from("diet_plan_days")
            .insert({
              plan_id: planId,
              day_number: day.day_number,
              name: day.name || null,
              display_order: day.day_number - 1,
            })
            .select("id")
            .single();

          if (dayError) continue;
          dayId = dayData.id;
        }

        if (day.meals && Array.isArray(day.meals)) {
          for (const meal of day.meals) {
            const { data: mealData, error: mealError } = await supabase
              .from("diet_plan_meals")
              .insert({
                day_id: dayId,
                meal_type: meal.meal_type,
                display_order: meal.display_order ?? 0,
                notes: meal.notes || null,
              })
              .select("id")
              .single();

            if (mealError) continue;

            if (meal.items && Array.isArray(meal.items)) {
              const itemRows = meal.items.map(
                (
                  item: {
                    food_id: string;
                    quantity?: number;
                    serving_unit?: string;
                    notes?: string;
                  },
                  idx: number,
                ) => ({
                  meal_id: mealData.id,
                  food_id: item.food_id,
                  quantity: item.quantity ?? 1,
                  serving_unit: item.serving_unit || null,
                  notes: item.notes || null,
                  display_order: idx,
                }),
              );

              await supabase.from("diet_plan_meal_items").insert(itemRows);
            }
          }
        }
      }
    }

    // Fetch updated plan with full nested data
    const { data: updatedPlan, error: fetchError } = await supabase
      .from("diet_plans")
      .select(
        `*, days:diet_plan_days(
          *,
          meals:diet_plan_meals(
            *,
            items:diet_plan_meal_items(
              *,
              food:foods(*)
            )
          )
        )`,
      )
      .eq("id", planId)
      .single();

    if (fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 });

    return NextResponse.json(updatedPlan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/admin/diet-plans/[planId] — delete plan and deactivate assignments
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { planId } = await params;

    // Deactivate all active assignments for this plan first
    await supabase
      .from("diet_plan_assignments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("plan_id", planId)
      .eq("status", "active");

    // Soft delete the plan
    const { error } = await supabase
      .from("diet_plans")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", planId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
