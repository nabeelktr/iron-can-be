"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const tier = searchParams.get("tier");
  const amount = searchParams.get("amount");
  const email = searchParams.get("email");
  const name = searchParams.get("name");

  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountDisplay = amount ? (parseInt(amount) / 100).toFixed(0) : "0";
  const tierLabel = tier === "premium" ? "Premium" : "Basic";

  const handlePay = async () => {
    if (!paymentId) return;
    setProcessing(true);
    setError(null);

    try {
      // TODO: Replace with Razorpay SDK integration
      // For now, directly verify the payment (simulates successful payment)
      const res = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: paymentId,
          transaction_id: `web_${Date.now()}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Payment failed");
        return;
      }

      setDone(true);

      // Redirect back to app via deep link after short delay
      setTimeout(() => {
        window.location.href = `ironcan://payment-callback?status=success&payment_id=${paymentId}&tier=${tier}`;
      }, 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (!paymentId || !tier) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.errorTitle}>Invalid Checkout</h2>
          <p style={styles.errorText}>Missing payment details.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>&#10003;</div>
          <h2 style={styles.successTitle}>Payment Successful!</h2>
          <p style={styles.successText}>
            Your {tierLabel} subscription is now active.
          </p>
          <p style={styles.redirectText}>Redirecting back to app...</p>
          <a href={`ironcan://payment-callback?status=success&payment_id=${paymentId}&tier=${tier}`} style={styles.link}>
            Open App
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>Iron Can</div>
        <h2 style={styles.title}>Checkout</h2>

        <div style={styles.orderSummary}>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Plan</span>
            <span style={styles.summaryValue}>{tierLabel}</span>
          </div>
          <div style={styles.summaryRow}>
            <span style={styles.summaryLabel}>Billing</span>
            <span style={styles.summaryValue}>Monthly</span>
          </div>
          {name && (
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>Name</span>
              <span style={styles.summaryValue}>{name}</span>
            </div>
          )}
          {email && (
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>Email</span>
              <span style={styles.summaryValue}>{email}</span>
            </div>
          )}
          <div style={styles.divider} />
          <div style={styles.summaryRow}>
            <span style={styles.totalLabel}>Total</span>
            <span style={styles.totalValue}>{"\u20B9"}{amountDisplay}/month</span>
          </div>
        </div>

        {error && <p style={styles.errorText}>{error}</p>}

        <button
          onClick={handlePay}
          disabled={processing}
          style={{
            ...styles.payButton,
            opacity: processing ? 0.6 : 1,
            cursor: processing ? "not-allowed" : "pointer",
          }}
        >
          {processing ? "Processing..." : `Pay \u20B9${amountDisplay}`}
        </button>

        <p style={styles.secureText}>
          Payments are secure and encrypted
        </p>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={{ color: "#888" }}>Loading checkout...</p>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: "#0a0a0a",
    padding: 16,
  },
  card: {
    backgroundColor: "#141414",
    borderRadius: 16,
    padding: 32,
    maxWidth: 420,
    width: "100%",
    border: "1px solid #222",
  },
  logo: {
    fontSize: 14,
    fontWeight: 800,
    color: "#22c55e",
    textTransform: "uppercase" as const,
    letterSpacing: 2,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 24,
    marginTop: 0,
  },
  orderSummary: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 8,
  },
  summaryLabel: {
    color: "#888",
    fontSize: 14,
  },
  summaryValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginTop: 8,
    marginBottom: 8,
  },
  totalLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
  },
  totalValue: {
    color: "#22c55e",
    fontSize: 18,
    fontWeight: 700,
  },
  payButton: {
    width: "100%",
    padding: 16,
    backgroundColor: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
  },
  secureText: {
    color: "#555",
    fontSize: 12,
    textAlign: "center" as const,
  },
  successIcon: {
    fontSize: 48,
    color: "#22c55e",
    textAlign: "center" as const,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#fff",
    textAlign: "center" as const,
    marginBottom: 8,
  },
  successText: {
    color: "#aaa",
    textAlign: "center" as const,
    marginBottom: 16,
  },
  redirectText: {
    color: "#555",
    fontSize: 13,
    textAlign: "center" as const,
    marginBottom: 12,
  },
  link: {
    display: "block",
    textAlign: "center" as const,
    color: "#22c55e",
    fontWeight: 600,
    textDecoration: "none",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#ef4444",
    marginBottom: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center" as const,
  },
};
