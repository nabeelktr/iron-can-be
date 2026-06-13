import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-side jobs (e.g. the
 * subscription-expiry cron) that must read/write rows across all users and
 * bypass row-level security.
 *
 * Requires `SUPABASE_SERVICE_ROLE_KEY`. Falls back to the anon key so local
 * dev does not crash, but bulk cross-user writes will be rejected by RLS
 * without the service-role key.
 */
export function createAdminClient(): SupabaseClient {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
