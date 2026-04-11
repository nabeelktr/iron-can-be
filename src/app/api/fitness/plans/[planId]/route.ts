import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

type Params = { params: Promise<{ planId: string }> };

// PUT /api/fitness/plans/:planId — switch to plan or rename
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { planId } = await params;

    const body = await request.json();

    // Rename
    if (body.name !== undefined) {
      const name = body.name?.trim();
      if (!name)
        return NextResponse.json(
          { error: "Plan name is required" },
          { status: 400 },
        );

      const { error } = await supabase
        .from("workout_plans")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", planId)
        .eq("user_id", user.id);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ success: true });
    }

    // Switch (activate)
    if (body.is_active === true) {
      const { error: deactivateError } = await supabase
        .from("workout_plans")
        .update({ is_active: false })
        .eq("user_id", user.id);
      if (deactivateError)
        return NextResponse.json(
          { error: deactivateError.message },
          { status: 500 },
        );

      const { error } = await supabase
        .from("workout_plans")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", planId)
        .eq("user_id", user.id);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No action specified" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/fitness/plans/:planId — delete plan, auto-activate another
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { planId } = await params;

    const { error: deleteError } = await supabase
      .from("workout_plans")
      .delete()
      .eq("id", planId)
      .eq("user_id", user.id);
    if (deleteError)
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );

    // Auto-activate the most recent remaining plan
    const { data: remaining } = await supabase
      .from("workout_plans")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (remaining && remaining.length > 0) {
      await supabase
        .from("workout_plans")
        .update({ is_active: true })
        .eq("id", remaining[0].id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
