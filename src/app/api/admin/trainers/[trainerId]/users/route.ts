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
      .select("id,trainer_id,user_id,status,tier_assigned,notes,invited_at,joined_at,created_at,updated_at", {
        count: "exact",
      })
      .eq("trainer_id", trainerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch user profiles for the relationships
    type UserWithProfile = typeof relationships[number] & {
      user: { id: any; user_id: any; email: any; display_name: any; assigned_trainer_id: any } | null;
    };
    let users: UserWithProfile[] = (relationships ?? []).map((r) => ({
      ...r,
      user: null,
    }));

    if (users.length > 0) {
      const userIds = users.map((r) => r.user_id).filter(Boolean);
      console.log("[GET trainer users] Found relationships:", {
        count: users.length,
        userIds,
      });

      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("user_profiles")
          .select("id, user_id, email, display_name, assigned_trainer_id")
          .in("user_id", userIds);

        console.log("[GET trainer users] Profile lookup:", {
          found: profiles?.length ?? 0,
          error: profileError?.message,
        });

        if (profiles && profiles.length > 0) {
          const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
          users = users.map((r) => ({
            ...r,
            user: profileMap.get(r.user_id) || null,
          }));
        }
      }
    }

    return NextResponse.json({
      trainer,
      users,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/admin/trainers/[trainerId]/users — assign an existing user to this trainer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trainerId: string }> },
) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;
    const { trainerId } = await params;

    const body = await request.json();
    const { user_id } = body as { user_id?: string };

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }

    // Verify trainer exists and is a trainer
    const { data: trainer, error: trainerError } = await supabase
      .from("user_profiles")
      .select("id, role")
      .eq("id", trainerId)
      .eq("role", "trainer")
      .single();

    if (trainerError || !trainer) {
      return NextResponse.json(
        { error: "Trainer not found" },
        { status: 404 },
      );
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select("id, user_id, subscription_tier")
      .eq("user_id", user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is already assigned to this trainer (joined/invited)
    const { data: existing } = await supabase
      .from("trainer_users")
      .select("id, status")
      .eq("trainer_id", trainerId)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing && existing.status !== "removed" && existing.status !== "rejected") {
      return NextResponse.json(
        { error: "User already assigned to this trainer" },
        { status: 400 },
      );
    }

    // Reactivate if a removed/rejected row exists, else insert
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("trainer_users")
        .update({
          status: "joined",
          joined_at: new Date().toISOString(),
          tier_assigned: user.subscription_tier,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError)
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );

      await supabase
        .from("user_profiles")
        .update({
          assigned_trainer_id: trainerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      return NextResponse.json({ success: true, relationship: updated });
    }

    const { data: relationship, error: insertError } = await supabase
      .from("trainer_users")
      .insert({
        trainer_id: trainerId,
        user_id,
        status: "joined",
        joined_at: new Date().toISOString(),
        tier_assigned: user.subscription_tier,
      })
      .select()
      .single();

    if (insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 });

    await supabase
      .from("user_profiles")
      .update({
        assigned_trainer_id: trainerId,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    return NextResponse.json({ success: true, relationship });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
