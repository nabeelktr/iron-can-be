import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";

// POST /api/fitness/days — create a new day in a plan
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { planId, name: rawName } = body;
    const name = rawName?.trim();

    if (!planId)
      return NextResponse.json(
        { error: "planId is required" },
        { status: 400 },
      );
    if (!name)
      return NextResponse.json(
        { error: "Day name is required" },
        { status: 400 },
      );

    const { data: existing } = await supabase
      .from("workout_days")
      .select("display_order")
      .eq("plan_id", planId)
      .order("display_order", { ascending: false })
      .limit(1);

    const nextOrder =
      existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

    const { data, error } = await supabase
      .from("workout_days")
      .insert({
        plan_id: planId,
        user_id: user.id,
        name,
        display_order: nextOrder,
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
