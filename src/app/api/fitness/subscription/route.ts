import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// GET /api/fitness/subscription — get current user's subscription info
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    // Get profile with subscription fields
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select(
        "subscription_tier, subscription_status, subscription_started_at, subscription_ends_at, assigned_trainer_id",
      )
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      );
    }

    // Get subscription record if exists
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      tier: profile.subscription_tier,
      status: profile.subscription_status,
      started_at: profile.subscription_started_at,
      ends_at: profile.subscription_ends_at,
      subscription: subscription ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
