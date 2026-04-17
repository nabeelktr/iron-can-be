import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// DELETE /api/admin/trainers/[trainerId]/users/[userId] — unassign user from trainer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ trainerId: string; userId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { trainerId, userId } = await params;

    const { data: relationship, error: relError } = await supabase
      .from("trainer_users")
      .select("id")
      .eq("trainer_id", trainerId)
      .eq("user_id", userId)
      .maybeSingle();

    if (relError)
      return NextResponse.json({ error: relError.message }, { status: 500 });

    if (!relationship)
      return NextResponse.json(
        { error: "Relationship not found" },
        { status: 404 },
      );

    const { error: updateError } = await supabase
      .from("trainer_users")
      .update({
        status: "removed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", relationship.id);

    if (updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );

    // Clear assigned_trainer_id if it still points at this trainer
    await supabase
      .from("user_profiles")
      .update({
        assigned_trainer_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("assigned_trainer_id", trainerId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
