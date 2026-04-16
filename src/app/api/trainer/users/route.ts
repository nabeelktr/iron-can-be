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
      .select("*, user:user_profiles!trainer_users_user_id_fkey(*)", {
        count: "exact",
      })
      .eq("trainer_id", profile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: users, error, count } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // If search is provided, filter on the joined user profile fields
    let filtered = users ?? [];
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
