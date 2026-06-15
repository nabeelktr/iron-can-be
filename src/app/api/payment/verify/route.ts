import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";
import { verifyRazorpaySignature } from "@/lib/razorpay";

// POST /api/payment/verify — verify a completed Razorpay payment and activate
// the subscription. Called by the app (authenticated) after the native
// checkout returns. Security rests on two checks:
//   1. The Razorpay signature (HMAC with our key secret) is valid.
//   2. The order belongs to the authenticated user.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;

    const body = await request.json();
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

    if (!razorpay_payment_id || !razorpay_order_id) {
      return NextResponse.json(
        { error: "razorpay_payment_id and razorpay_order_id are required" },
        { status: 400 },
      );
    }

    if (
      !verifyRazorpaySignature({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      })
    ) {
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 401 },
      );
    }

    // Resolve our payment record from the Razorpay order id.
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", razorpay_order_id)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // The order must belong to the caller.
    if (payment.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (payment.status === "completed") {
      return NextResponse.json({
        success: true,
        tier: payment.tier,
        message: "Payment already completed",
      });
    }

    const now = new Date().toISOString();

    // Mark payment as completed
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "completed",
        transaction_id: razorpay_payment_id,
        updated_at: now,
      })
      .eq("id", payment.id);

    if (updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 });

    // Update user's subscription tier and status
    await supabase
      .from("user_profiles")
      .update({
        subscription_tier: payment.tier,
        subscription_status: "active",
        subscription_started_at: now,
        subscription_ends_at: payment.billing_period_end,
        updated_at: now,
      })
      .eq("user_id", payment.user_id);

    // Upsert subscription record
    await supabase.from("subscriptions").upsert(
      {
        user_id: payment.user_id,
        tier: payment.tier,
        status: "active",
        billing_cycle_start: payment.billing_period_start,
        billing_cycle_end: payment.billing_period_end,
        auto_renew: true,
      },
      { onConflict: "user_id" },
    );

    return NextResponse.json({
      success: true,
      tier: payment.tier,
      message: `Subscription activated: ${payment.tier}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
