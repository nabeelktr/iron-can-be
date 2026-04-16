import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// POST /api/trainer/users/invite — invite a user by email
export async function POST(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from("user_profiles")
      .select("id, user_id, email, subscription_tier")
      .eq("email", email.toLowerCase())
      .single();

    if (existingUser) {
      // Check if already in trainer's network
      const { data: existing } = await supabase
        .from("trainer_users")
        .select("id, status")
        .eq("trainer_id", profile.id)
        .eq("user_id", existingUser.user_id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: "User already in your network" },
          { status: 400 },
        );
      }

      // Add existing user to trainer's network
      const { data: relationship, error } = await supabase
        .from("trainer_users")
        .insert({
          trainer_id: profile.id,
          user_id: existingUser.user_id,
          status: "invited",
          tier_assigned: "premium",
        })
        .select()
        .single();

      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        invitation_id: relationship.id,
        status: "invited_existing_user",
      });
    }

    // User doesn't exist yet — create a pending invitation
    // In the future, send an email with invite link
    // For now, return a referral link
    const inviteLink = `ironcan://invite?trainer=${profile.id}&email=${encodeURIComponent(email)}`;

    return NextResponse.json({
      status: "invite_sent",
      invite_link: inviteLink,
      message: "User does not have an account yet. Share the invite link.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
