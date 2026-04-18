import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/users/search — search for approved users to add to network
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query?.trim()) {
      return NextResponse.json(
        { error: "Search query required" },
        { status: 400 },
      );
    }

    const lower = query.toLowerCase().trim();

    // Find approved users not yet in this trainer's network
    const { data: users, error } = await supabase
      .from("user_profiles")
      .select("id, user_id, email, display_name, role, subscription_tier")
      .eq("status", "approved")
      .eq("role", "user");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter client-side for users matching the query
    const filtered = (users || []).filter(
      (u: any) =>
        u.email?.toLowerCase().includes(lower) ||
        u.display_name?.toLowerCase().includes(lower),
    );

    // Check which ones are already in this trainer's network
    const { data: existing } = await supabase
      .from("trainer_users")
      .select("user_id")
      .eq("trainer_id", profile.id);

    const existingIds = new Set((existing || []).map((e) => e.user_id));

    const available = filtered.filter((u: any) => !existingIds.has(u.user_id));

    return NextResponse.json({
      users: available.slice(0, 20),
      total: available.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
