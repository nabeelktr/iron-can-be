import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal_serving"?: number;
    proteins_100g?: number;
    proteins_serving?: number;
    carbohydrates_100g?: number;
    carbohydrates_serving?: number;
    fat_100g?: number;
    fat_serving?: number;
    fiber_100g?: number;
    fiber_serving?: number;
  };
  serving_size?: string;
  serving_quantity?: number;
  image_small_url?: string;
}

interface BarcodeLookupResult {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
  image_url: string | null;
  source: "openfoodfacts";
}

// GET /api/fitness/diet/foods/barcode/[code] — look up a barcode via Open Food Facts.
// OFF has strong coverage of Indian brands (Amul, Britannia, Parle, MTR, Haldiram's).
// No upstream API key needed.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase } = auth;

    const { code } = await params;
    const barcode = code.trim();
    if (!/^\d{6,14}$/.test(barcode)) {
      return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
    }

    // Check local DB first (if we previously cached this barcode as a food entry)
    const { data: localFood } = await supabase
      .from("foods")
      .select("*")
      .eq("barcode", barcode)
      .eq("is_active", true)
      .maybeSingle();

    if (localFood) {
      return NextResponse.json({
        id: localFood.id,
        barcode,
        name: localFood.name,
        brand: localFood.brand,
        calories: localFood.calories,
        protein_g: localFood.protein_g,
        carbs_g: localFood.carbs_g,
        fat_g: localFood.fat_g,
        fiber_g: localFood.fiber_g,
        serving_size: localFood.serving_size,
        serving_unit: localFood.serving_unit,
        image_url: null,
        source: "local",
      });
    }

    // Fall through to Open Food Facts
    const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "IronCan/1.0 (nabeel@fleapo.com)",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Barcode not found" },
        { status: 404 },
      );
    }

    const data = (await upstream.json()) as {
      status?: number;
      product?: OpenFoodFactsProduct;
    };

    if (data.status !== 1 || !data.product) {
      return NextResponse.json(
        { error: "Barcode not found" },
        { status: 404 },
      );
    }

    const p = data.product;
    const n = p.nutriments ?? {};
    const name = p.product_name_en || p.product_name;
    if (!name) {
      return NextResponse.json(
        { error: "Product has no name" },
        { status: 404 },
      );
    }

    // Prefer per-serving data if available, fall back to per-100g with 100g serving
    const hasPerServing = n["energy-kcal_serving"] != null;
    const servingSize = hasPerServing ? p.serving_quantity ?? 100 : 100;
    const servingUnit = "g";

    const result: BarcodeLookupResult = {
      id: `off_${barcode}`,
      barcode,
      name,
      brand: p.brands?.split(",")[0]?.trim() || null,
      calories: Math.round(
        hasPerServing ? n["energy-kcal_serving"]! : n["energy-kcal_100g"] ?? 0,
      ),
      protein_g:
        Math.round(
          ((hasPerServing ? n.proteins_serving : n.proteins_100g) ?? 0) * 10,
        ) / 10,
      carbs_g:
        Math.round(
          ((hasPerServing ? n.carbohydrates_serving : n.carbohydrates_100g) ??
            0) * 10,
        ) / 10,
      fat_g:
        Math.round(
          ((hasPerServing ? n.fat_serving : n.fat_100g) ?? 0) * 10,
        ) / 10,
      fiber_g:
        Math.round(
          ((hasPerServing ? n.fiber_serving : n.fiber_100g) ?? 0) * 10,
        ) / 10,
      serving_size: Math.round(servingSize),
      serving_unit: servingUnit,
      image_url: p.image_small_url ?? null,
      source: "openfoodfacts",
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
