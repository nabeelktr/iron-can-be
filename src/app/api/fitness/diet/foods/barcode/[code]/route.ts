import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

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
  source: "local";
}

// GET /api/fitness/diet/foods/barcode/[code] — look up a barcode in the curated library.
// Only returns foods an admin has previously added with this barcode.
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

    const { data: localFood } = await supabase
      .from("foods")
      .select("*")
      .eq("barcode", barcode)
      .eq("is_active", true)
      .maybeSingle();

    if (!localFood) {
      return NextResponse.json(
        { error: "Barcode not found" },
        { status: 404 },
      );
    }

    const result: BarcodeLookupResult = {
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
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
