import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/trainers/[trainerId]/users — view all users of a trainer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trainerId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { trainerId } = await params;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Verify trainer exists
    const { data: trainer, error: trainerError } = await supabase
      .from("user_profiles")
      .select("id, display_name, email")
      .eq("id", trainerId)
      .eq("role", "trainer")
      .single();

    if (trainerError || !trainer) {
      return NextResponse.json(
        { error: "Trainer not found" },
        { status: 404 },
      );
    }

    // Get trainer's users via trainer_users join
    const { data: relationships, error, count } = await supabase
      .from("trainer_users")
      .select("*, user:user_profiles!trainer_users_user_id_fkey(*)", {
        count: "exact",
      })
      .eq("trainer_id", trainerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      trainer,
      users: relationships ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
