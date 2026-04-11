// ─── Core Entities ────────────────────────────────────────────────────────────

export interface WorkoutPlan {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  days?: WorkoutDay[];
}

export interface WorkoutDay {
  id: string;
  plan_id: string;
  user_id: string;
  name: string;
  display_order: number;
  created_at: string;
  exercises?: Exercise[];
}

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "core"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "cardio"
  | "full_body"
  | "other";

export type ExerciseCategory = "strength" | "cardio" | "flexibility" | "bodyweight" | "timed";

export interface Exercise {
  id: string;
  day_id: string;
  user_id: string;
  name: string;
  target_sets: number;
  target_reps: number;
  weight: number | null;
  time_seconds: number | null;
  rest_time: number | null;
  is_stepper: boolean;
  muscle_group: MuscleGroup;
  category: ExerciseCategory;
  notes: string | null;
  display_order: number;
  created_at: string;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export interface ExerciseSet {
  reps: number;
  weight: number | null;
  rest_time_taken: number | null;
  completed_at: string;
  rpe?: number; // rate of perceived exertion (1-10)
}

export interface ExerciseSnapshot {
  name: string;
  target_sets: number;
  target_reps: number;
  weight?: number;
  time_seconds?: number;
  rest_time?: number;
  muscle_group?: MuscleGroup;
  category?: ExerciseCategory;
  day_name: string;
  plan_name: string;
}

export interface ExerciseLog {
  id: string;
  exercise_id: string | null;
  user_id: string;
  date: string;
  exercise_snapshot: ExerciseSnapshot;
  completed_sets: number;
  completed_reps: number;
  weight_used: number | null;
  time_spent: number | null;
  sets: ExerciseSet[];
  notes: string | null;
  created_at: string;
}

// ─── Workout Sessions ─────────────────────────────────────────────────────────

export interface WorkoutSession {
  id: string;
  user_id: string;
  plan_id: string | null;
  day_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  total_volume: number;
  total_sets: number;
  notes: string | null;
  mood: number | null; // 1-5 rating
}

// ─── Analytics Types ──────────────────────────────────────────────────────────

export interface DayActivity {
  date: string;
  count: number;
  volume: number;
  label: string;
}

export interface ExerciseProgress {
  date: string;
  maxWeight: number;
  totalVolume: number;
  totalSets: number;
}

export interface MuscleGroupVolume {
  muscle: MuscleGroup;
  volume: number;
  sets: number;
  lastWorked: string | null;
}

export interface PersonalBest {
  exerciseName: string;
  weight: number;
  reps: number;
  date: string;
  isNew?: boolean;
}

export interface AnalyticsData {
  recentLogs: ExerciseLog[];
  personalBests: PersonalBest[];
  weeklyActivity: DayActivity[];
  monthlyActivity: DayActivity[];
  muscleGroupVolume: MuscleGroupVolume[];
  recentSessions: WorkoutSession[];
  totalWorkouts30d: number;
  totalVolume30d: number;
  avgSessionDuration: number;
  currentStreak: number;
  longestStreak: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  cardio: "Cardio",
  full_body: "Full Body",
  other: "Other",
};

export const MUSCLE_GROUP_EMOJI: Record<MuscleGroup, string> = {
  chest: "🫁",
  back: "🔙",
  shoulders: "💪",
  biceps: "💪",
  triceps: "💪",
  forearms: "🤲",
  core: "🎯",
  quads: "🦵",
  hamstrings: "🦵",
  glutes: "🍑",
  calves: "🦶",
  cardio: "❤️",
  full_body: "🏋️",
  other: "⚡",
};

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: "Strength",
  cardio: "Cardio",
  flexibility: "Flexibility",
  bodyweight: "Bodyweight",
  timed: "Timed",
};
