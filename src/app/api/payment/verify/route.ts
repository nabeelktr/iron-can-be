import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST /api/payment/verify — verify and complete a payment
// Called from the checkout page after payment is confirmed
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { payment_id, transaction_id } = body;

    if (!payment_id) {
      return NextResponse.json(
        { error: "payment_id is required" },
        { status: 400 },
      );
    }

    // Fetch the payment record
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 },
      );
    }

    if (payment.status === "completed") {
      return NextResponse.json(
        { error: "Payment already completed" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    // Mark payment as completed
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "completed",
        transaction_id: transaction_id || `manual_${Date.now()}`,
        updated_at: now,
      })
      .eq("id", payment_id);

    if (updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );

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
