import type {
  SubscriptionTier,
  SubscriptionStatus,
  TrainerStatus,
  TrainerUserStatus,
  UpgradeRequestStatus,
  PaymentStatus,
} from "./diet";

// ─── Trainer-User Relationship ──────────────────────────────────────────────

export interface TrainerUser {
  id: string;
  trainer_id: string;
  user_id: string;
  invited_at: string;
  joined_at: string | null;
  status: TrainerUserStatus;
  tier_assigned: SubscriptionTier;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Subscription ───────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: "active" | "paused" | "cancelled" | "expired";
  billing_cycle_start: string;
  billing_cycle_end: string;
  auto_renew: boolean;
  payment_method_id: string | null;
  razorpay_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Payment ────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  user_id: string;
  subscription_id: string | null;
  amount_paise: number;
  currency: string;
  tier: SubscriptionTier;
  billing_period_start: string;
  billing_period_end: string;
  payment_gateway: "razorpay" | "website";
  transaction_id: string | null;
  order_id: string | null;
  receipt_id: string | null;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Upgrade Request ────────────────────────────────────────────────────────

export interface UpgradeRequest {
  id: string;
  user_id: string;
  from_tier: "basic";
  to_tier: "premium";
  requested_trainer_id: string | null;
  trainer_approved: boolean | null;
  approval_notes: string | null;
  status: UpgradeRequestStatus;
  created_at: string;
  approved_at: string | null;
}
