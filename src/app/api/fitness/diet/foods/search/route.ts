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
  source: "local" | "openfoodfacts";
  barcode?: string | null;
}

interface OFFSearchHit {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  image_small_url?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
  };
}

// GET /api/fitness/diet/foods/search?q=... — unified food search.
// Hits local DB (curated + Indian seed) first, then Open Food Facts as a fallback
// for broader/branded coverage. Local results are prioritised and tagged.
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

    // 1. Local DB (verified foods preferred — order by is_verified desc)
    const { data: local } = await supabase
      .from("foods")
      .select("*")
      .eq("is_active", true)
      .ilike("name", `%${q}%`)
      .order("is_verified", { ascending: false })
      .order("name")
      .limit(limit);

    const localResults: UnifiedFoodResult[] = (local ?? []).map((f) => ({
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

    // If local already saturates the page, return early
    if (localResults.length >= limit) {
      return NextResponse.json(localResults.slice(0, limit));
    }

    // 2. Fallback: Open Food Facts search (no API key; free)
    const remaining = limit - localResults.length;
    const offUrl =
      `https://world.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(q)}` +
      `&search_simple=1&action=process&json=1&page_size=${remaining}` +
      `&fields=code,product_name,product_name_en,brands,image_small_url,nutriments`;

    let offResults: UnifiedFoodResult[] = [];
    try {
      const upstream = await fetch(offUrl, {
        headers: { "User-Agent": "IronCan/1.0 (nabeel@fleapo.com)" },
        signal: AbortSignal.timeout(4000),
      });
      if (upstream.ok) {
        const data = (await upstream.json()) as { products?: OFFSearchHit[] };
        const seen = new Set(
          localResults.map((r) => r.name.toLowerCase().trim()),
        );
        offResults = (data.products ?? [])
          .map((p): UnifiedFoodResult | null => {
            const name = p.product_name_en || p.product_name;
            const kcal = p.nutriments?.["energy-kcal_100g"];
            if (!name || kcal == null) return null;
            if (seen.has(name.toLowerCase().trim())) return null;
            return {
              id: `off_${p.code ?? name}`,
              name,
              brand: p.brands?.split(",")[0]?.trim() || null,
              calories: Math.round(kcal),
              protein_g:
                Math.round((p.nutriments?.proteins_100g ?? 0) * 10) / 10,
              carbs_g:
                Math.round((p.nutriments?.carbohydrates_100g ?? 0) * 10) / 10,
              fat_g: Math.round((p.nutriments?.fat_100g ?? 0) * 10) / 10,
              fiber_g: Math.round((p.nutriments?.fiber_100g ?? 0) * 10) / 10,
              serving_size: 100,
              serving_unit: "g",
              image_url: p.image_small_url ?? null,
              source: "openfoodfacts",
              barcode: p.code ?? null,
            };
          })
          .filter((x): x is UnifiedFoodResult => x !== null);
      }
    } catch {
      // Network or timeout — fall through with local-only results
    }

    return NextResponse.json([...localResults, ...offResults]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
