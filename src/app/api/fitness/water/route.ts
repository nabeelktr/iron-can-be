import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// Default target. We'll make this user-configurable in a later phase — for
// now everyone gets 2500ml which matches IOM/EFSA general-adult guidance.
const DEFAULT_TARGET_ML = 2500;

interface WaterLogRow {
  id: string;
  date: string;
  amount_ml: number;
  created_at: string;
}

// GET /api/fitness/water?date=YYYY-MM-DD — per-day water summary + individual logs
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

    const { data: logs, error } = await supabase
      .from("water_logs")
      .select("id, date, amount_ml, created_at")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const total = (logs ?? []).reduce(
      (s: number, l: WaterLogRow) => s + (l.amount_ml ?? 0),
      0,
    );

    return NextResponse.json({
      date,
      total_ml: total,
      target_ml: DEFAULT_TARGET_ML,
      logs: logs ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/fitness/water — add a water log entry
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = (await request.json()) as {
      date?: string;
      amount_ml?: number;
    };
    const amount = Number(body.amount_ml);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
      return NextResponse.json(
        { error: "amount_ml must be 1-5000" },
        { status: 400 },
      );
    }

    const date = body.date || new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("water_logs")
      .insert({
        user_id: user.id,
        date,
        amount_ml: Math.round(amount),
      })
      .select("id, date, amount_ml, created_at")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ log: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
