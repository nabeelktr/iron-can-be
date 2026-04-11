import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/utils/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";

interface AuthResult {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Dual-auth helper for API routes.
 * Supports both:
 * - Cookie-based sessions (web / Next.js)
 * - Bearer token auth (React Native / mobile)
 */
export async function requireAuthAPI(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const authHeader = request.headers.get("authorization");

  // Mobile path: Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return { supabase, user };
  }

  // Web path: cookie-based session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { supabase, user };
}

/** Type guard to check if the auth result is an error response */
export function isAuthError(
  result: AuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
