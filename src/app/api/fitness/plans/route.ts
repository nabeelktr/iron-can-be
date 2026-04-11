import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// GET /api/fitness/plans — list all plans with days and exercises
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { data: plans, error } = await supabase
      .from("workout_plans")
      .select("*, days:workout_days(*, exercises:exercises(*))")
      .eq("user_id", user.id)
      .order("created_at");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Sort days and exercises by display_order
    const sorted =
      plans?.map((plan) => ({
        ...plan,
        days: (plan.days ?? [])
          .sort(
            (a: { display_order: number }, b: { display_order: number }) =>
              a.display_order - b.display_order,
          )
          .map((day: { exercises?: { display_order: number }[] }) => ({
            ...day,
            exercises: (day.exercises ?? []).sort(
              (a: { display_order: number }, b: { display_order: number }) =>
                a.display_order - b.display_order,
            ),
          })),
      })) ?? [];

    return NextResponse.json(sorted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/fitness/plans — create a new plan
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const name = body.name?.trim();
    if (!name)
      return NextResponse.json(
        { error: "Plan name is required" },
        { status: 400 },
      );

    // Deactivate all existing plans
    const { error: deactivateError } = await supabase
      .from("workout_plans")
      .update({ is_active: false })
      .eq("user_id", user.id);
    if (deactivateError)
      return NextResponse.json(
        { error: deactivateError.message },
        { status: 500 },
      );

    const { data, error } = await supabase
      .from("workout_plans")
      .insert({ user_id: user.id, name, is_active: true })
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
