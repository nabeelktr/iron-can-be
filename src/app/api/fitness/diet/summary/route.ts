import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// GET /api/fitness/diet/summary?date=YYYY-MM-DD — daily macro summary + adherence
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Get diet logs for the date
    const { data: logs, error: logsError } = await supabase
      .from("diet_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date);

    if (logsError)
      return NextResponse.json({ error: logsError.message }, { status: 500 });

    // Get active assignment and plan targets
    const { data: assignment } = await supabase
      .from("diet_plan_assignments")
      .select("*, plan:diet_plans(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    // Calculate totals from logged food
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    for (const log of logs ?? []) {
      if (log.is_consumed === false) continue;

      const snap = log.food_snapshot as {
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        fiber_g: number;
      };
      const qty = log.quantity || 1;
      totalCalories += (snap.calories || 0) * qty;
      totalProtein += (snap.protein_g || 0) * qty;
      totalCarbs += (snap.carbs_g || 0) * qty;
      totalFat += (snap.fat_g || 0) * qty;
      totalFiber += (snap.fiber_g || 0) * qty;
    }

    // Calculate adherence: how many planned items the user has logged
    let plannedItems = 0;
    let loggedPlannedItems = 0;

    if (assignment?.plan) {
      // Determine which day in the rotation this date falls on
      const startDate = new Date(assignment.start_date);
      const currentDate = new Date(date);
      const daysDiff = Math.floor(
        (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const numDays = assignment.plan.num_days || 7;
      const dayNumber = (((daysDiff % numDays) + numDays) % numDays) + 1;

      // Get the planned meals for this day
      const { data: dayData } = await supabase
        .from("diet_plan_days")
        .select(
          `*, meals:diet_plan_meals(*, items:diet_plan_meal_items(*))`,
        )
        .eq("plan_id", assignment.plan_id)
        .eq("day_number", dayNumber)
        .maybeSingle();

      if (dayData) {
        for (const meal of dayData.meals ?? []) {
          for (const item of meal.items ?? []) {
            plannedItems++;
            // Check if user has logged this specific food for this meal type
            const logged = (logs ?? []).find(
              (log: { food_id: string | null; meal_type: string; is_planned: boolean; is_consumed: boolean }) =>
                log.food_id === item.food_id &&
                log.meal_type === meal.meal_type &&
                log.is_planned === true &&
                log.is_consumed !== false,
            );
            if (logged) loggedPlannedItems++;
          }
        }
      }
    }

    const adherencePercentage =
      plannedItems > 0 ? Math.round((loggedPlannedItems / plannedItems) * 100) : 0;

    return NextResponse.json({
      date,
      total_calories: Math.round(totalCalories * 100) / 100,
      total_protein: Math.round(totalProtein * 100) / 100,
      total_carbs: Math.round(totalCarbs * 100) / 100,
      total_fat: Math.round(totalFat * 100) / 100,
      total_fiber: Math.round(totalFiber * 100) / 100,
      target_calories: assignment?.plan?.target_calories ?? null,
      target_protein: assignment?.plan?.target_protein ?? null,
      target_carbs: assignment?.plan?.target_carbs ?? null,
      target_fat: assignment?.plan?.target_fat ?? null,
      planned_items: plannedItems,
      logged_planned_items: loggedPlannedItems,
      adherence_percentage: adherencePercentage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
