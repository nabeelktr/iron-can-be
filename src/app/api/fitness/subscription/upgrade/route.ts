import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// POST /api/fitness/subscription/upgrade — request upgrade from basic to premium
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { trainer_id } = body; // optional: request a specific trainer

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("subscription_tier, subscription_status")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 },
      );
    }

    if (profile.subscription_tier === "premium") {
      return NextResponse.json(
        { error: "Already on premium tier" },
        { status: 400 },
      );
    }

    // Check for existing pending upgrade request
    const { data: existing } = await supabase
      .from("upgrade_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "You already have a pending upgrade request" },
        { status: 400 },
      );
    }

    // If trainer_id is provided, verify trainer exists and is approved
    if (trainer_id) {
      const { data: trainer } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", trainer_id)
        .eq("role", "trainer")
        .eq("trainer_status", "approved")
        .single();

      if (!trainer) {
        return NextResponse.json(
          { error: "Trainer not found or not approved" },
          { status: 404 },
        );
      }
    }

    // Create upgrade request
    const { data: upgradeRequest, error } = await supabase
      .from("upgrade_requests")
      .insert({
        user_id: user.id,
        from_tier: "basic",
        to_tier: "premium",
        requested_trainer_id: trainer_id || null,
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // If no trainer requested, auto-approve (just need payment in the future)
    if (!trainer_id) {
      await supabase
        .from("upgrade_requests")
        .update({
          status: "approved",
          trainer_approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq("id", upgradeRequest.id);

      // Upgrade the user's tier directly
      await supabase
        .from("user_profiles")
        .update({
          subscription_tier: "premium",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return NextResponse.json({
        upgrade_request_id: upgradeRequest.id,
        status: "approved",
        message: "Upgraded to premium (payment integration pending)",
      });
    }

    return NextResponse.json({
      upgrade_request_id: upgradeRequest.id,
      status: "pending_trainer_approval",
      message: "Waiting for trainer to approve your request",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
