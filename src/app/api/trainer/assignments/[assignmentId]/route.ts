import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// DELETE /api/trainer/assignments/[assignmentId] — cancel an active diet plan assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;
    const { assignmentId } = await params;

    // Verify assignment belongs to a plan created by this trainer, OR was assigned by this trainer
    const { data: assignment, error: fetchError } = await supabase
      .from("diet_plan_assignments")
      .select("id, trainer_id")
      .eq("id", assignmentId)
      .eq("trainer_id", profile.id)
      .single();

    if (fetchError || !assignment) {
      return NextResponse.json(
        { error: "Assignment not found or unauthorized" },
        { status: 404 },
      );
    }

    const { error } = await supabase
      .from("diet_plan_assignments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", assignmentId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
