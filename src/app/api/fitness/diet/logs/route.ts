import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
  household_units?:
    | Array<{ label: string; grams: number; default?: boolean }>
    | null;
}

interface MealItemRow {
  id: string;
  food_id: string;
  quantity: number;
  serving_unit: string | null;
}

// Snapshot rule (single source of truth for diet_logs):
//   food_snapshot macros are for ONE `serving_unit` (= serving_size grams).
//   diet_logs.quantity is the multiplier. Summary = snap × quantity.
//
// To get per-1-unit macros from a foods row (which stores per-`food.serving_size`
// macros — typically per-100g): scale by (unit_grams / food.serving_size).
function scaleSnapshot(
  food: FoodRow,
  unitGrams: number,
  unitLabel: string,
): {
  name: string;
  brand: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
} {
  const base = food.serving_size > 0 ? food.serving_size : 100;
  const m = unitGrams / base;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    name: food.name,
    brand: food.brand ?? null,
    calories: Math.round(food.calories * m),
    protein_g: round1(food.protein_g * m),
    carbs_g: round1(food.carbs_g * m),
    fat_g: round1(food.fat_g * m),
    fiber_g: round1(food.fiber_g * m),
    serving_size: unitGrams,
    serving_unit: unitLabel,
  };
}

function dayNumberFor(startDate: string, date: string, numDays: number): number {
  const start = new Date(startDate + "T00:00:00");
  const cur = new Date(date + "T00:00:00");
  const diff = Math.floor(
    (cur.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return (((diff % numDays) + numDays) % numDays) + 1;
}

// GET /api/fitness/diet/logs?date=YYYY-MM-DD
//
// Lazily materializes planned logs for an active assignment on the *requested*
// date so the client can show planned rows as pre-logged-but-unconfirmed
// (is_consumed=false). Materialization is idempotent (skipped if any planned
// log already exists for the date) and only runs for today or future dates so
// historical days aren't retroactively populated.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    // Materialize planned logs for active assignment on today/future dates.
    if (date >= today) {
      try {
        const { data: assignment } = await supabase
          .from("diet_plan_assignments")
          .select("id, plan_id, start_date, status")
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (assignment) {
          const { data: existingPlanned } = await supabase
            .from("diet_logs")
            .select("id")
            .eq("user_id", user.id)
            .eq("date", date)
            .eq("is_planned", true)
            .limit(1);

          if (!existingPlanned || existingPlanned.length === 0) {
            const { data: plan } = await supabase
              .from("diet_plans")
              .select("num_days")
              .eq("id", assignment.plan_id)
              .single();
            const numDays = plan?.num_days || 7;
            const dayNumber = dayNumberFor(
              assignment.start_date,
              date,
              numDays,
            );

            const { data: dayData } = await supabase
              .from("diet_plan_days")
              .select(
                `id, meals:diet_plan_meals(
                  meal_type,
                  items:diet_plan_meal_items(
                    id, food_id, quantity, serving_unit,
                    food:foods(*)
                  )
                )`,
              )
              .eq("plan_id", assignment.plan_id)
              .eq("day_number", dayNumber)
              .maybeSingle();

            type DayMealItem = {
              id: string;
              food_id: string;
              quantity: number;
              serving_unit: string | null;
              food: FoodRow;
            };
            type DayMeal = { meal_type: string; items: DayMealItem[] };

            const meals = (dayData?.meals ?? []) as unknown as DayMeal[];
            const inserts: Array<{
              user_id: string;
              assignment_id: string;
              date: string;
              meal_type: string;
              food_id: string;
              food_snapshot: ReturnType<typeof scaleSnapshot>;
              quantity: number;
              serving_unit: string;
              is_planned: true;
              is_consumed: false;
              meal_item_id: string;
            }> = [];

            for (const meal of meals) {
              for (const item of meal.items ?? []) {
                if (!item.food) continue;
                const unitLabel =
                  item.serving_unit || item.food.serving_unit || "serving";
                const householdUnit = (item.food.household_units ?? []).find(
                  (u) => u.label === item.serving_unit,
                );
                const unitGrams = householdUnit?.grams
                  ?? item.food.serving_size
                  ?? 100;
                const snap = scaleSnapshot(item.food, unitGrams, unitLabel);
                inserts.push({
                  user_id: user.id,
                  assignment_id: assignment.id,
                  date,
                  meal_type: meal.meal_type,
                  food_id: item.food_id,
                  food_snapshot: snap,
                  quantity: item.quantity ?? 1,
                  serving_unit: unitLabel,
                  is_planned: true,
                  is_consumed: false,
                  meal_item_id: item.id,
                });
              }
            }

            if (inserts.length > 0) {
              await supabase.from("diet_logs").insert(inserts);
            }
          }
        }
      } catch {
        // Materialization is best-effort — never block the read.
      }
    }

    const { data: logs, error } = await supabase
      .from("diet_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("created_at");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(logs ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/fitness/diet/logs — create a diet log.
//
// Body:
//   { food_id, meal_type, quantity?, serving_unit?, serving_unit_grams?,
//     meal_item_id?, is_planned?, is_consumed?, notes?, date? }
//
// If `meal_item_id` is provided, server resolves unit info from the meal item.
// Else if `serving_unit_grams` is provided, it scales the snapshot accordingly.
// Else falls back to the food's own serving_size (typically 100g).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const {
      food_id,
      meal_type,
      quantity,
      serving_unit,
      serving_unit_grams,
      meal_item_id,
      notes,
      is_planned,
      is_consumed,
      date,
    } = body as {
      food_id?: string;
      meal_type?: string;
      quantity?: number;
      serving_unit?: string;
      serving_unit_grams?: number;
      meal_item_id?: string;
      notes?: string;
      is_planned?: boolean;
      is_consumed?: boolean;
      date?: string;
    };

    if (!food_id || !meal_type) {
      return NextResponse.json(
        { error: "food_id and meal_type are required" },
        { status: 400 },
      );
    }

    const { data: foodData, error: foodError } = await supabase
      .from("foods")
      .select("*")
      .eq("id", food_id)
      .single();

    if (foodError || !foodData) {
      return NextResponse.json({ error: "Food not found" }, { status: 404 });
    }
    const food = foodData as FoodRow;

    let resolvedUnitLabel = serving_unit ?? food.serving_unit ?? "serving";
    let resolvedUnitGrams = serving_unit_grams;

    if (meal_item_id) {
      const { data: itemData } = await supabase
        .from("diet_plan_meal_items")
        .select(`id, food_id, quantity, serving_unit`)
        .eq("id", meal_item_id)
        .maybeSingle();
      const item = itemData as Pick<MealItemRow, "serving_unit"> | null;
      if (item) {
        resolvedUnitLabel = item.serving_unit ?? resolvedUnitLabel;
        if (resolvedUnitGrams == null) {
          const hh = (food.household_units ?? []).find(
            (u) => u.label === item.serving_unit,
          );
          resolvedUnitGrams = hh?.grams ?? food.serving_size ?? 100;
        }
      }
    }

    if (resolvedUnitGrams == null) {
      const hh = (food.household_units ?? []).find(
        (u) => u.label === resolvedUnitLabel,
      );
      resolvedUnitGrams = hh?.grams ?? food.serving_size ?? 100;
    }

    const foodSnapshot = scaleSnapshot(
      food,
      resolvedUnitGrams,
      resolvedUnitLabel,
    );

    let assignmentId: string | null = null;
    try {
      const { data: assignmentData } = await supabase
        .from("diet_plan_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      assignmentId = assignmentData?.id ?? null;
    } catch {
      // non-blocking
    }

    const { data, error } = await supabase
      .from("diet_logs")
      .insert({
        user_id: user.id,
        assignment_id: assignmentId,
        date: date || new Date().toISOString().split("T")[0],
        meal_type,
        food_id,
        food_snapshot: foodSnapshot,
        quantity: quantity ?? 1,
        serving_unit: resolvedUnitLabel,
        is_planned: is_planned ?? false,
        is_consumed: is_consumed ?? false,
        notes: notes ?? null,
        meal_item_id: meal_item_id ?? null,
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
