import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// GET /api/fitness/diet — get user's active diet plan with full meal structure
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    // Find active assignment
    const { data: assignment, error: assignError } = await supabase
      .from("diet_plan_assignments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (assignError)
      return NextResponse.json({ error: assignError.message }, { status: 500 });

    if (!assignment) {
      return NextResponse.json({ plan: null, assignment: null });
    }

    // Fetch the full plan with nested data
    const { data: plan, error: planError } = await supabase
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
      .eq("id", assignment.plan_id)
      .single();

    if (planError)
      return NextResponse.json({ error: planError.message }, { status: 500 });

    // Sort nested data
    const sorted = plan
      ? {
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
        }
      : null;

    return NextResponse.json({ plan: sorted, assignment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
