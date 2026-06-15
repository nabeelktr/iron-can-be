import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/diet-plans — list all diet plans
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const isTemplate = searchParams.get("is_template");

    let query = supabase
      .from("diet_plans")
      .select("*, days:diet_plan_days(count)")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    if (isTemplate === "true") {
      query = query.eq("is_template", true);
    } else if (isTemplate === "false") {
      query = query.eq("is_template", false);
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

// POST /api/admin/diet-plans — create a diet plan with nested days/meals/items
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { name, description, target_calories, target_protein, target_carbs, target_fat, num_days, days, is_template, is_public } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
    }

    // Create the plan. A public template is a global template available to all
    // users; mark it as a template implicitly when published publicly.
    const { data: plan, error: planError } = await supabase
      .from("diet_plans")
      .insert({
        created_by: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        target_calories: target_calories || null,
        target_protein: target_protein || null,
        target_carbs: target_carbs || null,
        target_fat: target_fat || null,
        num_days: num_days || 7,
        is_template: is_template === true || is_public === true,
        is_public: is_public === true,
      })
      .select("id")
      .single();

    if (planError)
      return NextResponse.json({ error: planError.message }, { status: 500 });

    // Create nested days, meals, and items if provided
    if (days && Array.isArray(days)) {
      for (const day of days) {
        const { data: dayData, error: dayError } = await supabase
          .from("diet_plan_days")
          .insert({
            plan_id: plan.id,
            day_number: day.day_number,
            name: day.name || null,
            display_order: day.day_number - 1,
          })
          .select("id")
          .single();

        if (dayError) continue;

        if (day.meals && Array.isArray(day.meals)) {
          for (const meal of day.meals) {
            const { data: mealData, error: mealError } = await supabase
              .from("diet_plan_meals")
              .insert({
                day_id: dayData.id,
                meal_type: meal.meal_type,
                display_order: meal.display_order ?? 0,
                notes: meal.notes || null,
              })
              .select("id")
              .single();

            if (mealError) continue;

            if (meal.items && Array.isArray(meal.items)) {
              const itemRows = meal.items.map(
                (item: { food_id: string; quantity?: number; serving_unit?: string; notes?: string }, idx: number) => ({
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

    return NextResponse.json({ id: plan.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
