import { NextResponse, type NextRequest } from "next/server";
import {
  requireTrainerAPI,
  isTrainerError,
} from "@/lib/auth/require-trainer-api";

// Flag rules (shared with alerts endpoint)
const NO_LOG_DAYS_THRESHOLD = 3;
const LOW_ADHERENCE_THRESHOLD = 50;

export type ClientFlag = "no_log" | "low_adherence" | null;

interface ClientRow {
  user_id: string;
  display_name: string | null;
  email: string;
  status: string;
  joined_at: string | null;
  active_plan: {
    id: string;
    name: string;
    num_days: number;
    start_date: string;
    target_calories: number | null;
  } | null;
  last_log_date: string | null;
  days_since_last_log: number | null;
  adherence_7d: number | null;
  flag: ClientFlag;
}

interface PlanForAdherence {
  num_days: number;
  target_calories: number | null;
}

interface AssignmentForAdherence {
  id: string;
  plan_id: string;
  start_date: string;
  plan: PlanForAdherence | null;
}

interface DietLogRow {
  date: string;
  food_id: string | null;
  meal_type: string;
  is_planned: boolean;
}

// GET /api/trainer/clients — list joined clients with per-user adherence metrics.
// Powers the trainer clients list and alerts banner.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireTrainerAPI(request);
    if (isTrainerError(auth)) return auth;
    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const flagFilter = searchParams.get("flag") as ClientFlag;
    const sort = searchParams.get("sort") || "recent";

    // 1. Get trainer's joined clients
    const { data: relationships, error: relError } = await supabase
      .from("trainer_users")
      .select("user_id, status, joined_at")
      .eq("trainer_id", profile.id)
      .eq("status", "joined");

    if (relError)
      return NextResponse.json({ error: relError.message }, { status: 500 });

    const userIds = (relationships ?? [])
      .map((r) => r.user_id as string)
      .filter(Boolean);

    if (userIds.length === 0) {
      return NextResponse.json({ clients: [], total: 0 });
    }

    // Fetch user profiles for these users
    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, email")
      .in("user_id", userIds);

    if (profileError)
      return NextResponse.json({ error: profileError.message }, { status: 500 });

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p])
    );

    const todayIso = new Date().toISOString().split("T")[0];
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString().split("T")[0];

    // 2. Active assignments for these users
    const { data: assignments } = await supabase
      .from("diet_plan_assignments")
      .select("id, user_id, plan_id, start_date, plan:diet_plans(id, name, num_days, target_calories)")
      .in("user_id", userIds)
      .eq("status", "active");

    const assignmentByUser = new Map<string, AssignmentForAdherence & { plan: PlanForAdherence & { id: string; name: string } | null }>();
    for (const a of (assignments ?? []) as unknown as Array<{
      id: string; user_id: string; plan_id: string; start_date: string;
      plan: (PlanForAdherence & { id: string; name: string }) | null;
    }>) {
      assignmentByUser.set(a.user_id, a);
    }

    // 3. Pull 7 days of diet logs for these users (small payload; logs are sparse)
    const { data: logs } = await supabase
      .from("diet_logs")
      .select("user_id, date, food_id, meal_type, is_planned")
      .in("user_id", userIds)
      .gte("date", sinceIso);

    const logsByUser = new Map<string, DietLogRow[]>();
    for (const log of (logs ?? []) as Array<DietLogRow & { user_id: string }>) {
      const arr = logsByUser.get(log.user_id) ?? [];
      arr.push(log);
      logsByUser.set(log.user_id, arr);
    }

    // 4. Preload plan day details for users with an active plan (batched)
    const planIds = [
      ...new Set([...assignmentByUser.values()].map((a) => a.plan_id)),
    ];
    let planDayMap = new Map<
      string,
      Array<{
        day_number: number;
        meals: Array<{
          meal_type: string;
          items: Array<{ food_id: string }>;
        }>;
      }>
    >();

    if (planIds.length > 0) {
      const { data: planDays } = await supabase
        .from("diet_plan_days")
        .select("plan_id, day_number, meals:diet_plan_meals(meal_type, items:diet_plan_meal_items(food_id))")
        .in("plan_id", planIds);

      for (const d of (planDays ?? []) as Array<{
        plan_id: string;
        day_number: number;
        meals: Array<{ meal_type: string; items: Array<{ food_id: string }> }>;
      }>) {
        const arr = planDayMap.get(d.plan_id) ?? [];
        arr.push({ day_number: d.day_number, meals: d.meals ?? [] });
        planDayMap.set(d.plan_id, arr);
      }
    }

    // 5. Compute per-user metrics
    const clients: ClientRow[] = [];
    for (const rel of relationships ?? []) {
      const userId = rel.user_id as string;
      const userProfile = profileMap.get(userId);
      const assignment = assignmentByUser.get(userId) ?? null;
      const userLogs = logsByUser.get(userId) ?? [];

      // Last log date
      let lastLogDate: string | null = null;
      let daysSinceLastLog: number | null = null;
      if (userLogs.length > 0) {
        lastLogDate = userLogs
          .map((l) => l.date)
          .sort()
          .pop()!;
        const diffMs =
          new Date(todayIso).getTime() - new Date(lastLogDate).getTime();
        daysSinceLastLog = Math.max(0, Math.floor(diffMs / 86400000));
      }

      // 7-day adherence (avg across last 7 calendar days)
      let adherence7d: number | null = null;
      if (assignment?.plan) {
        const numDays = assignment.plan.num_days || 7;
        const startDate = new Date(assignment.start_date + "T00:00:00");
        const planDays = planDayMap.get(assignment.plan_id) ?? [];

        let sumAdherence = 0;
        let countedDays = 0;
        for (let offset = 0; offset < 7; offset++) {
          const d = new Date();
          d.setDate(d.getDate() - offset);
          const dateStr = d.toISOString().split("T")[0];
          if (dateStr < assignment.start_date) continue; // before plan started

          const daysDiff = Math.floor(
            (d.getTime() - startDate.getTime()) / 86400000,
          );
          const dayNum = ((daysDiff % numDays) + numDays) % numDays + 1;
          const planDay = planDays.find((pd) => pd.day_number === dayNum);
          if (!planDay) continue;

          let plannedItems = 0;
          let loggedPlanned = 0;
          const dayLogs = userLogs.filter((l) => l.date === dateStr);

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
            sumAdherence += (loggedPlanned / plannedItems) * 100;
            countedDays++;
          }
        }

        if (countedDays > 0) {
          adherence7d = Math.round(sumAdherence / countedDays);
        }
      }

      // Flag logic
      let flag: ClientFlag = null;
      if (daysSinceLastLog !== null && daysSinceLastLog >= NO_LOG_DAYS_THRESHOLD) {
        flag = "no_log";
      } else if (
        assignment?.plan &&
        adherence7d !== null &&
        adherence7d < LOW_ADHERENCE_THRESHOLD
      ) {
        flag = "low_adherence";
      }

      clients.push({
        user_id: userId,
        display_name: userProfile?.display_name ?? null,
        email: userProfile?.email ?? "",
        status: rel.status as string,
        joined_at: (rel as { joined_at?: string | null }).joined_at ?? null,
        active_plan: assignment?.plan
          ? {
              id: assignment.plan.id,
              name: assignment.plan.name,
              num_days: assignment.plan.num_days,
              start_date: assignment.start_date,
              target_calories: assignment.plan.target_calories ?? null,
            }
          : null,
        last_log_date: lastLogDate,
        days_since_last_log: daysSinceLastLog,
        adherence_7d: adherence7d,
        flag,
      });
    }

    // 6. Filter + sort
    let filtered = clients;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.display_name?.toLowerCase().includes(s) ||
          c.email.toLowerCase().includes(s),
      );
    }
    if (flagFilter) {
      filtered = filtered.filter((c) => c.flag === flagFilter);
    }

    filtered.sort((a, b) => {
      if (sort === "adherence") {
        return (b.adherence_7d ?? -1) - (a.adherence_7d ?? -1);
      }
      if (sort === "adherence_asc") {
        return (a.adherence_7d ?? 999) - (b.adherence_7d ?? 999);
      }
      if (sort === "at_risk") {
        // no_log > low_adherence > no flag
        const rank = (f: ClientFlag) =>
          f === "no_log" ? 0 : f === "low_adherence" ? 1 : 2;
        return rank(a.flag) - rank(b.flag);
      }
      // recent (default): most recently logged first, nulls last
      if (!a.last_log_date && !b.last_log_date) return 0;
      if (!a.last_log_date) return 1;
      if (!b.last_log_date) return -1;
      return b.last_log_date.localeCompare(a.last_log_date);
    });

    return NextResponse.json({
      clients: filtered,
      total: filtered.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

