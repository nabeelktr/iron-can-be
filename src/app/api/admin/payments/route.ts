import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/payments — list all payments with filters
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const tier = searchParams.get("tier");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("payments")
      .select("*, user:user_profiles!payments_user_id_fkey(email, display_name)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (tier) query = query.eq("tier", tier);

    const { data: payments, error, count } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Calculate revenue summary
    const { data: revenueData } = await supabase
      .from("payments")
      .select("amount_paise, tier")
      .eq("status", "completed");

    let totalRevenue = 0;
    let basicRevenue = 0;
    let premiumRevenue = 0;

    if (revenueData) {
      for (const p of revenueData) {
        totalRevenue += p.amount_paise;
        if (p.tier === "basic") basicRevenue += p.amount_paise;
        if (p.tier === "premium") premiumRevenue += p.amount_paise;
      }
    }

    return NextResponse.json({
      payments: payments ?? [],
      total: count ?? 0,
      page,
      limit,
      revenue_summary: {
        total_paise: totalRevenue,
        basic_paise: basicRevenue,
        premium_paise: premiumRevenue,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
