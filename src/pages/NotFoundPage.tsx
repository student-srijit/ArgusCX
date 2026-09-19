import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
        padding: 24,
      }}
    >
      <p className="label">404</p>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>This page isn&apos;t live yet.</h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: 420 }}>
        This part of the ArgusCX workspace is still being migrated to the new runtime.
      </p>
      <Link className="btn-primary" to="/dashboard">Back to dashboard</Link>
    </main>
  );
}
