import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface UnifiedFoodResult {
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
  household_units?: Array<{
    label: string;
    grams: number;
    calories?: number;
  }>;
  image_url?: string | null;
  source: "local";
  barcode?: string | null;
}

// GET /api/fitness/diet/foods/search?q=... — curated-only fuzzy search.
// Calls the search_foods() Postgres RPC which uses pg_trgm for typo-tolerant
// ranking across name + brand.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json([]);
    const limit = Math.min(
      25,
      parseInt(searchParams.get("limit") || "20") || 20,
    );

    const { data, error } = await supabase.rpc("search_foods", {
      q,
      lim: limit,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: UnifiedFoodResult[] = (data ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      brand: f.brand,
      calories: f.calories,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      fiber_g: f.fiber_g,
      serving_size: f.serving_size,
      serving_unit: f.serving_unit,
      household_units: f.household_units ?? undefined,
      barcode: f.barcode ?? null,
      source: "local",
    }));

    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
