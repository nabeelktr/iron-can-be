import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface WeightLogRow {
  id: string;
  date: string;
  weight_kg: number;
  created_at: string;
}

// GET /api/fitness/weight?date=YYYY-MM-DD — per-day weight summary + individual logs
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

    const { data: logs, error } = await supabase
      .from("weight_logs")
      .select("id, date, weight_kg, created_at")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const latestLog = logs?.[0];
    const weight = latestLog?.weight_kg ?? null;

    return NextResponse.json({
      date,
      weight_kg: weight,
      logs: logs ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/fitness/weight — add a weight log entry
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = (await request.json()) as {
      date?: string;
      weight_kg?: number;
    };
    const weight = Number(body.weight_kg);
    if (!Number.isFinite(weight) || weight < 20 || weight > 500) {
      return NextResponse.json(
        { error: "weight_kg must be 20-500" },
        { status: 400 },
      );
    }

    const date = body.date || new Date().toISOString().split("T")[0];

    // Check if an entry already exists for today
    const { data: existing } = await supabase
      .from("weight_logs")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", date)
      .maybeSingle();

    let data, error;
    if (existing) {
      const res = await supabase
        .from("weight_logs")
        .update({ weight_kg: Math.round(weight * 100) / 100 })
        .eq("id", existing.id)
        .select("id, date, weight_kg, created_at")
        .single();
      data = res.data;
      error = res.error;
    } else {
      const res = await supabase
        .from("weight_logs")
        .insert({
          user_id: user.id,
          date,
          weight_kg: Math.round(weight * 100) / 100,
        })
        .select("id, date, weight_kg, created_at")
        .single();
      data = res.data;
      error = res.error;
    }

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ log: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
