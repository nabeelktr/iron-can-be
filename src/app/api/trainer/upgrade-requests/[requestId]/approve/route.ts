import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// POST /api/trainer/upgrade-requests/[requestId]/approve — approve an upgrade request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;
    const { requestId } = await params;

    const body = await request.json().catch(() => ({}));
    const { notes } = body;

    // Verify request exists and belongs to this trainer
    const { data: upgradeRequest, error: fetchError } = await supabase
      .from("upgrade_requests")
      .select("*")
      .eq("id", requestId)
      .eq("requested_trainer_id", profile.id)
      .eq("status", "pending")
      .single();

    if (fetchError || !upgradeRequest) {
      return NextResponse.json(
        { error: "Upgrade request not found" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();

    // Update the upgrade request
    const { error: updateError } = await supabase
      .from("upgrade_requests")
      .update({
        status: "approved",
        trainer_approved: true,
        approval_notes: notes || null,
        approved_at: now,
      })
      .eq("id", requestId);

    if (updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );

    // Add user to trainer's network
    await supabase.from("trainer_users").upsert(
      {
        trainer_id: profile.id,
        user_id: upgradeRequest.user_id,
        status: "joined",
        joined_at: now,
        tier_assigned: "premium",
      },
      { onConflict: "trainer_id,user_id" },
    );

    // Update user profile: upgrade tier and assign trainer
    await supabase
      .from("user_profiles")
      .update({
        subscription_tier: "premium",
        assigned_trainer_id: profile.id,
        updated_at: now,
      })
      .eq("user_id", upgradeRequest.user_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
