import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// PUT /api/fitness/days/reorder — reorder days within a plan
// Body: { planId: string, orderedIds: string[] }
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { planId, orderedIds } = body;

    if (!planId)
      return NextResponse.json(
        { error: "planId is required" },
        { status: 400 },
      );
    if (!Array.isArray(orderedIds))
      return NextResponse.json(
        { error: "orderedIds must be an array" },
        { status: 400 },
      );

    await Promise.all(
      orderedIds.map((id: string, index: number) =>
        supabase
          .from("workout_days")
          .update({ display_order: index })
          .eq("id", id)
          .eq("user_id", user.id)
          .eq("plan_id", planId),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
