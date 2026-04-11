import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthAPI,
  isAuthError,
} from "@/lib/auth/require-auth-api";
import { calculateStreak, calculateAnalytics } from "@/lib/fitness/analytics";
import type { WorkoutPlan, ExerciseLog } from "@/types/fitness";

// GET /api/fitness/data — initial page data (plans + today logs + streak + analytics + previous logs)
// This is the equivalent of what the Next.js page.tsx fetches on load.
// The RN app calls this once on launch to hydrate the entire fitness screen.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const today = new Date().toISOString().split("T")[0];

    const [{ data: plans }, { data: todayLogs }, streak, analytics] =
      await Promise.all([
        supabase
          .from("workout_plans")
          .select("*, days:workout_days(*, exercises:exercises(*))")
          .eq("user_id", user.id)
          .order("created_at"),
        supabase
          .from("exercise_logs")
          .select("*")
          .eq("user_id", user.id)
          .eq("date", today),
        calculateStreak(supabase, user.id),
        calculateAnalytics(supabase, user.id),
      ]);

    // Sort days and exercises by display_order
    const sortedPlans =
      (plans as WorkoutPlan[] | null)?.map((plan) => ({
        ...plan,
        days: (plan.days ?? [])
          .sort(
            (a: { display_order: number }, b: { display_order: number }) =>
              a.display_order - b.display_order,
          )
          .map((day: { exercises?: { display_order: number }[] }) => ({
            ...day,
            exercises: (day.exercises ?? []).sort(
              (a: { display_order: number }, b: { display_order: number }) =>
                a.display_order - b.display_order,
            ),
          })),
      })) ?? [];

    // Fetch previous logs for active plan exercises
    const activePlan =
      sortedPlans.find((p) => p.is_active) ?? sortedPlans[0] ?? null;
    const allExerciseIds =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activePlan?.days?.flatMap((day: any) =>
        (day.exercises ?? []).map((e: any) => e.id),
      ) ?? [];

    let previousLogs: Record<string, ExerciseLog> = {};
    if (allExerciseIds.length > 0) {
      const { data: prevLogData } = await supabase
        .from("exercise_logs")
        .select(
          "id, exercise_id, completed_sets, completed_reps, weight_used, time_spent, sets, date, exercise_snapshot",
        )
        .in("exercise_id", allExerciseIds)
        .eq("user_id", user.id)
        .lt("date", today)
        .order("date", { ascending: false });

      if (prevLogData) {
        for (const log of prevLogData) {
          if (log.exercise_id && !previousLogs[log.exercise_id]) {
            previousLogs[log.exercise_id] = log as unknown as ExerciseLog;
          }
        }
      }
    }

    return NextResponse.json({
      plans: sortedPlans,
      todayLogs: (todayLogs as ExerciseLog[]) ?? [],
      previousLogs,
      streak,
      analytics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
