import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// PUT /api/fitness/profile/onboarding — complete onboarding
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { height_cm, weight_kg, age, gender, activity_level, fitness_goal, dietary_preferences } = body;

    if (!height_cm || !weight_kg || !age || !gender || !activity_level || !fitness_goal) {
      return NextResponse.json(
        { error: "All required fields must be provided: height_cm, weight_kg, age, gender, activity_level, fitness_goal" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("user_profiles")
      .update({
        height_cm,
        weight_kg,
        age,
        gender,
        activity_level,
        fitness_goal,
        dietary_preferences: dietary_preferences || [],
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
