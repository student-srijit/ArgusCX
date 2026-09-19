import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, FileCheck2 } from "lucide-react";
import { getCases, type VerificationCase } from "@/lib/api_cases";

const STATE_TONES: Record<string, string> = {
  VERIFIED: "case-tone-success",
  APPROVED: "case-tone-success",
  REJECTED: "case-tone-danger",
  ESCALATED: "case-tone-warning",
  REVIEW_REQUIRED: "case-tone-warning",
};

export default function CasesListPage() {
  const [cases, setCases] = useState<VerificationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getCases()
      .then((data) => { if (active) setCases(data.cases); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load cases."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section style={{ paddingBottom: 48 }}>
      <p className="label">Verification</p>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>Cases</h1>
      <p style={{ color: "var(--text-secondary)", maxWidth: 700 }}>
        Every verification session that has produced a case record, most recent first.
      </p>

      {error && <div className="api-notice api-notice-error" role="alert" style={{ marginTop: 18 }}>{error}</div>}

      <div className="glass-card" style={{ marginTop: 22, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 28, color: "var(--text-secondary)" }}>Loading cases…</p>
        ) : cases.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            <FileCheck2 size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
            <p>No verification cases yet. Create a verification to get started.</p>
            <Link to="/dashboard/verify-new" className="btn-primary" style={{ marginTop: 14, display: "inline-flex" }}>New verification</Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                <tr>
                  <th style={{ padding: "12px 24px" }}>Case</th>
                  <th style={{ padding: "12px 24px" }}>Order</th>
                  <th style={{ padding: "12px 24px" }}>State</th>
                  <th style={{ padding: "12px 24px" }}>Routing</th>
                  <th style={{ padding: "12px 24px" }}>Category</th>
                  <th style={{ padding: "12px 24px" }}>Created</th>
                  <th style={{ padding: "12px 24px" }} />
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "13px 24px" }}>
                      <Link to={`/dashboard/cases/${encodeURIComponent(item.id)}`} style={{ color: "var(--info)", fontFamily: "var(--font-mono)" }}>{item.id}</Link>
                    </td>
                    <td style={{ padding: "13px 24px" }}>{item.order_id ?? "Not supplied"}</td>
                    <td style={{ padding: "13px 24px" }}>
                      <span className={`case-pill ${STATE_TONES[item.state] ?? "case-tone-neutral"}`}>
                        {item.state === "REVIEW_REQUIRED" && <AlertTriangle size={12} />}
                        {item.state}
                      </span>
                    </td>
                    <td style={{ padding: "13px 24px" }}>{item.routing ?? "Pending"}</td>
                    <td style={{ padding: "13px 24px" }}>{item.category ? item.category.replace(/_/g, " ") : "—"}</td>
                    <td style={{ padding: "13px 24px" }}>{new Date(item.created_at).toLocaleString()}</td>
                    <td style={{ padding: "13px 24px" }}>
                      <Link to={`/dashboard/cases/${encodeURIComponent(item.id)}`} className="btn-ghost" style={{ fontSize: 12 }}>
                        Review <ChevronRight size={13} />
                      </Link>
                    </td>
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
