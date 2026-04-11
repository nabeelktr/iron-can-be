import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/dashboard — admin dashboard stats
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    // Run queries in parallel
    const [usersResult, pendingResult, plansResult, recentResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "user"),
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("diet_plan_assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("user_profiles")
        .select("*")
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({
      totalUsers: usersResult.count ?? 0,
      pendingApprovals: pendingResult.count ?? 0,
      activeDietPlans: plansResult.count ?? 0,
      recentSignups: recentResult.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
