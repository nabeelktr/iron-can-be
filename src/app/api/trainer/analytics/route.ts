import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/analytics — trainer network stats
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    // Run all counts in parallel
    const [totalResult, joinedResult, invitedResult, pendingUpgradesResult] =
      await Promise.all([
        supabase
          .from("trainer_users")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", profile.id),
        supabase
          .from("trainer_users")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", profile.id)
          .eq("status", "joined"),
        supabase
          .from("trainer_users")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", profile.id)
          .eq("status", "invited"),
        supabase
          .from("upgrade_requests")
          .select("id", { count: "exact", head: true })
          .eq("requested_trainer_id", profile.id)
          .eq("status", "pending"),
      ]);

    // Count diet plans created by this trainer
    const { count: dietPlanCount } = await supabase
      .from("diet_plans")
      .select("id", { count: "exact", head: true })
      .eq("created_by_trainer_id", profile.id)
      .eq("is_active", true);

    return NextResponse.json({
      total_users: totalResult.count ?? 0,
      joined_users: joinedResult.count ?? 0,
      invited_users: invitedResult.count ?? 0,
      pending_upgrades: pendingUpgradesResult.count ?? 0,
      diet_plans_created: dietPlanCount ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
