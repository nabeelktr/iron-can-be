import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";
import { computeSubscriptionState, downgradePatch } from "@/lib/subscription";

// GET /api/fitness/profile — get current user's profile
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    if (!profile)
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Lazily downgrade a premium subscription whose end date has passed so the
    // client (which gates features on `subscription_tier`) always sees the
    // truthful tier even before the daily expiry cron runs.
    const subState = computeSubscriptionState(profile);
    if (subState.needs_downgrade) {
      const patch = downgradePatch();
      await supabase.from("user_profiles").update(patch).eq("user_id", user.id);
      Object.assign(profile, patch);
    }

    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/fitness/profile — update body details
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const allowedFields = [
      "display_name",
      "height_cm",
      "weight_kg",
      "age",
      "gender",
      "activity_level",
      "fitness_goal",
      "dietary_preferences",
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
