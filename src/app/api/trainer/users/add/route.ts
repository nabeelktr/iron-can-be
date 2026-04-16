import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// POST /api/trainer/users/add — add an existing registered user to trainer's network
export async function POST(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }

    // Verify user exists and is a premium user
    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select("id, user_id, email, subscription_tier, status")
      .eq("user_id", user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status !== "approved") {
      return NextResponse.json(
        { error: "User is not approved" },
        { status: 400 },
      );
    }

    // Check if already in this trainer's network
    const { data: existing } = await supabase
      .from("trainer_users")
      .select("id")
      .eq("trainer_id", profile.id)
      .eq("user_id", user_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "User already in your network" },
        { status: 400 },
      );
    }

    // Add user to trainer's network
    const { data: relationship, error } = await supabase
      .from("trainer_users")
      .insert({
        trainer_id: profile.id,
        user_id: user_id,
        status: "joined",
        joined_at: new Date().toISOString(),
        tier_assigned: user.subscription_tier,
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Update user's assigned_trainer_id
    await supabase
      .from("user_profiles")
      .update({
        assigned_trainer_id: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    return NextResponse.json({ success: true, relationship });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
