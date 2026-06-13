import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";
import { computeSubscriptionState, downgradePatch } from "@/lib/subscription";

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

    // Derive effective state and lazily downgrade if the subscription lapsed.
    const state = computeSubscriptionState(profile);
    if (state.needs_downgrade) {
      const now = new Date();
      await supabase
        .from("user_profiles")
        .update(downgradePatch(now))
        .eq("user_id", user.id);
      await supabase
        .from("subscriptions")
        .update({ status: "expired", auto_renew: false, updated_at: now.toISOString() })
        .eq("user_id", user.id);
    }

    // Get subscription record if exists
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      tier: state.tier,
      status: state.status,
      started_at: state.started_at,
      ends_at: state.ends_at,
      is_active: state.is_active,
      is_expired: state.is_expired,
      days_remaining: state.days_remaining,
      expiring_soon: state.expiring_soon,
      subscription: subscription ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
