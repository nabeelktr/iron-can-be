import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// DELETE /api/fitness/water/logs/[logId] — undo a water entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { logId } = await params;

    const { error } = await supabase
      .from("water_logs")
      .delete()
      .eq("id", logId)
      .eq("user_id", user.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
