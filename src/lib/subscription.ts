import { createHmac, timingSafeEqual } from "crypto";

/** Number of days before expiry that the client should start warning the user. */
export const EXPIRY_WARNING_DAYS = 7;

const DAY_MS = 86_400_000;

export type Tier = "basic" | "premium";

/** The subscription-relevant columns of a `user_profiles` row. */
export interface SubscriptionRow {
  subscription_tier: Tier | string | null;
  subscription_status: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
}

export interface SubscriptionState {
  /** Effective tier — `basic` once a premium subscription has lapsed. */
  tier: Tier;
  /** Effective status — `expired` once the end date has passed. */
  status: string;
  started_at: string | null;
  ends_at: string | null;
  /** Premium tier whose end date is in the past. */
  is_expired: boolean;
  /** Whether the user is entitled to premium features right now. */
  is_active: boolean;
  /** Whole days until access ends (null when not premium / no end date). */
  days_remaining: number | null;
  /** Active premium expiring within {@link EXPIRY_WARNING_DAYS}. */
  expiring_soon: boolean;
  /** Stored row still claims active premium but it has actually lapsed. */
  needs_downgrade: boolean;
}

/**
 * Derive the effective subscription state from a stored profile row.
 *
 * `subscription_ends_at` is stored as a date (`YYYY-MM-DD`); access is granted
 * through the end of that day, so the expiry boundary is the start of the
 * following day (UTC).
 */
export function computeSubscriptionState(
  row: SubscriptionRow,
  now: Date = new Date(),
): SubscriptionState {
  const tier: Tier = row.subscription_tier === "premium" ? "premium" : "basic";
  const status = row.subscription_status ?? "inactive";
  const endsAt = row.subscription_ends_at
    ? new Date(row.subscription_ends_at)
    : null;
  const boundaryMs =
    endsAt && !Number.isNaN(endsAt.getTime())
      ? endsAt.getTime() + DAY_MS
      : null;

  const isExpired =
    tier === "premium" && boundaryMs !== null && now.getTime() >= boundaryMs;

  let daysRemaining: number | null = null;
  if (tier === "premium" && boundaryMs !== null && !isExpired) {
    daysRemaining = Math.max(
      0,
      Math.ceil((boundaryMs - now.getTime()) / DAY_MS),
    );
  }

  const isActive = tier === "premium" && status !== "expired" && !isExpired;
  const expiringSoon =
    isActive &&
    daysRemaining !== null &&
    daysRemaining <= EXPIRY_WARNING_DAYS;

  const needsDowngrade = isExpired && status !== "expired";

  return {
    tier: isExpired ? "basic" : tier,
    status: isExpired ? "expired" : status,
    started_at: row.subscription_started_at,
    ends_at: row.subscription_ends_at,
    is_expired: isExpired,
    is_active: isActive,
    days_remaining: daysRemaining,
    expiring_soon: expiringSoon,
    needs_downgrade: needsDowngrade,
  };
}

/** Profile fields written back when a lapsed premium subscription is downgraded. */
export function downgradePatch(now: Date = new Date()) {
  return {
    subscription_tier: "basic" as const,
    subscription_status: "expired" as const,
    updated_at: now.toISOString(),
  };
}

// ─── Payment signing ─────────────────────────────────────────────────────────
//
// There is no real payment gateway wired up yet, so `/api/payment/verify` is
// callable from an unauthenticated browser (the externally-opened checkout
// page). To stop arbitrary callers from completing payments they did not
// initiate, the order endpoint signs the payment id with a server-only secret
// and the verify endpoint requires that signature back.

function signingSecret(): string {
  return (
    process.env.PAYMENT_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "ironcan-dev-payment-secret"
  );
}

/** HMAC-SHA256 of the payment id, used to authenticate verify calls. */
export function signPaymentId(paymentId: string): string {
  return createHmac("sha256", signingSecret()).update(paymentId).digest("hex");
}

/** Constant-time comparison of a presented signature against the expected one. */
export function verifyPaymentSignature(
  paymentId: string,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = signPaymentId(paymentId);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
