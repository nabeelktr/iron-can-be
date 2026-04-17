import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  planned_items: number;
  logged_planned_items: number;
  adherence_percentage: number | null;
  logs_count: number;
}

interface FoodSnap {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
}

interface DietLogRow {
  date: string;
  food_id: string | null;
  meal_type: string;
  is_planned: boolean;
  quantity: number;
  food_snapshot: FoodSnap | null;
}

interface PlanDayRow {
  day_number: number;
  meals: Array<{
    meal_type: string;
    items: Array<{ food_id: string }>;
  }>;
}

// GET /api/trainer/clients/[userId]/overview — per-client analytics for a trainer.
// Returns 30-day daily summaries (for heatmap + macro trends) + plan + profile.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;
    const { userId } = await params;

    // Verify the user is in this trainer's network
    const { data: relationship } = await supabase
      .from("trainer_users")
      .select("*")
      .eq("trainer_id", profile.id)
      .eq("user_id", userId)
      .single();
    if (!relationship) {
      return NextResponse.json(
        { error: "User not in your network" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      90,
      Math.max(7, parseInt(searchParams.get("days") || "30") || 30),
    );

    // Date range
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - (days - 1));
    const sinceIso = start.toISOString().split("T")[0];
    const todayIso = today.toISOString().split("T")[0];

    // Parallel fetches
    const [profileResult, assignmentResult, logsResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("user_id, display_name, email, height_cm, weight_kg, age, gender, fitness_goal")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("diet_plan_assignments")
        .select(
          "id, plan_id, start_date, end_date, status, plan:diet_plans(id, name, num_days, target_calories, target_protein, target_carbs, target_fat)",
        )
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("diet_logs")
        .select("date, food_id, meal_type, is_planned, quantity, food_snapshot")
        .eq("user_id", userId)
        .gte("date", sinceIso)
        .order("date"),
    ]);

    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const assignment = assignmentResult.data as
      | {
          id: string;
          plan_id: string;
          start_date: string;
          end_date: string | null;
          status: string;
          plan: {
            id: string;
            name: string;
            num_days: number;
            target_calories: number | null;
            target_protein: number | null;
            target_carbs: number | null;
            target_fat: number | null;
          } | null;
        }
      | null;

    const logs = (logsResult.data ?? []) as DietLogRow[];

    // Pre-fetch plan days if assignment exists (for adherence calc)
    let planDays: PlanDayRow[] = [];
    if (assignment?.plan) {
      const { data } = await supabase
        .from("diet_plan_days")
        .select(
          "day_number, meals:diet_plan_meals(meal_type, items:diet_plan_meal_items(food_id))",
        )
        .eq("plan_id", assignment.plan_id);
      planDays = (data ?? []) as PlanDayRow[];
    }

    const numDays = assignment?.plan?.num_days ?? 7;
    const startDateMs = assignment
      ? new Date(assignment.start_date + "T00:00:00").getTime()
      : 0;

    // Build a per-date summary
    const logsByDate = new Map<string, DietLogRow[]>();
    for (const log of logs) {
      const arr = logsByDate.get(log.date) ?? [];
      arr.push(log);
      logsByDate.set(log.date, arr);
    }

    const daily: DailySummary[] = [];
    for (let offset = 0; offset < days; offset++) {
      const d = new Date(start);
      d.setDate(start.getDate() + offset);
      const dateStr = d.toISOString().split("T")[0];
      const dayLogs = logsByDate.get(dateStr) ?? [];

      // Macro totals
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let totalFiber = 0;
      for (const log of dayLogs) {
        const snap = log.food_snapshot ?? {};
        const qty = log.quantity || 1;
        totalCalories += (snap.calories ?? 0) * qty;
        totalProtein += (snap.protein_g ?? 0) * qty;
        totalCarbs += (snap.carbs_g ?? 0) * qty;
        totalFat += (snap.fat_g ?? 0) * qty;
        totalFiber += (snap.fiber_g ?? 0) * qty;
      }

      // Adherence
      let plannedItems = 0;
      let loggedPlanned = 0;
      let adherencePct: number | null = null;
      if (assignment?.plan && dateStr >= assignment.start_date && dateStr <= todayIso) {
        const daysDiff = Math.floor((d.getTime() - startDateMs) / 86400000);
        const dayNum = ((daysDiff % numDays) + numDays) % numDays + 1;
        const planDay = planDays.find((pd) => pd.day_number === dayNum);
        if (planDay) {
          for (const meal of planDay.meals ?? []) {
            for (const item of meal.items ?? []) {
              plannedItems++;
              const logged = dayLogs.some(
                (l) =>
                  l.food_id === item.food_id &&
                  l.meal_type === meal.meal_type &&
                  l.is_planned === true,
              );
              if (logged) loggedPlanned++;
            }
          }
          if (plannedItems > 0) {
            adherencePct = Math.round((loggedPlanned / plannedItems) * 100);
          }
        }
      }

      daily.push({
        date: dateStr,
        total_calories: Math.round(totalCalories),
        total_protein: Math.round(totalProtein * 10) / 10,
        total_carbs: Math.round(totalCarbs * 10) / 10,
        total_fat: Math.round(totalFat * 10) / 10,
        total_fiber: Math.round(totalFiber * 10) / 10,
        planned_items: plannedItems,
        logged_planned_items: loggedPlanned,
        adherence_percentage: adherencePct,
        logs_count: dayLogs.length,
      });
    }

    // Aggregate averages
    const daysWithAdherence = daily.filter(
      (d) => d.adherence_percentage !== null,
    );
    const avgAdherence =
      daysWithAdherence.length > 0
        ? Math.round(
            daysWithAdherence.reduce(
              (s, d) => s + (d.adherence_percentage ?? 0),
              0,
            ) / daysWithAdherence.length,
          )
        : null;

    const daysWithLogs = daily.filter((d) => d.logs_count > 0);
    const avgCalories =
      daysWithLogs.length > 0
        ? Math.round(
            daysWithLogs.reduce((s, d) => s + d.total_calories, 0) /
              daysWithLogs.length,
          )
        : 0;
    const avgProtein =
      daysWithLogs.length > 0
        ? Math.round(
            (daysWithLogs.reduce((s, d) => s + d.total_protein, 0) /
              daysWithLogs.length) *
              10,
          ) / 10
        : 0;

    return NextResponse.json({
      user: profileResult.data,
      active_plan: assignment?.plan
        ? {
            ...assignment.plan,
            start_date: assignment.start_date,
            end_date: assignment.end_date,
          }
        : null,
      period_days: days,
      daily,
      summary: {
        logged_days: daysWithLogs.length,
        avg_adherence: avgAdherence,
        avg_calories: avgCalories,
        avg_protein: avgProtein,
        last_log_date:
          daysWithLogs.length > 0
            ? daysWithLogs[daysWithLogs.length - 1].date
            : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
