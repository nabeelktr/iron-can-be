import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// GET /api/fitness/diet/templates — diet-plan templates the current user may apply:
//   • global templates (is_public = true), and
//   • templates created by trainers the user has joined.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    // Trainers the user has joined → their templates are visible to this user.
    const { data: relationships } = await supabase
      .from("trainer_users")
      .select("trainer_id")
      .eq("user_id", user.id)
      .eq("status", "joined");

    const trainerIds = (relationships ?? []).map(
      (r: { trainer_id: string }) => r.trainer_id,
    );

    let query = supabase
      .from("diet_plans")
      .select("*, days:diet_plan_days(count)")
      .eq("is_template", true)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    // Visibility: public templates OR templates owned by the user's trainers.
    if (trainerIds.length > 0) {
      query = query.or(
        `is_public.eq.true,created_by_trainer_id.in.(${trainerIds.join(",")})`,
      );
    } else {
      query = query.eq("is_public", true);
    }

    const { data: templates, error } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(templates ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
