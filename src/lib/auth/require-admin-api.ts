import { requireAuthAPI, isAuthError } from "./require-auth-api";
import { NextResponse, type NextRequest } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { UserProfile } from "@/types/diet";

interface AdminAuthResult {
  supabase: SupabaseClient;
  user: User;
  profile: UserProfile;
}

/**
 * Auth helper that requires the user to have admin role.
 * Returns 403 if the user is not an admin.
 */
export async function requireAdminAPI(
  request: NextRequest,
): Promise<AdminAuthResult | NextResponse> {
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

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { supabase, user, profile: profile as UserProfile };
}

export function isAdminError(
  result: AdminAuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
