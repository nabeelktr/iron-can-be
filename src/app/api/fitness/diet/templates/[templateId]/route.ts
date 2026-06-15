import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";
import { canAccessTemplate } from "@/lib/diet/template-access";

// GET /api/fitness/diet/templates/[templateId] — full nested template for preview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { templateId } = await params;

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
      .eq("id", templateId)
      .eq("is_template", true)
      .eq("is_active", true)
      .single();

    if (error || !plan)
      return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const allowed = await canAccessTemplate(supabase, user.id, plan);
    if (!allowed)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Sort nested data by display_order (mirrors /api/fitness/diet).
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
