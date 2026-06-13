import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// GET /api/cron/expire-subscriptions
//
// Daily job (see vercel.json) that downgrades premium subscriptions whose end
// date has passed. Profiles are the source of truth the app gates on, so they
// are flipped to basic/expired; the `subscriptions` mirror is also closed out.
//
// Protected by CRON_SECRET — Vercel Cron sends it as a Bearer token, and it can
// be supplied manually via `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createAdminClient();
    const now = new Date();
    // Date-only boundary: a subscription ending today keeps access through today.
    const today = now.toISOString().split("T")[0];

    const { data: downgraded, error } = await supabase
      .from("user_profiles")
      .update({
        subscription_tier: "basic",
        subscription_status: "expired",
        updated_at: now.toISOString(),
      })
      .eq("subscription_tier", "premium")
      .lt("subscription_ends_at", today)
      .select("user_id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase
      .from("subscriptions")
      .update({
        status: "expired",
        auto_renew: false,
        updated_at: now.toISOString(),
      })
      .eq("status", "active")
      .lt("billing_cycle_end", today);

    return NextResponse.json({
      success: true,
      expired_count: downgraded?.length ?? 0,
      ran_at: now.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
