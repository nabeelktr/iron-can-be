import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/trainers — list all trainers with stats
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // pending | approved | suspended
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("user_profiles")
      .select("*", { count: "exact" })
      .eq("role", "trainer")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("trainer_status", status);
    }

    if (search) {
      query = query.or(
        `email.ilike.%${search}%,display_name.ilike.%${search}%`,
      );
    }

    const { data: trainers, error, count } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Get user counts per trainer
    const trainerIds = (trainers ?? []).map((t) => t.id);
    let userCounts: Record<string, number> = {};

    if (trainerIds.length > 0) {
      const { data: counts } = await supabase
        .from("trainer_users")
        .select("trainer_id")
        .in("trainer_id", trainerIds)
        .eq("status", "joined");

      if (counts) {
        for (const row of counts) {
          userCounts[row.trainer_id] =
            (userCounts[row.trainer_id] || 0) + 1;
        }
      }
    }

    const trainersWithStats = (trainers ?? []).map((t) => ({
      ...t,
      user_count: userCounts[t.id] || 0,
    }));

    return NextResponse.json({
      trainers: trainersWithStats,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
