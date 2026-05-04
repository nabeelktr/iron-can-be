import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// DELETE /api/fitness/diet/logs/[logId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { logId } = await params;

    const { error } = await supabase
      .from("diet_logs")
      .delete()
      .eq("id", logId)
      .eq("user_id", user.id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface SnapshotInput {
  name?: string;
  brand?: string | null;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  serving_size?: number;
  serving_unit?: string;
}

interface PatchBody {
  is_consumed?: boolean;
  quantity?: number;
  serving_unit?: string;
  notes?: string | null;
  food_snapshot?: SnapshotInput;
}

// PATCH /api/fitness/diet/logs/[logId]
//
// Partial update — any subset of {is_consumed, quantity, serving_unit, notes,
// food_snapshot} can be sent. Used by:
//   - tap-to-confirm (just is_consumed)
//   - long-press / edit-a-log (quantity + snapshot for re-scaled portions)
//
// `food_snapshot` replaces the existing snapshot wholesale; callers must
// already conform to the per-1-unit snapshot rule (see logs/route.ts).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> },
) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { logId } = await params;

    const body = (await request.json()) as PatchBody;

    const update: Record<string, unknown> = {};
    if (typeof body.is_consumed === "boolean")
      update.is_consumed = body.is_consumed;
    if (typeof body.quantity === "number" && Number.isFinite(body.quantity))
      update.quantity = body.quantity;
    if (typeof body.serving_unit === "string")
      update.serving_unit = body.serving_unit;
    if (body.notes === null || typeof body.notes === "string")
      update.notes = body.notes;

    if (body.food_snapshot && typeof body.food_snapshot === "object") {
      const s = body.food_snapshot;
      if (typeof s.name !== "string" || typeof s.calories !== "number") {
        return NextResponse.json(
          { error: "food_snapshot must include name and calories" },
          { status: 400 },
        );
      }
      update.food_snapshot = {
        name: s.name,
        brand: s.brand ?? null,
        calories: Number(s.calories),
        protein_g: Number(s.protein_g ?? 0),
        carbs_g: Number(s.carbs_g ?? 0),
        fat_g: Number(s.fat_g ?? 0),
        fiber_g: Number(s.fiber_g ?? 0),
        serving_size: Number(s.serving_size ?? 1),
        serving_unit: String(s.serving_unit ?? "serving"),
      };
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: log, error } = await supabase
      .from("diet_logs")
      .update(update)
      .eq("id", logId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, log });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
