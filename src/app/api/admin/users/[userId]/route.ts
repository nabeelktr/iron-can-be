import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";

// GET /api/admin/users/[userId] — get single user detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { userId } = await params;

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

    if (profileResult.error)
      return NextResponse.json({ error: profileResult.error.message }, { status: 500 });

    if (!profileResult.data)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      user: profileResult.data,
      activeDietPlan: assignmentResult.data ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
