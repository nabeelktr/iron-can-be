import { createHmac, timingSafeEqual } from "crypto";

/**
 * Razorpay integration helpers.
 *
 * The app launches Razorpay's native checkout with an order created here, then
 * sends back the payment id / order id / signature, which we verify against our
 * key secret. The secret never leaves the server; only the (publishable) key id
 * is handed to the client.
 */

export function getRazorpayKeyId(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  if (!id) throw new Error("RAZORPAY_KEY_ID is not configured");
  return id;
}

function getRazorpayKeySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET is not configured");
  return secret;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

/**
 * Create a Razorpay order via the REST API (no SDK dependency).
 * @param amountPaise amount in the smallest currency unit (paise for INR)
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const auth = Buffer.from(
    `${getRazorpayKeyId()}:${getRazorpayKeySecret()}`,
  ).toString("base64");

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Razorpay order creation failed (${res.status}): ${detail}`);
  }

  return (await res.json()) as RazorpayOrder;
}

/**
 * Verify the checkout signature returned by Razorpay.
 * `HMAC_SHA256(order_id + "|" + payment_id, key_secret) === signature`.
 */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string | null | undefined;
}): boolean {
  if (!params.razorpaySignature) return false;

  const expected = createHmac("sha256", getRazorpayKeySecret())
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(params.razorpaySignature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
