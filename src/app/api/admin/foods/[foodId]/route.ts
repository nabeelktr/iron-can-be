import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// PUT /api/admin/foods/[foodId] — update a food item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ foodId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { foodId } = await params;

    const body = await request.json();
    const allowedFields = [
      "name", "brand", "calories", "protein_g", "carbs_g",
      "fat_g", "fiber_g", "serving_size", "serving_unit",
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { error } = await supabase
      .from("foods")
      .update(updates)
      .eq("id", foodId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/admin/foods/[foodId] — soft-delete a food item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ foodId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { foodId } = await params;

    const { error } = await supabase
      .from("foods")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", foodId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
