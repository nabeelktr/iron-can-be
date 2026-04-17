import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface RecentFood {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
  last_logged: string;
  times_logged: number;
  source: "local" | "adhoc";
  food_id: string | null;
  external_source: string | null;
  external_id: string | null;
}

interface FoodSnapshot {
  name?: string;
  brand?: string | null;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  serving_size?: number;
  serving_unit?: string;
  external_source?: string | null;
  external_id?: string | null;
}

// GET /api/fitness/diet/foods/recent — list the user's most-recent/frequent foods.
// Groups diet_logs by food identity (food_id or snapshot name+brand) and ranks by
// recency × frequency. Great for the "Recent" tab in the picker.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      50,
      parseInt(searchParams.get("limit") || "20") || 20,
    );

    // Pull recent logs (last 60 days) to keep payload bounded
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 60);
    const sinceIso = sinceDate.toISOString().split("T")[0];

    const { data: logs, error } = await supabase
      .from("diet_logs")
      .select("food_id, food_snapshot, created_at, serving_unit")
      .eq("user_id", user.id)
      .gte("date", sinceIso)
      .order("created_at", { ascending: false })
      .limit(400);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const byKey = new Map<string, RecentFood>();

    for (const log of logs ?? []) {
      const snap = (log.food_snapshot ?? {}) as FoodSnapshot;
      const name = snap.name;
      if (!name) continue;

      const key = log.food_id
        ? `id:${log.food_id}`
        : `snap:${name.toLowerCase()}|${(snap.brand ?? "").toLowerCase()}`;

      const existing = byKey.get(key);
      if (existing) {
        existing.times_logged += 1;
        if (log.created_at > existing.last_logged) {
          existing.last_logged = log.created_at;
        }
        continue;
      }

      byKey.set(key, {
        id: log.food_id ?? `snap_${key}`,
        food_id: log.food_id,
        name,
        brand: snap.brand ?? null,
        calories: Number(snap.calories ?? 0),
        protein_g: Number(snap.protein_g ?? 0),
        carbs_g: Number(snap.carbs_g ?? 0),
        fat_g: Number(snap.fat_g ?? 0),
        fiber_g: Number(snap.fiber_g ?? 0),
        serving_size: Number(snap.serving_size ?? 1),
        serving_unit: log.serving_unit ?? snap.serving_unit ?? "serving",
        last_logged: log.created_at,
        times_logged: 1,
        source: log.food_id ? "local" : "adhoc",
        external_source: snap.external_source ?? null,
        external_id: snap.external_id ?? null,
      });
    }

    // Rank: frequency primary, recency secondary
    const sorted = [...byKey.values()].sort((a, b) => {
      if (b.times_logged !== a.times_logged)
        return b.times_logged - a.times_logged;
      return b.last_logged.localeCompare(a.last_logged);
    });

    return NextResponse.json(sorted.slice(0, limit));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
