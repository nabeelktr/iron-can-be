import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/users — list trainer's users
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // invited | joined | removed
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("trainer_users")
      .select("*", {
        count: "exact",
      })
      .eq("trainer_id", profile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: relationships, error, count } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch user profiles separately
    const userIds = (relationships ?? [])
      .map((r) => r.user_id as string)
      .filter(Boolean);

    let profileMap = new Map();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, email, display_name")
        .in("user_id", userIds);

      profileMap = new Map(
        (profiles ?? []).map((p) => [p.user_id, p])
      );
    }

    // If search is provided, filter on the joined user profile fields
    let filtered = (relationships ?? []).map((r) => ({
      ...r,
      user: profileMap.get(r.user_id) || null,
    }));

    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter(
        (u: any) =>
          u.user?.email?.toLowerCase().includes(lower) ||
          u.user?.display_name?.toLowerCase().includes(lower),
      );
    }

    return NextResponse.json({
      users: filtered,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
