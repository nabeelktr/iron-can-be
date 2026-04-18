import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface WeightHistoryRow {
  date: string;
  weight_kg: number;
}

// GET /api/fitness/weight/history?days=30 — weight trend over N days
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];

    const { data: logs, error } = await supabase
      .from("weight_logs")
      .select("date, weight_kg")
      .eq("user_id", user.id)
      .gte("date", startDateStr)
      .order("date", { ascending: true });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Deduplicate: keep only the latest weight per day
    const dayMap = new Map<string, number>();
    for (const log of logs ?? []) {
      dayMap.set(log.date, log.weight_kg);
    }

    const daily: WeightHistoryRow[] = Array.from(dayMap.entries())
      .map(([date, weight_kg]) => ({ date, weight_kg }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      period_days: days,
      daily,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
