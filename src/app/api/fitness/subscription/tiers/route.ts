import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

const TIERS = [
  {
    id: "basic",
    name: "Basic",
    price_paise: 13000,
    price_display: "130",
    currency: "INR",
    currency_symbol: "\u20B9",
    period: "month",
    features: [
      { id: "workout_tracking", name: "Workout Tracking", included: true },
      { id: "progress_analytics", name: "Progress Analytics", included: true },
      { id: "diet_tracking", name: "Diet Tracking", included: false },
      { id: "trainer_support", name: "Trainer Support", included: false },
      { id: "manual_diet_add", name: "Manual Diet Entry", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price_paise: 20000,
    price_display: "200",
    currency: "INR",
    currency_symbol: "\u20B9",
    period: "month",
    features: [
      { id: "workout_tracking", name: "Workout Tracking", included: true },
      { id: "progress_analytics", name: "Progress Analytics", included: true },
      { id: "diet_tracking", name: "Diet Tracking", included: true },
      { id: "trainer_support", name: "Trainer Support", included: true },
      { id: "manual_diet_add", name: "Manual Diet Entry", included: true },
    ],
  },
];

// GET /api/fitness/subscription/tiers — available subscription tiers
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;

    return NextResponse.json({ tiers: TIERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
