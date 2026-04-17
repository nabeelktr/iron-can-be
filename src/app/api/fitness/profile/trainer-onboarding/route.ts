import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// PUT /api/fitness/profile/trainer-onboarding — complete trainer onboarding
// Body: { display_name: string, bio?: string }
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const display_name =
      typeof body.display_name === "string" ? body.display_name.trim() : "";

    if (!display_name) {
      return NextResponse.json(
        { error: "display_name is required" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      display_name,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
