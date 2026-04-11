import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";
import { calculateAnalytics } from "@/lib/fitness/analytics";

// GET /api/fitness/analytics — full dashboard analytics (30-day window)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const analytics = await calculateAnalytics(supabase, user.id);
    return NextResponse.json(analytics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
