export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#0a0a0a",
        color: "#fff",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#f97316" }}>
        Iron Can API
      </h1>
      <p style={{ color: "#888", marginTop: 8 }}>
        Fitness tracker backend service
      </p>
      <code
        style={{
          marginTop: 24,
          padding: "8px 16px",
          borderRadius: 8,
          backgroundColor: "#141414",
          border: "1px solid #222",
          fontSize: 14,
          color: "#888",
        }}
      >
        GET /api/health
      </code>
    </div>
  );
}
