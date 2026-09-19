import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Activity, Plus } from "lucide-react";
import { getSessions, type VerificationSession } from "@/lib/api_cases";

const STATUS_TONES: Record<string, string> = {
  pending: "case-tone-neutral",
  in_progress: "case-tone-warning",
  review_required: "case-tone-warning",
  completed: "case-tone-success",
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<VerificationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getSessions(100)
      .then((data) => { if (active) setSessions(data.sessions); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load sessions."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section style={{ paddingBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="label">Verification</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>Sessions</h1>
          <p style={{ color: "var(--text-secondary)", maxWidth: 700 }}>Every customer capture link that has been created, most recent first.</p>
        </div>
        <Link to="/dashboard/verify-new" className="btn-primary"><Plus size={14} /> New verification</Link>
      </div>

      {error && <div className="api-notice api-notice-error" role="alert" style={{ marginTop: 18 }}>{error}</div>}

      <div className="glass-card" style={{ marginTop: 22, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 28, color: "var(--text-secondary)" }}>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            <Activity size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
            <p>No verification sessions yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                <tr>
                  <th style={{ padding: "12px 24px" }}>Session</th>
                  <th style={{ padding: "12px 24px" }}>Order</th>
                  <th style={{ padding: "12px 24px" }}>Status</th>
                  <th style={{ padding: "12px 24px" }}>Progress</th>
                  <th style={{ padding: "12px 24px" }}>Created</th>
                  <th style={{ padding: "12px 24px" }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.session_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "13px 24px", fontFamily: "var(--font-mono)" }}>{session.session_id}</td>
                    <td style={{ padding: "13px 24px" }}>{session.order_id ?? "Not supplied"}</td>
                    <td style={{ padding: "13px 24px" }}>
                      <span className={`case-pill ${STATUS_TONES[session.status] ?? "case-tone-neutral"}`}>{session.status.replace(/_/g, " ")}</span>
                    </td>
                    <td style={{ padding: "13px 24px" }}>{session.challenges_completed}/{session.challenges_total}</td>
                    <td style={{ padding: "13px 24px" }}>{new Date(session.created_at).toLocaleString()}</td>
                    <td style={{ padding: "13px 24px" }}>{new Date(session.expires_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
