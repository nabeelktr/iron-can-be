import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

interface NutritionixRaw {
  nix_item_id?: string;
  tag_id?: string;
  item_name?: string;
  food_name?: string;
  brand_name?: string;
  nf_calories?: number;
  nf_protein_g?: number;
  nf_total_carbohydrate?: number;
  nf_total_fat?: number;
  nf_dietary_fiber?: number;
  serving_weight_grams?: number;
  serving_unit?: string;
}

interface ExternalFoodResult {
  id: string;
  name: string;
  brand: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
  source: "nutritionix";
  is_verified: false;
  is_active: true;
  created_by: "nutritionix";
  created_at: string;
  updated_at: string;
}

function toResult(item: NutritionixRaw): ExternalFoodResult | null {
  const id = item.nix_item_id || item.tag_id;
  const name = item.item_name || item.food_name;
  if (!id || !name || item.nf_calories === undefined) return null;
  const now = new Date().toISOString();
  return {
    id: `nx_${id}`,
    name,
    brand: item.brand_name || "",
    calories: Math.round(item.nf_calories),
    protein_g: Math.round((item.nf_protein_g || 0) * 10) / 10,
    carbs_g: Math.round((item.nf_total_carbohydrate || 0) * 10) / 10,
    fat_g: Math.round((item.nf_total_fat || 0) * 10) / 10,
    fiber_g: Math.round((item.nf_dietary_fiber || 0) * 10) / 10,
    serving_size: Math.round(item.serving_weight_grams || 100),
    serving_unit: "g",
    source: "nutritionix",
    is_verified: false,
    is_active: true,
    created_by: "nutritionix",
    created_at: now,
    updated_at: now,
  };
}

// GET /api/admin/foods/search-external?q=... — proxy to Nutritionix with server-side credentials.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json([]);

    const appId = process.env.NUTRITIONIX_APP_ID;
    const appKey = process.env.NUTRITIONIX_APP_KEY;
    if (!appId || !appKey) {
      return NextResponse.json(
        { error: "Nutritionix credentials not configured" },
        { status: 503 },
      );
    }

    const url = `https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(q)}&self=true&branded=true&common=true`;
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "x-app-id": appId,
        "x-app-key": appKey,
        "Content-Type": "application/json",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json([], { status: 200 });
    }

    const data = (await upstream.json()) as {
      branded?: NutritionixRaw[];
      common?: NutritionixRaw[];
    };

    const results: ExternalFoodResult[] = [];
    for (const item of (data.branded ?? []).slice(0, 5)) {
      const r = toResult(item);
      if (r) results.push(r);
    }
    for (const item of (data.common ?? []).slice(0, 5)) {
      const r = toResult(item);
      if (r) results.push(r);
    }

    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
