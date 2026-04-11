import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/foods — search/list foods
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = supabase
      .from("foods")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .limit(limit);

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data: foods, error } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(foods ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/admin/foods — create a food item
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { name, brand, calories, protein_g, carbs_g, fat_g, fiber_g, serving_size, serving_unit } = body;

    if (!name || calories === undefined) {
      return NextResponse.json(
        { error: "Name and calories are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("foods")
      .insert({
        created_by: user.id,
        name: name.trim(),
        brand: brand?.trim() || null,
        calories,
        protein_g: protein_g || 0,
        carbs_g: carbs_g || 0,
        fat_g: fat_g || 0,
        fiber_g: fiber_g || 0,
        serving_size: serving_size || 1,
        serving_unit: serving_unit || "g",
        is_verified: true,
      })
      .select("id")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ id: data?.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
