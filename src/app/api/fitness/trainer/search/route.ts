import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// POST /api/fitness/trainer/search — search available trainers
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase } = auth;

    const body = await request.json().catch(() => ({}));
    const { query } = body;

    let dbQuery = supabase
      .from("user_profiles")
      .select("id, user_id, display_name, email, referral_code")
      .eq("role", "trainer")
      .eq("trainer_status", "approved")
      .order("display_name", { ascending: true })
      .limit(20);

    if (query && typeof query === "string" && query.trim()) {
      const trimmedQuery = query.trim();
      dbQuery = dbQuery.or(
        `display_name.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%,referral_code.eq.${trimmedQuery}`,
      );
    }

    const { data: trainers, error } = await dbQuery;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ trainers: trainers ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
