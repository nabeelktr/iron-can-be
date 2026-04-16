import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// POST /api/admin/trainers/[trainerId]/suspend — suspend a trainer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trainerId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { trainerId } = await params;

    const { data: trainer, error: fetchError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", trainerId)
      .eq("role", "trainer")
      .single();

    if (fetchError || !trainer) {
      return NextResponse.json(
        { error: "Trainer not found" },
        { status: 404 },
      );
    }

    if (trainer.trainer_status === "suspended") {
      return NextResponse.json(
        { error: "Trainer already suspended" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("user_profiles")
      .update({
        trainer_status: "suspended",
        updated_at: new Date().toISOString(),
      })
      .eq("id", trainerId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
