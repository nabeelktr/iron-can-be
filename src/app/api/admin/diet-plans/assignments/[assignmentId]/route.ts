import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// DELETE /api/admin/diet-plans/assignments/[assignmentId] — remove an assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { assignmentId } = await params;

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
