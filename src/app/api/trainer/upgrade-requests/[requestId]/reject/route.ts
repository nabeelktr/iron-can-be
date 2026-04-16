import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// POST /api/trainer/upgrade-requests/[requestId]/reject — reject an upgrade request
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

    const { error } = await supabase
      .from("upgrade_requests")
      .update({
        status: "rejected",
        trainer_approved: false,
        approval_notes: notes || null,
      })
      .eq("id", requestId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
