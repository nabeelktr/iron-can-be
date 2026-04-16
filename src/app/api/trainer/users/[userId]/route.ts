import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// GET /api/trainer/users/[userId] — view user detail (must be in trainer's network)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;
    const { userId } = await params;

    // Verify user is in trainer's network
    const { data: relationship, error: relError } = await supabase
      .from("trainer_users")
      .select("*")
      .eq("trainer_id", profile.id)
      .eq("user_id", userId)
      .single();

    if (relError || !relationship) {
      return NextResponse.json(
        { error: "User not in your network" },
        { status: 403 },
      );
    }

    // Fetch user profile and active diet assignment
    const [profileResult, assignmentResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("diet_plan_assignments")
        .select("*, plan:diet_plans(*)")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: profileResult.data,
      relationship,
      activeDietPlan: assignmentResult.data ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/trainer/users/[userId] — update user notes
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;
    const { userId } = await params;

    const body = await request.json();
    const { notes } = body;

    const { error } = await supabase
      .from("trainer_users")
      .update({
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("trainer_id", profile.id)
      .eq("user_id", userId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
