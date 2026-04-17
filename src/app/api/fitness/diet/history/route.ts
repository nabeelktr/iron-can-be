import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

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

// GET /api/fitness/diet/history?days=30 — the logged-in user's daily diet summaries.
// Mirrors the trainer client-overview endpoint but scoped to the authenticated user.
// Feeds the WeekStrip adherence dots, trend charts, and any future stats section.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      90,
      Math.max(1, parseInt(searchParams.get("days") || "30") || 30),
    );

    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - (days - 1));
    const sinceIso = start.toISOString().split("T")[0];
    const todayIso = today.toISOString().split("T")[0];

    const [assignmentResult, logsResult] = await Promise.all([
      supabase
        .from("diet_plan_assignments")
        .select("id, plan_id, start_date, plan:diet_plans(id, num_days)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("diet_logs")
        .select("date, food_id, meal_type, is_planned, quantity, food_snapshot")
        .eq("user_id", user.id)
        .gte("date", sinceIso)
        .order("date"),
    ]);

    const assignment = assignmentResult.data as
      | {
          id: string;
          plan_id: string;
          start_date: string;
          plan: { id: string; num_days: number } | null;
        }
      | null;
    const logs = (logsResult.data ?? []) as DietLogRow[];

    // Preload plan day structure if assigned
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

    // Group logs by date
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

      let plannedItems = 0;
      let loggedPlanned = 0;
      let adherencePct: number | null = null;
      if (
        assignment?.plan &&
        dateStr >= assignment.start_date &&
        dateStr <= todayIso
      ) {
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

    return NextResponse.json({
      period_days: days,
      daily,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
