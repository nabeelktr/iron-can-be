import type {
  ExerciseLog,
  ExerciseSet,
  DayActivity,
  PersonalBest,
  MuscleGroupVolume,
  MuscleGroup,
  AnalyticsData,
  WorkoutSession,
} from "@/types/fitness";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Calculate current and longest streak for a user */
export async function calculateStreak(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ current: number; longest: number }> {
  const { data: logs } = await supabase
    .from("exercise_logs")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (!logs || logs.length === 0) return { current: 0, longest: 0 };

  const uniqueDates = [...new Set(logs.map((l) => l.date))].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  let current = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStr = today.toISOString().split("T")[0];
  let startOffset = 0;
  if (uniqueDates[0] !== todayStr) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (uniqueDates[0] === yesterday.toISOString().split("T")[0]) {
      startOffset = 1;
    }
  }

  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - (i + startOffset));
    const expectedStr = expected.toISOString().split("T")[0];

    if (uniqueDates[i] === expectedStr) {
      current++;
    } else {
      break;
    }
  }

  let longest = 1;
  let tempStreak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (Math.round(diffDays) === 1) {
      tempStreak++;
      longest = Math.max(longest, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  return { current, longest };
}

/** Calculate full analytics dashboard data for a user */
export async function calculateAnalytics(
  supabase: SupabaseClient,
  userId: string,
): Promise<AnalyticsData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr30 = thirtyDaysAgo.toISOString().split("T")[0];

  const [{ data: logs }, { data: sessions }, streakData] = await Promise.all([
    supabase
      .from("exercise_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("date", dateStr30)
      .order("date", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("started_at", thirtyDaysAgo.toISOString())
      .order("started_at", { ascending: false }),
    calculateStreak(supabase, userId),
  ]);

  const allLogs = (logs as ExerciseLog[]) ?? [];
  const allSessions = (sessions as WorkoutSession[]) ?? [];

  // Weekly activity (last 7 days)
  const weeklyActivity: DayActivity[] = Array.from({ length: 7 })
    .map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLogs = allLogs.filter((l) => l.date === dateStr);
      const volume = dayLogs.reduce((acc, log) => {
        const sets = log.sets || [];
        return (
          acc +
          (sets.length > 0
            ? sets.reduce(
                (sAcc: number, s: ExerciseSet) =>
                  sAcc + s.reps * (s.weight || 0),
                0,
              )
            : log.completed_sets * log.completed_reps * (log.weight_used || 0))
        );
      }, 0);
      return {
        date: dateStr,
        count: dayLogs.length,
        volume,
        label: d.toLocaleDateString([], { weekday: "short" }),
      };
    })
    .reverse();

  // Monthly activity (last 30 days)
  const monthlyActivity: DayActivity[] = Array.from({ length: 30 })
    .map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLogs = allLogs.filter((l) => l.date === dateStr);
      return {
        date: dateStr,
        count: dayLogs.length,
        volume: 0,
        label: d.getDate().toString(),
      };
    })
    .reverse();

  // Personal bests
  const pbMap: Record<string, PersonalBest> = {};
  allLogs.forEach((log) => {
    const name = log.exercise_snapshot?.name;
    if (!name) return;
    const w = log.weight_used || 0;
    const r = log.completed_reps || 0;
    if (!pbMap[name] || w > pbMap[name].weight) {
      pbMap[name] = { exerciseName: name, weight: w, reps: r, date: log.date };
    }
  });
  const personalBests = Object.values(pbMap)
    .filter((pb) => pb.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  // Muscle group volume
  const muscleMap: Record<string, MuscleGroupVolume> = {};
  allLogs.forEach((log) => {
    const muscle = (log.exercise_snapshot?.muscle_group ||
      "other") as MuscleGroup;
    if (!muscleMap[muscle]) {
      muscleMap[muscle] = { muscle, volume: 0, sets: 0, lastWorked: null };
    }
    const sets = log.sets || [];
    const vol =
      sets.length > 0
        ? sets.reduce(
            (acc: number, s: ExerciseSet) => acc + s.reps * (s.weight || 0),
            0,
          )
        : log.completed_sets * log.completed_reps * (log.weight_used || 0);
    muscleMap[muscle].volume += vol;
    muscleMap[muscle].sets += log.completed_sets || sets.length;
    if (
      !muscleMap[muscle].lastWorked ||
      log.date > muscleMap[muscle].lastWorked!
    ) {
      muscleMap[muscle].lastWorked = log.date;
    }
  });
  const muscleGroupVolume = Object.values(muscleMap).sort(
    (a, b) => b.volume - a.volume,
  );

  // Totals
  const totalWorkouts30d = new Set(allLogs.map((l) => l.date)).size;
  const totalVolume30d = allLogs.reduce((acc, log) => {
    const sets = log.sets || [];
    return (
      acc +
      (sets.length > 0
        ? sets.reduce(
            (sAcc: number, s: ExerciseSet) => sAcc + s.reps * (s.weight || 0),
            0,
          )
        : log.completed_sets * log.completed_reps * (log.weight_used || 0))
    );
  }, 0);

  const completedSessions = allSessions.filter(
    (s) => s.duration_seconds && s.duration_seconds >= 300,
  );
  const avgSessionDuration =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce(
            (acc, s) => acc + (s.duration_seconds || 0),
            0,
          ) / completedSessions.length,
        )
      : 0;

  return {
    recentLogs: allLogs,
    personalBests,
    weeklyActivity,
    monthlyActivity,
    muscleGroupVolume,
    recentSessions: allSessions,
    totalWorkouts30d,
    totalVolume30d,
    avgSessionDuration,
    currentStreak: streakData.current,
    longestStreak: streakData.longest,
  };
}
