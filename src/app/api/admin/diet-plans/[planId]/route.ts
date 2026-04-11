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
        .sort((a: { display_order: number }, b: { display_order: number }) =>
          a.display_order - b.display_order,
        )
        .map((day: { meals?: { display_order: number; items?: { display_order: number }[] }[] }) => ({
          ...day,
          meals: (day.meals ?? [])
            .sort((a: { display_order: number }, b: { display_order: number }) =>
              a.display_order - b.display_order,
            )
            .map((meal: { items?: { display_order: number }[] }) => ({
              ...meal,
              items: (meal.items ?? []).sort(
                (a: { display_order: number }, b: { display_order: number }) =>
                  a.display_order - b.display_order,
              ),
            })),
        })),
    };

    return NextResponse.json(sorted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/admin/diet-plans/[planId] — update plan metadata
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
      "name", "description", "target_calories", "target_protein",
      "target_carbs", "target_fat", "num_days",
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { error } = await supabase
      .from("diet_plans")
      .update(updates)
      .eq("id", planId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
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
