import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay";

// POST /api/payment/order — create a Razorpay order for an in-app subscription
// purchase. The app opens Razorpay's native checkout with the returned order.
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
    const currency = "INR";

    // Get user profile (for checkout prefill)
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
        currency,
        tier,
        billing_period_start: now.toISOString().split("T")[0],
        billing_period_end: billingEnd.toISOString().split("T")[0],
        payment_gateway: "razorpay",
        status: "pending",
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Create the matching Razorpay order and persist its id on the payment row.
    let order;
    try {
      order = await createRazorpayOrder({
        amountPaise: amount_paise,
        currency,
        receipt: payment.id,
        notes: { user_id: user.id, tier },
      });
    } catch (e) {
      // Roll back the dangling pending payment if Razorpay rejected the order.
      await supabase.from("payments").delete().eq("id", payment.id);
      const message = e instanceof Error ? e.message : "Razorpay error";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    await supabase
      .from("payments")
      .update({ order_id: order.id })
      .eq("id", payment.id);

    return NextResponse.json({
      payment_id: payment.id,
      razorpay_order_id: order.id,
      razorpay_key_id: getRazorpayKeyId(),
      amount_paise,
      currency,
      tier,
      name: profile?.display_name || "",
      email: profile?.email || "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
