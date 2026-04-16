import { requireAuthAPI, isAuthError } from "./require-auth-api";
import { NextResponse, type NextRequest } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile, UserRole } from "@/types/diet";

interface RoleAuthResult {
  supabase: SupabaseClient;
  user: User;
  profile: UserProfile;
}

/**
 * Generic role-based auth helper.
 * Accepts an array of allowed roles and grants access if the user matches any.
 * Useful for endpoints accessible to multiple roles (e.g., super_admin + trainer).
 */
export async function requireRoleAPI(
  request: NextRequest,
  allowedRoles: UserRole[],
): Promise<RoleAuthResult | NextResponse> {
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

  if (!allowedRoles.includes(profile.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Additional check: trainers must be approved
  if (profile.role === "trainer" && profile.trainer_status !== "approved") {
    return NextResponse.json(
      { error: "Trainer account not yet approved" },
      { status: 403 },
    );
  }

  return { supabase, user, profile: profile as UserProfile };
}

export function isRoleError(
  result: RoleAuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
