import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// Streak rules
// - A "streak day" is any calendar day where the user logged ≥1 food item.
//   (We do NOT require adherence ≥50% because not every user has an assigned
//    plan, and we want ad-hoc loggers to build streaks too.)
// - Current streak counts backwards from today (or yesterday if today has no
//   log yet — so users don't lose their streak first thing in the morning).
// - We scan the last 365 days which is enough for any realistic streak.

// GET /api/fitness/diet/streak — current streak, longest streak in lookback window.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const lookbackDays = 365;
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    const sinceIso = since.toISOString().split("T")[0];

    const { data: logs, error } = await supabase
      .from("diet_logs")
      .select("date")
      .eq("user_id", user.id)
      .gte("date", sinceIso);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const loggedSet = new Set<string>();
    for (const log of logs ?? []) {
      loggedSet.add(log.date as string);
    }

    const today = new Date();
    const todayIso = today.toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().split("T")[0];

    // Current streak — count back from today (or yesterday if today is empty)
    let current = 0;
    let cursor = new Date(today);
    // If today has no log but yesterday does, start from yesterday (grace period)
    if (!loggedSet.has(todayIso) && loggedSet.has(yesterdayIso)) {
      cursor = new Date(yesterday);
    }
    while (true) {
      const iso = cursor.toISOString().split("T")[0];
      if (!loggedSet.has(iso)) break;
      current++;
      cursor.setDate(cursor.getDate() - 1);
      if (current > lookbackDays) break;
    }

    // Longest streak in the window
    let longest = 0;
    let run = 0;
    const dateCursor = new Date(since);
    for (let i = 0; i <= lookbackDays; i++) {
      const iso = dateCursor.toISOString().split("T")[0];
      if (loggedSet.has(iso)) {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
      dateCursor.setDate(dateCursor.getDate() + 1);
    }

    // Next badge (7, 30, 100 thresholds)
    const BADGES = [7, 30, 100, 365];
    const nextBadge = BADGES.find((b) => b > current) ?? null;

    return NextResponse.json({
      current,
      longest,
      logged_today: loggedSet.has(todayIso),
      next_badge_at: nextBadge,
      days_to_next_badge: nextBadge !== null ? nextBadge - current : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
