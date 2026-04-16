import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";

// POST /api/payment/order — create a payment order for subscription
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { tier } = body;

    if (!tier || !["basic", "premium"].includes(tier)) {
      return NextResponse.json(
        { error: "Invalid tier. Must be 'basic' or 'premium'" },
        { status: 400 },
      );
    }

    const amount_paise = tier === "premium" ? 20000 : 13000;

    // Get user profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("user_id", user.id)
      .single();

    // Create a pending payment record
    const now = new Date();
    const billingEnd = new Date(now);
    billingEnd.setMonth(billingEnd.getMonth() + 1);

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        amount_paise,
        currency: "INR",
        tier,
        billing_period_start: now.toISOString().split("T")[0],
        billing_period_end: billingEnd.toISOString().split("T")[0],
        payment_gateway: "website",
        status: "pending",
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Build checkout URL (hosted on this same Next.js app)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "https://iron-can-be.vercel.app";

    const checkoutParams = new URLSearchParams({
      payment_id: payment.id,
      tier,
      amount: String(amount_paise),
      email: profile?.email || "",
      name: profile?.display_name || "",
    });

    const checkout_url = `${baseUrl}/checkout?${checkoutParams.toString()}`;

    return NextResponse.json({
      payment_id: payment.id,
      checkout_url,
      amount_paise,
      tier,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
