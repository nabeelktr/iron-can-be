import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/analytics — revenue by tier, user counts, upgrade funnels
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    // Run all queries in parallel
    const [
      totalUsersResult,
      basicResult,
      premiumResult,
      trainersResult,
      activeSubsResult,
      completedPaymentsResult,
      upgradeRequestsResult,
      approvedUpgradesResult,
    ] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "user"),
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "user")
        .eq("subscription_tier", "basic"),
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "user")
        .eq("subscription_tier", "premium"),
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "trainer")
        .eq("trainer_status", "approved"),
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("payments")
        .select("amount_paise, tier")
        .eq("status", "completed"),
      supabase
        .from("upgrade_requests")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("upgrade_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
    ]);

    // Calculate revenue
    let totalRevenue = 0;
    let basicRevenue = 0;
    let premiumRevenue = 0;
    const payments = completedPaymentsResult.data ?? [];

    for (const p of payments) {
      totalRevenue += p.amount_paise;
      if (p.tier === "basic") basicRevenue += p.amount_paise;
      if (p.tier === "premium") premiumRevenue += p.amount_paise;
    }

    const totalUpgrades = upgradeRequestsResult.count ?? 0;
    const approvedUpgrades = approvedUpgradesResult.count ?? 0;
    const upgradeRate =
      totalUpgrades > 0
        ? Math.round((approvedUpgrades / totalUpgrades) * 100)
        : 0;

    return NextResponse.json({
      users: {
        total: totalUsersResult.count ?? 0,
        basic: basicResult.count ?? 0,
        premium: premiumResult.count ?? 0,
      },
      trainers: {
        active: trainersResult.count ?? 0,
      },
      subscriptions: {
        active: activeSubsResult.count ?? 0,
      },
      revenue: {
        total_paise: totalRevenue,
        basic_paise: basicRevenue,
        premium_paise: premiumRevenue,
        total_payments: payments.length,
      },
      upgrade_funnel: {
        total_requests: totalUpgrades,
        approved: approvedUpgrades,
        conversion_rate: upgradeRate,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
