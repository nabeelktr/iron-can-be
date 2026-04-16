import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// GET /api/fitness/trainer — get user's assigned trainer info
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    // Get user's assigned_trainer_id
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("assigned_trainer_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.assigned_trainer_id) {
      return NextResponse.json({ trainer: null });
    }

    // Fetch trainer profile
    const { data: trainer } = await supabase
      .from("user_profiles")
      .select("id, user_id, display_name, email")
      .eq("id", profile.assigned_trainer_id)
      .eq("role", "trainer")
      .single();

    // Fetch relationship status
    const { data: relationship } = await supabase
      .from("trainer_users")
      .select("status, joined_at, tier_assigned")
      .eq("trainer_id", profile.assigned_trainer_id)
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      trainer: trainer ?? null,
      relationship: relationship ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
