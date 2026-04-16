import { requireAuthAPI, isAuthError } from "./require-auth-api";
import { NextResponse, type NextRequest } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile } from "@/types/diet";

interface TrainerAuthResult {
  supabase: SupabaseClient;
  user: User;
  profile: UserProfile;
}

/**
 * Auth helper that requires the user to have an approved trainer role.
 * Returns 403 if the user is not a trainer or not yet approved.
 */
export async function requireTrainerAPI(
  request: NextRequest,
): Promise<TrainerAuthResult | NextResponse> {
  const auth = await requireAuthAPI(request);
  if (isAuthError(auth)) return auth;
  const { supabase, user } = auth;

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (profile.role !== "trainer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (profile.trainer_status !== "approved") {
    return NextResponse.json(
      { error: "Trainer account not yet approved" },
      { status: 403 },
    );
  }

  return { supabase, user, profile: profile as UserProfile };
}

export function isTrainerError(
  result: TrainerAuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
