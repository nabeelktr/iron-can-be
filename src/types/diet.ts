// ─── User Profile ────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";
export type UserStatus = "pending" | "approved" | "rejected";
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extra_active";
export type FitnessGoal =
  | "lose_weight"
  | "maintain"
  | "build_muscle"
  | "improve_endurance"
  | "general_fitness";

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  gender: Gender | null;
  activity_level: ActivityLevel | null;
  fitness_goal: FitnessGoal | null;
  dietary_preferences: string[] | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Meal Types ──────────────────────────────────────────────────────────────

export type MealType =
  | "early_morning"
  | "breakfast"
  | "mid_morning_snack"
  | "lunch"
  | "evening_snack"
  | "dinner"
  | "bedtime";

export type DietLogMealType = MealType | "other";

export type AssignmentStatus = "active" | "paused" | "completed" | "cancelled";

// ─── Food Database ───────────────────────────────────────────────────────────

export interface Food {
  id: string;
  created_by: string;
  name: string;
  brand: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Diet Plan Templates ─────────────────────────────────────────────────────

export interface DietPlan {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  num_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  days?: DietPlanDay[];
}

export interface DietPlanDay {
  id: string;
  plan_id: string;
  day_number: number;
  name: string | null;
  display_order: number;
  created_at: string;
  meals?: DietPlanMeal[];
}

export interface DietPlanMeal {
  id: string;
  day_id: string;
  meal_type: MealType;
  display_order: number;
  notes: string | null;
  created_at: string;
  items?: DietPlanMealItem[];
}

export interface DietPlanMealItem {
  id: string;
  meal_id: string;
  food_id: string;
  quantity: number;
  serving_unit: string | null;
  notes: string | null;
  display_order: number;
  created_at: string;
  food?: Food;
}

// ─── Plan Assignment ─────────────────────────────────────────────────────────

export interface DietPlanAssignment {
  id: string;
  user_id: string;
  plan_id: string;
  assigned_by: string;
  start_date: string;
  end_date: string | null;
  status: AssignmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan?: DietPlan;
}

// ─── Diet Logging ────────────────────────────────────────────────────────────

export interface FoodSnapshot {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
}

export interface DietLog {
  id: string;
  user_id: string;
  assignment_id: string | null;
  date: string;
  meal_type: DietLogMealType;
  food_id: string | null;
  food_snapshot: FoodSnapshot;
  quantity: number;
  serving_unit: string | null;
  is_planned: boolean;
  notes: string | null;
  created_at: string;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface DailyMacroSummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  planned_items: number;
  logged_planned_items: number;
  adherence_percentage: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const MEAL_TYPE_CONFIG: Record<MealType, { label: string; order: number }> = {
  early_morning: { label: "Early Morning", order: 0 },
  breakfast: { label: "Breakfast", order: 1 },
  mid_morning_snack: { label: "Mid-Morning Snack", order: 2 },
  lunch: { label: "Lunch", order: 3 },
  evening_snack: { label: "Evening Snack", order: 4 },
  dinner: { label: "Dinner", order: 5 },
  bedtime: { label: "Bedtime", order: 6 },
};

export const SERVING_UNITS = [
  "g", "ml", "piece", "cup", "tbsp", "tsp", "scoop",
  "slice", "bowl", "plate", "oz", "handful",
] as const;
